import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildSystemPrompt } from '@/lib/buildSystemPrompt';
import type { InterviewData } from '@/lib/types';
import { FALLBACK_SYSTEM_PROMPT } from '@/lib/prompts';
import { getInterviewData } from '@/lib/serverInterviewData';
import { checkDuplicateQuestion } from '@/lib/questionDedup';
import { TOTAL_QUESTION_COUNT, MAX_USER_INPUT_LENGTH, CHAT_API_TIMEOUT, MAX_CONTEXT_MESSAGES } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getRecentlyAskedQuestions, recordSessionQuestion } from '@/lib/crossSessionDedup';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: CHAT_API_TIMEOUT,
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
  session_id?: string;
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
    let body: ChatRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      );
    }
    const {
      messages,
      interview_data: clientInterviewData,
      selected_job,
      selected_company,
      question_count = 0,
      is_first = false,
      session_id,
      config,
      resume_text,
    } = body;

    // question_count 범위 검증
    const safeQuestionCount = Math.max(0, Math.min(question_count, TOTAL_QUESTION_COUNT + 10));

    // studentId: 매 요청에서 추출 (middleware가 인증된 요청에 주입)
    const studentId = request.headers.get('x-student-id');

    // 면접 시작 시 사용량 소진
    let usageRemaining: number | undefined;
    if (is_first) {
      if (!studentId) {
        return NextResponse.json(
          { error: '인증이 필요합니다.' },
          { status: 401 }
        );
      }

      const { data: usageResult, error: rpcError } = await supabase
        .rpc('consume_usage', { p_student_id: studentId });

      if (rpcError || usageResult === null || usageResult === undefined) {
        logger.error('[Chat API] Usage RPC error');
        return NextResponse.json(
          { error: '사용량 확인에 실패했습니다.' },
          { status: 500 }
        );
      }

      if (!usageResult.success) {
        const errorCode = usageResult?.error;
        if (errorCode === 'WEEKLY_LIMIT_REACHED') {
          return NextResponse.json(
            { error: '이번 주 면접 횟수를 모두 사용했습니다.', code: 'WEEKLY_LIMIT_REACHED' },
            { status: 429 }
          );
        }
        if (errorCode === 'INACTIVE') {
          return NextResponse.json(
            { error: '비활성화된 계정입니다.', code: 'INACTIVE' },
            { status: 403 }
          );
        }
        return NextResponse.json(
          { error: '사용량 확인에 실패했습니다.' },
          { status: 500 }
        );
      }

      usageRemaining = usageResult.remaining;
      logger.info(`[Chat API] Usage consumed. Remaining: ${usageRemaining}`);
    }

    // Phase 4: 서버사이드 강제 종료 (안전망 — 마무리 턴(12) 이후에만 작동)
    if (safeQuestionCount > TOTAL_QUESTION_COUNT) {
      logger.info(`[Chat API] 면접 종료 (question_count ${safeQuestionCount})`);
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
    const interview_data: InterviewData | undefined = (await getInterviewData()) || clientInterviewData;

    // selected_job 유효성 검사
    if (!selected_job || typeof selected_job !== 'string' || selected_job.trim() === '') {
      return NextResponse.json(
        { error: 'selected_job 필드가 필요합니다.' },
        { status: 400 }
      );
    }

    // messages 유효성 검사
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages 필드가 필요하며 배열 형식이어야 합니다.' },
        { status: 400 }
      );
    }

    // 마지막 사용자 메시지 길이 검증
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg && lastUserMsg.content.length > MAX_USER_INPUT_LENGTH) {
      return NextResponse.json(
        { error: `입력이 너무 깁니다. 최대 ${MAX_USER_INPUT_LENGTH}자까지 입력 가능합니다.` },
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

    // 크로스 세션 중복 방지: Q5-Q10 구간에서 최근 질문 조회
    let recentlyAskedQuestions: string[] = [];
    if (
      studentId &&
      session_id &&
      selected_job &&
      safeQuestionCount >= 5 &&
      safeQuestionCount <= 10
    ) {
      recentlyAskedQuestions = await getRecentlyAskedQuestions(studentId, selected_job);
      if (recentlyAskedQuestions.length > 0) {
        logger.debug(`[Chat API] 크로스 세션 중복 방지: 최근 ${recentlyAskedQuestions.length}개 질문 로드`);
      }
    }

    // 시스템 프롬프트 생성 (Phase 1, 2, 3: 전체 messages 전달)
    let systemPrompt: string;

    try {
      if (interview_data && selected_job && selected_company !== undefined) {
        logger.debug('[Chat API] 동적 시스템 프롬프트 생성');
        systemPrompt = buildSystemPrompt(
          interview_data,
          selected_job,
          selected_company,
          safeQuestionCount,
          resume_text,
          config?.systemPrompt,
          messages, // Phase 1, 2, 3: 전체 메시지 전달 (블랙리스트, 꼬리질문 결정에 사용)
          recentlyAskedQuestions.length > 0 ? recentlyAskedQuestions : undefined
        );
      } else {
        logger.debug('[Chat API] 기본 시스템 프롬프트 사용');
        systemPrompt = config?.systemPrompt || FALLBACK_SYSTEM_PROMPT;
      }
    } catch (error) {
      logger.error('[Chat API] 시스템 프롬프트 생성 오류');
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
      const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
      for (const msg of recentMessages) {
        conversationMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // OpenAI Chat API 호출
    logger.debug('[Chat API] OpenAI API 호출 시작, 메시지 수:', conversationMessages.length);

    const baseTemperature = config?.temperature ?? 0.6;
    const maxTokens = config?.maxTokens ?? 500;

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
        logger.debug('[Chat API] OpenAI API 응답 받음 (시도:', retryCount + 1, ')');
      } catch (openaiError: unknown) {
        logger.error('[Chat API] OpenAI API 오류');
        if (openaiError instanceof OpenAI.APIError) {
          if (openaiError.status === 429) {
            return NextResponse.json(
              { error: 'AI 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.' },
              { status: 429 }
            );
          }
          if (openaiError.status >= 500) {
            return NextResponse.json(
              { error: 'AI 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.' },
              { status: 502 }
            );
          }
        }
        const errorMessage = openaiError instanceof Error ? openaiError.message : '알 수 없는 오류';
        return NextResponse.json(
          { error: `AI 응답 생성 오류: ${errorMessage}` },
          { status: 500 }
        );
      }

      const responseText = completion.choices[0]?.message?.content;

      if (!responseText) {
        logger.error('[Chat API] AI 답변이 비어있음');
        return NextResponse.json(
          { error: 'AI 답변 생성에 실패했습니다. 응답이 비어있습니다.' },
          { status: 500 }
        );
      }

      // 고정 질문(0~4)이면 중복 검사 스킵
      if (safeQuestionCount <= 4 || is_first) {
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
      logger.debug(`[Chat API] 중복 질문 감지 (시도 ${retryCount}/${MAX_DEDUP_RETRIES})`);

      if (retryCount > MAX_DEDUP_RETRIES) {
        // 재시도 한도 초과 → 마지막 응답 그대로 사용
        logger.debug('[Chat API] 재시도 한도 초과, 마지막 응답 사용');
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

    logger.debug('[Chat API] AI 답변 생성 완료, 길이:', assistantMessage.length);

    // 크로스 세션 중복 방지: Q5-Q10 질문 기록 (fire-and-forget)
    if (studentId && session_id && selected_job && safeQuestionCount >= 5 && safeQuestionCount <= 10) {
      const qType = safeQuestionCount <= 8 ? 'job' : 'personality';
      recordSessionQuestion(
        studentId,
        session_id,
        selected_job,
        assistantMessage,
        qType as 'job' | 'personality',
        safeQuestionCount
      ).catch(() => {});
    }

    const latency = Date.now() - startTime;
    logger.debug('[Chat API] 총 응답 시간:', latency, 'ms');

    // 마무리 턴(questionCount >= 12): AI가 종료 인사 후 면접 종료 신호
    const isClosingTurn = safeQuestionCount >= TOTAL_QUESTION_COUNT;

    return NextResponse.json(
      {
        message: assistantMessage,
        role: 'assistant',
        ...(isClosingTurn && { interview_ended: true }),
        ...(usageRemaining !== undefined && { remaining: usageRemaining }),
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
    logger.error('[Chat API] 오류:', error instanceof Error ? error.message : 'unknown');

    if (error instanceof Error) {
      // 타임아웃 에러 분기
      if (error.message.includes('timeout') || error.message.includes('Timeout') || error.message.includes('ETIMEDOUT')) {
        return NextResponse.json(
          { error: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.' },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
