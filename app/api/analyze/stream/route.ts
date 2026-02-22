import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { SUMMARY_ANALYSIS_PROMPT, DETAIL_ANALYSIS_PROMPT, chunkQuestionNumbers, tagConversation } from '@/lib/prompts-stream';
import { analyzeMultipleAnswers } from '@/lib/starAnalyzer';
import type { SSEEventType } from '@/lib/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalyzeStreamRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  selected_job: string;
  selected_company?: string;
}

// SSE 이벤트 전송 헬퍼
function sendSSE(controller: ReadableStreamDefaultController, type: SSEEventType, data: unknown, progress?: number) {
  const event = JSON.stringify({ type, data, progress });
  controller.enqueue(new TextEncoder().encode(`data: ${event}\n\n`));
}

export async function POST(request: NextRequest) {
  try {
    let body: AnalyzeStreamRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: '잘못된 요청 형식입니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { messages, selected_job, selected_company } = body;

    // 유효성 검사
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages 필드가 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!selected_job) {
      return new Response(JSON.stringify({ error: 'selected_job 필드가 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 질문 수 계산 (assistant 메시지 = 면접관 질문)
    const questionCount = messages.filter(m => m.role === 'assistant').length;

    // 대화 로그 태깅
    const taggedConversation = tagConversation(messages);

    // 지원자 답변만 추출 (STAR 분석용)
    const userAnswers = messages.filter(m => m.role === 'user').map(m => m.content);

    // ReadableStream으로 SSE 구현
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. 분석 시작
          sendSSE(controller, 'start', { message: '면접 분석을 시작합니다...' }, 5);

          // 2. STAR 분석 (규칙 기반)
          let starAnalysisResult = null;
          try {
            starAnalysisResult = analyzeMultipleAnswers(userAnswers);
            sendSSE(controller, 'star_check', {
              averageScore: starAnalysisResult.averageScore,
              bestAnswer: starAnalysisResult.bestAnswer,
              worstAnswer: starAnalysisResult.worstAnswer,
            }, 15);
          } catch (err) {
            logger.warn('STAR 분석 스킵:', err);
            sendSSE(controller, 'star_check', { skipped: true }, 15);
          }

          // 3. 종합 분석 (GPT)
          sendSSE(controller, 'summary_progress', { message: '종합 평가 분석 중...' }, 20);

          const summaryPrompt = SUMMARY_ANALYSIS_PROMPT(selected_job, questionCount, selected_company);
          const summaryUserPrompt = `다음은 '${selected_job}' 직군 지원자의 면접 대화 로그입니다. 종합 분석을 수행해주세요.

[면접 대화 로그]
${taggedConversation}

반드시 유효한 JSON만 반환하세요.`;

          let summaryResult = null;
          try {
            const summaryResponse = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: summaryPrompt },
                { role: 'user', content: summaryUserPrompt },
              ],
              temperature: 0.3,
              max_tokens: 8000,
              response_format: { type: 'json_object' },
            });

            const finishReason = summaryResponse.choices[0].finish_reason;
            if (finishReason === 'length') {
              logger.warn('[분석] 종합 분석 토큰 한도 도달 — 응답이 잘렸을 수 있음');
            }

            const summaryText = summaryResponse.choices[0].message.content;
            if (summaryText) {
              summaryResult = JSON.parse(summaryText);

              // STAR 분석 결과를 병합
              if (starAnalysisResult) {
                summaryResult.star_analysis = {
                  situation: starAnalysisResult.averageScore.situation,
                  task: starAnalysisResult.averageScore.task,
                  action: starAnalysisResult.averageScore.action,
                  result: starAnalysisResult.averageScore.result,
                };
              }

              sendSSE(controller, 'summary', summaryResult, 40);
            }
          } catch (err) {
            logger.error('종합 분석 오류:', err);
            sendSSE(controller, 'error', { message: '종합 분석 중 오류가 발생했습니다.' }, 40);
            controller.close();
            return;
          }

          // 4. 상세 분석 (질문별, 3개씩 분할 - 토큰 초과 방지)
          const questionChunks = chunkQuestionNumbers(questionCount, 3);
          const allDetailedFeedback: unknown[] = [];
          const analyzedQuestions = new Set<number>(); // 분석 완료된 질문 추적

          logger.debug(`[분석] 총 ${questionCount}개 질문, ${questionChunks.length}개 청크로 분할:`, questionChunks);

          for (let chunkIndex = 0; chunkIndex < questionChunks.length; chunkIndex++) {
            const questionNumbers = questionChunks[chunkIndex];
            const progress = 40 + Math.round((chunkIndex / questionChunks.length) * 50);

            sendSSE(controller, 'detail_progress', {
              message: `Q${questionNumbers[0]}~Q${questionNumbers[questionNumbers.length - 1]} 분석 중...`,
              chunk_index: chunkIndex,
              question_numbers: questionNumbers,
            }, progress);

            const detailPrompt = DETAIL_ANALYSIS_PROMPT(selected_job, questionNumbers, selected_company);
            const detailUserPrompt = `다음은 면접 대화 로그입니다. Q${questionNumbers[0]}~Q${questionNumbers[questionNumbers.length - 1]}번 질문에 대한 상세 분석을 수행해주세요.

[면접 대화 로그]
${taggedConversation}

반드시 유효한 JSON만 반환하세요. detailed_feedback 배열에 정확히 ${questionNumbers.length}개의 질문 분석을 포함해야 합니다.`;

            // 최대 2번 재시도
            let retryCount = 0;
            const maxRetries = 2;
            let chunkFeedback: unknown[] = [];

            while (retryCount <= maxRetries) {
              try {
                const detailResponse = await openai.chat.completions.create({
                  model: 'gpt-4o',
                  messages: [
                    { role: 'system', content: detailPrompt },
                    { role: 'user', content: detailUserPrompt },
                  ],
                  temperature: 0.3,
                  max_tokens: 8000, // 토큰 충분히 확보
                  response_format: { type: 'json_object' },
                });

                if (detailResponse.choices[0].finish_reason === 'length') {
                  logger.warn(`[분석] 청크 ${chunkIndex} 토큰 한도 도달 — 응답이 잘렸을 수 있음`);
                }

                const detailText = detailResponse.choices[0].message.content;
                logger.debug(`[분석] 청크 ${chunkIndex} 응답 길이:`, detailText?.length || 0);

                if (detailText) {
                  const detailResult = JSON.parse(detailText);

                  // detailed_feedback 배열 찾기 (다양한 키 이름 지원)
                  const feedbackArray = detailResult.detailed_feedback
                    || detailResult.detailedFeedback
                    || detailResult.feedback
                    || [];

                  if (Array.isArray(feedbackArray) && feedbackArray.length > 0) {
                    chunkFeedback = feedbackArray;

                    // 분석된 질문 번호 추적
                    feedbackArray.forEach((fb: any) => {
                      if (fb.question_number) {
                        analyzedQuestions.add(fb.question_number);
                      }
                    });

                    logger.debug(`[분석] 청크 ${chunkIndex} 성공: ${feedbackArray.length}개 질문 분석됨`);
                    break; // 성공 시 루프 탈출
                  } else {
                    logger.warn(`[분석] 청크 ${chunkIndex} 응답에 피드백 배열 없음, 재시도 ${retryCount + 1}/${maxRetries}`);
                    retryCount++;
                  }
                } else {
                  logger.warn(`[분석] 청크 ${chunkIndex} 빈 응답, 재시도 ${retryCount + 1}/${maxRetries}`);
                  retryCount++;
                }
              } catch (err) {
                logger.error(`[분석] 청크 ${chunkIndex} 오류 (재시도 ${retryCount + 1}/${maxRetries}):`, err);
                retryCount++;

                if (retryCount > maxRetries) {
                  break;
                }
                // 재시도 전 짧은 대기
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }

            // 결과 추가
            if (chunkFeedback.length > 0) {
              allDetailedFeedback.push(...chunkFeedback);
            }

            sendSSE(controller, 'detail', {
              chunk_index: chunkIndex,
              question_numbers: questionNumbers,
              feedback: chunkFeedback,
              error: chunkFeedback.length === 0,
            }, progress + 10);
          }

          // 누락된 질문 확인 및 로깅
          const missingQuestions: number[] = [];
          for (let q = 1; q <= questionCount; q++) {
            if (!analyzedQuestions.has(q)) {
              missingQuestions.push(q);
            }
          }

          if (missingQuestions.length > 0) {
            logger.warn(`[분석] ⚠️ 누락된 질문: Q${missingQuestions.join(', Q')}`);
          } else {
            logger.debug(`[분석] ✅ 모든 ${questionCount}개 질문 분석 완료`);
          }

          // 5. 완료 - 질문 번호 순으로 정렬
          const sortedFeedback = [...allDetailedFeedback].sort((a: any, b: any) => {
            return (a.question_number || 0) - (b.question_number || 0);
          });

          const finalResult = {
            ...summaryResult,
            detailed_feedback: sortedFeedback,
            _meta: {
              total_questions: questionCount,
              analyzed_questions: sortedFeedback.length,
              missing_questions: missingQuestions,
            },
          };

          logger.debug(`[분석] 최종 결과: ${sortedFeedback.length}/${questionCount}개 질문 분석됨`);
          sendSSE(controller, 'complete', finalResult, 100);
          controller.close();
        } catch (err) {
          logger.error('스트리밍 분석 오류:', err);
          sendSSE(controller, 'error', { message: '분석 중 오류가 발생했습니다.' }, 0);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Analyze Stream API 오류:', error);
    return new Response(
      JSON.stringify({ error: '서버 오류가 발생했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
