import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildSystemPrompt } from '@/lib/buildSystemPrompt';
import type { InterviewData } from '@/lib/types';
import { FALLBACK_SYSTEM_PROMPT } from '@/lib/prompts';
import { getInterviewData } from '@/lib/serverInterviewData';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  interview_data?: InterviewData;
  selected_job?: string;
  selected_company?: string;
  question_count?: number;
  is_first?: boolean;
  config?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };
  resume_text?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: ChatRequest = await request.json();
    const {
      messages,
      interview_data: clientInterviewData,
      selected_job,
      selected_company,
      question_count = 0,
      is_first = false,
      config,
      resume_text,
    } = body;

    // 서버에서 직접 로드 (클라이언트 데이터는 fallback)
    const interview_data: InterviewData | undefined = getInterviewData() || clientInterviewData;

    // messages 유효성 검사
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages 필드가 필요하며 배열 형식이어야 합니다.' },
        { status: 400 }
      );
    }

    // API Key 확인
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // 시스템 프롬프트 생성
    let systemPrompt: string;
    
    try {
      if (interview_data && selected_job && selected_company !== undefined) {
        // build_system_prompt를 사용하여 동적 프롬프트 생성
        // Override가 있어도 고정 질문(0~4번)과 자소서 규칙은 유지됨
        console.log('[Chat API] 동적 시스템 프롬프트 생성:', { 
          selected_job, 
          selected_company, 
          question_count,
          hasOverride: !!config?.systemPrompt 
        });
        systemPrompt = buildSystemPrompt(
          interview_data,
          selected_job,
          selected_company,
          question_count,
          resume_text,
          config?.systemPrompt // Override 프롬프트 전달 (있으면 페르소나/대화 규칙 부분만 대체)
        );
      } else {
        // 기본 시스템 프롬프트 (면접관 페르소나)
        console.log('[Chat API] 기본 시스템 프롬프트 사용');
        systemPrompt = config?.systemPrompt || FALLBACK_SYSTEM_PROMPT;
      }
    } catch (error) {
      console.error('[Chat API] 시스템 프롬프트 생성 오류:', error);
      // 기본 시스템 프롬프트로 폴백
      systemPrompt = config?.systemPrompt || FALLBACK_SYSTEM_PROMPT;
    }

    // 메시지 배열 구성
    const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (is_first) {
      // 첫 면접 시작 시: 질문 가이드에 따라 정확히 질문하도록 지시
      conversationMessages.push({
        role: 'user',
        content: '면접관님, 면접을 시작해주세요. 시스템 프롬프트의 시나리오 통제 지시사항을 정확히 따르세요.',
      });
    } else {
      // 최근 10개 메시지만 사용 (컨텍스트 길이 제한)
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        conversationMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // OpenAI Chat API 호출
    console.log('[Chat API] OpenAI API 호출 시작, 메시지 수:', conversationMessages.length);
    
    // 개발자 모드에서 config가 있으면 적용
    const temperature = config?.temperature ?? 0.9;
    const maxTokens = config?.maxTokens ?? 500;
    
    console.log('[Chat API] API 파라미터:', { temperature, maxTokens, hasCustomSystemPrompt: !!config?.systemPrompt });
    
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: conversationMessages,
        temperature: temperature,
        max_tokens: maxTokens,
      });
      console.log('[Chat API] OpenAI API 응답 받음');
    } catch (openaiError: any) {
      console.error('[Chat API] OpenAI API 오류:', openaiError);
      return NextResponse.json(
        { error: `OpenAI API 오류: ${openaiError.message || '알 수 없는 오류'}` },
        { status: 500 }
      );
    }

    // 답변 텍스트 추출
    const assistantMessage = completion.choices[0]?.message?.content;

    if (!assistantMessage) {
      console.error('[Chat API] AI 답변이 비어있음:', completion);
      return NextResponse.json(
        { error: 'AI 답변 생성에 실패했습니다. 응답이 비어있습니다.' },
        { status: 500 }
      );
    }

    console.log('[Chat API] AI 답변 생성 완료, 길이:', assistantMessage.length);

    const latency = Date.now() - startTime;
    console.log('[Chat API] 총 응답 시간:', latency, 'ms');

    // 답변 텍스트 반환 (개발자 모드용 메타데이터 포함)
    return NextResponse.json(
      {
        message: assistantMessage,
        role: 'assistant',
        ...(config && {
          _meta: {
            latency,
            temperature,
            maxTokens,
            usedTokens: completion.usage?.total_tokens,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
          },
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Chat API 오류:', error);

    // OpenAI API 오류 처리
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `채팅 생성 실패: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
