'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { Message } from '@/lib/types';
import type { StreamingReportState, GameInterviewReport, PremiumFeedbackItem, SSEEventType } from '@/lib/types';

interface UseStreamingAnalysisOptions {
  messages: Message[];
  selectedJob: string;
  selectedCompany: string;
  questionCount: number;
  isInterviewStarted: boolean;
  setIsInterviewStarted: (v: boolean) => void;
}

export function useStreamingAnalysis({
  messages,
  selectedJob,
  selectedCompany,
  questionCount,
  isInterviewStarted,
  setIsInterviewStarted,
}: UseStreamingAnalysisOptions) {
  const { authHeaders } = useAuth();
  const [interviewReport, setInterviewReport] = useState<GameInterviewReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamingState, setStreamingState] = useState<StreamingReportState>({
    isStreaming: false,
    progress: 0,
    currentStep: '',
    partialReport: null,
  });

  const startAnalysis = useCallback(async () => {
    if (!isInterviewStarted || messages.length === 0 || questionCount < 5) {
      throw new Error('최소 5개의 질문에 답변해야 분석할 수 있습니다.');
    }

    setIsAnalyzing(true);
    setStreamingState({
      isStreaming: true,
      progress: 0,
      currentStep: '분석 준비 중...',
      partialReport: null,
    });

    const ANALYSIS_TIMEOUT = 180_000; // 분석 최대 3분
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT);

      const response = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          messages: messages.map(({ role, content }) => ({ role, content })),
          selected_job: selectedJob,
          selected_company: selectedCompany,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('스트리밍 분석 API 요청 실패');
      }

      reader = response.body?.getReader() || null;
      if (!reader) {
        throw new Error('스트림을 읽을 수 없습니다.');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedFeedback: PremiumFeedbackItem[] = [];
      let summaryData: Partial<GameInterviewReport> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6));
              const { type, data, progress } = eventData as {
                type: SSEEventType;
                data: unknown;
                progress?: number;
              };

              switch (type) {
                case 'start':
                  setStreamingState(prev => ({
                    ...prev,
                    progress: progress || 5,
                    currentStep: '면접 분석 시작...',
                  }));
                  break;

                case 'star_check':
                  setStreamingState(prev => ({
                    ...prev,
                    progress: progress || 15,
                    currentStep: 'STAR 구조 분석 중...',
                  }));
                  break;

                case 'summary_progress':
                  setStreamingState(prev => ({
                    ...prev,
                    progress: progress || 20,
                    currentStep: '종합 평가 분석 중...',
                  }));
                  break;

                case 'summary':
                  summaryData = data as Partial<GameInterviewReport>;
                  setStreamingState(prev => ({
                    ...prev,
                    progress: progress || 40,
                    currentStep: '종합 분석 완료, 상세 분석 시작...',
                    partialReport: {
                      ...summaryData,
                      detailed_feedback: accumulatedFeedback,
                    } as GameInterviewReport,
                  }));
                  break;

                case 'detail_progress': {
                  const detailProgress = data as { message: string; chunk_index: number; question_numbers: number[] };
                  setStreamingState(prev => ({
                    ...prev,
                    progress: progress || 50,
                    currentStep: detailProgress.message,
                  }));
                  break;
                }

                case 'detail': {
                  const detailData = data as {
                    chunk_index: number;
                    question_numbers: number[];
                    feedback: PremiumFeedbackItem[];
                    error?: boolean;
                  };
                  if (detailData.feedback && Array.isArray(detailData.feedback)) {
                    accumulatedFeedback = [...accumulatedFeedback, ...detailData.feedback];
                    setStreamingState(prev => ({
                      ...prev,
                      progress: progress || 60,
                      currentStep: `Q${detailData.question_numbers[0]}~Q${detailData.question_numbers[detailData.question_numbers.length - 1]} 분석 완료`,
                      partialReport: summaryData ? {
                        ...summaryData,
                        detailed_feedback: accumulatedFeedback,
                      } as GameInterviewReport : null,
                    }));
                  }
                  break;
                }

                case 'complete': {
                  const completeData = data as GameInterviewReport;

                  const totalQs = messages.filter(m => m.role === 'assistant').length;
                  const analyzedQs = new Set(
                    (completeData.detailed_feedback || []).map(fb => fb.question_number)
                  );
                  const missingQs: number[] = [];
                  for (let q = 1; q <= totalQs; q++) {
                    if (!analyzedQs.has(q)) {
                      missingQs.push(q);
                    }
                  }

                  if (missingQs.length > 0) {
                    console.warn(`[분석 완료] 누락된 질문: Q${missingQs.join(', Q')}`);
                  }

                  setInterviewReport(completeData);
                  setStreamingState({
                    isStreaming: false,
                    progress: 100,
                    currentStep: missingQs.length > 0
                      ? `분석 완료 (${totalQs - missingQs.length}/${totalQs}개 질문)`
                      : '분석 완료!',
                    partialReport: null,
                    missingQuestions: missingQs.length > 0 ? missingQs : undefined,
                    totalQuestions: totalQs,
                  });
                  setIsInterviewStarted(false);
                  break;
                }

                case 'error': {
                  const errorData = data as { message: string };
                  throw new Error(errorData.message || '분석 중 오류 발생');
                }
              }
            } catch (parseError) {
              if (parseError instanceof Error && parseError.message.includes('분석 중 오류')) {
                throw parseError;
              }
              console.warn('SSE 이벤트 파싱 오류:', parseError);
            }
          }
        }
      }
    } catch (error) {
      // 스트림 리더 정리
      try { reader?.cancel(); } catch { /* ignore */ }

      console.error('면접 분석 오류:', error);
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        currentStep: isTimeout ? '분석 시간 초과' : '오류 발생',
      }));
      if (isTimeout) {
        throw new Error('분석 시간이 초과되었습니다. 다시 시도해주세요.');
      }
      throw error; // 상위에서 toast로 처리
    } finally {
      setIsAnalyzing(false);
    }
  }, [isInterviewStarted, messages, questionCount, selectedJob, selectedCompany, setIsInterviewStarted, authHeaders]);

  const retryAnalysis = useCallback(() => {
    setInterviewReport(null);
    setIsInterviewStarted(true);
    startAnalysis().catch((error) => {
      const msg = error instanceof Error ? error.message : '면접 분석에 실패했습니다.';
      toast.error(msg);
    });
  }, [startAnalysis, setIsInterviewStarted]);

  const resetAnalysis = useCallback(() => {
    setInterviewReport(null);
    setIsAnalyzing(false);
    setStreamingState({
      isStreaming: false,
      progress: 0,
      currentStep: '',
      partialReport: null,
    });
  }, []);

  return {
    interviewReport,
    isAnalyzing,
    streamingState,
    startAnalysis,
    retryAnalysis,
    resetAnalysis,
  };
}
