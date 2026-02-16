import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildSystemPrompt } from '@/lib/buildSystemPrompt';
import type { InterviewData } from '@/lib/types';
import { FALLBACK_SYSTEM_PROMPT } from '@/lib/prompts';
import { getInterviewData } from '@/lib/serverInterviewData';
import { checkDuplicateQuestion } from '@/lib/questionDedup';
import { TOTAL_QUESTION_COUNT } from '@/lib/constants';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 면접 종료 메시지
const INTERVIEW_END_MESSAGE = '면접이 종료되었습니다. 오늘 면접에 참여해주셔서 감사합니다. 수고하셨습니다.';

// 중복 검증 최대 재시도 횟수
const MAX_DEDUP_RETRIES = 2;

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

    // Phase 4: 서버사이드 강제 종료
    if (question_count >= TOTAL_QUESTION_COUNT) {
      console.log(`[Chat API] 면접 종료 (question_count ${question_count} >= ${TOTAL_QUESTION_COUNT})`);
      return NextResponse.json(
        {
          message: INTERVIEW_END_MESSAGE,
          role: 'assistant',
          interview_ended: true,
        },
        { status: 200 }
      );
    }

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

    // 시스템 프롬프트 생성 (Phase 1, 2, 3: 전체 messages 전달)
    let systemPrompt: string;

    try {
      if (interview_data && selected_job && selected_company !== undefined) {
        console.log('[Chat API] 동적 시스템 프롬프트 생성:', {
          selected_job,
          selected_company,
          question_count,
          hasOverride: !!config?.systemPrompt,
          totalMessages: messages.length,
        });
        systemPrompt = buildSystemPrompt(
          interview_data,
          selected_job,
          selected_company,
          question_count,
          resume_text,
          config?.systemPrompt,
          messages // Phase 1, 2, 3: 전체 메시지 전달 (블랙리스트, 꼬리질문 결정에 사용)
        );
      } else {
        console.log('[Chat API] 기본 시스템 프롬프트 사용');
        systemPrompt = config?.systemPrompt || FALLBACK_SYSTEM_PROMPT;
      }
    } catch (error) {
      console.error('[Chat API] 시스템 프롬프트 생성 오류:', error);
      systemPrompt = config?.systemPrompt || FALLBACK_SYSTEM_PROMPT;
    }

    // 메시지 배열 구성
    const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (is_first) {
      conversationMessages.push({
        role: 'user',
        content: '면접관님, 면접을 시작해주세요. 시스템 프롬프트의 시나리오 통제 지시사항을 정확히 따르세요.',
      });
    } else {
      // Phase 5: 슬라이딩 윈도우 확대 (-10 → -16, 약 8턴)
      const recentMessages = messages.slice(-16);
      for (const msg of recentMessages) {
        conversationMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // OpenAI Chat API 호출
    console.log('[Chat API] OpenAI API 호출 시작, 메시지 수:', conversationMessages.length);

    const baseTemperature = config?.temperature ?? 0.9;
    const maxTokens = config?.maxTokens ?? 500;

    console.log('[Chat API] API 파라미터:', { temperature: baseTemperature, maxTokens, hasCustomSystemPrompt: !!config?.systemPrompt });

    // Phase 1: 중복 검증 + 재시도 루프
    let assistantMessage: string | null = null;
    let finalCompletion: OpenAI.Chat.Completions.ChatCompletion | null = null;
    let retryCount = 0;
    let currentTemperature = baseTemperature;

    while (retryCount <= MAX_DEDUP_RETRIES) {
      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: conversationMessages,
          temperature: currentTemperature,
          max_tokens: maxTokens,
        });
        console.log('[Chat API] OpenAI API 응답 받음 (시도:', retryCount + 1, ')');
      } catch (openaiError: unknown) {
        const errorMessage = openaiError instanceof Error ? openaiError.message : '알 수 없는 오류';
        console.error('[Chat API] OpenAI API 오류:', openaiError);
        return NextResponse.json(
          { error: `OpenAI API 오류: ${errorMessage}` },
          { status: 500 }
        );
      }

      const responseText = completion.choices[0]?.message?.content;

      if (!responseText) {
        console.error('[Chat API] AI 답변이 비어있음:', completion);
        return NextResponse.json(
          { error: 'AI 답변 생성에 실패했습니다. 응답이 비어있습니다.' },
          { status: 500 }
        );
      }

      // 고정 질문(0~4)이면 중복 검사 스킵
      if (question_count <= 4 || is_first) {
        assistantMessage = responseText;
        finalCompletion = completion;
        break;
      }

      // Phase 1: 중복 질문 검사 (전체 messages 사용)
      const duplicatedWith = checkDuplicateQuestion(responseText, messages);

      if (!duplicatedWith) {
        // 중복 없음 → 사용
        assistantMessage = responseText;
        finalCompletion = completion;
        break;
      }

      // 중복 감지 → 재시도
      retryCount++;
      console.log(`[Chat API] 중복 질문 감지 (시도 ${retryCount}/${MAX_DEDUP_RETRIES}):`, duplicatedWith);

      if (retryCount > MAX_DEDUP_RETRIES) {
        // 재시도 한도 초과 → 마지막 응답 그대로 사용
        console.log('[Chat API] 재시도 한도 초과, 마지막 응답 사용');
        assistantMessage = responseText;
        finalCompletion = completion;
        break;
      }

      // 재시도: temperature 증가 + 중복 경고 메시지 주입
      currentTemperature = Math.min(baseTemperature + 0.15 * retryCount, 1.5);

      // 시스템 프롬프트에 중복 경고 추가
      const warningMsg = `\n\n⚠️ [중복 방지 경고] 방금 생성한 질문 "${duplicatedWith}"은(는) 이전에 이미 사용된 질문과 유사합니다. 반드시 완전히 다른 질문을 하세요. 동일한 키워드나 주제를 사용하지 마세요.`;
      conversationMessages[0] = {
        role: 'system',
        content: systemPrompt + warningMsg,
      };
    }

    if (!assistantMessage || !finalCompletion) {
      return NextResponse.json(
        { error: 'AI 답변 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    console.log('[Chat API] AI 답변 생성 완료, 길이:', assistantMessage.length, retryCount > 0 ? `(재시도 ${retryCount}회)` : '');

    const latency = Date.now() - startTime;
    console.log('[Chat API] 총 응답 시간:', latency, 'ms');

    return NextResponse.json(
      {
        message: assistantMessage,
        role: 'assistant',
        ...(config && {
          _meta: {
            latency,
            temperature: currentTemperature,
            maxTokens,
            usedTokens: finalCompletion.usage?.total_tokens,
            promptTokens: finalCompletion.usage?.prompt_tokens,
            completionTokens: finalCompletion.usage?.completion_tokens,
            dedupRetries: retryCount,
          },
        }),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Chat API 오류:', error);

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
