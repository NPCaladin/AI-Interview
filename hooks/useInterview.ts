'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useDevMode } from '@/contexts/DevModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPhase, generateId } from '@/lib/utils';
import type { InterviewData } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { TOTAL_QUESTION_COUNT, MAX_USER_INPUT_LENGTH, CLIENT_FETCH_TIMEOUT, INACTIVITY_WARNING_MS, INACTIVITY_AUTO_END_MS } from '@/lib/constants';

interface UseInterviewOptions {
  sttModel: 'OpenAI Whisper' | 'Daglo';
  updateAudioUrl: (url: string) => void;
  clearAudioUrl: () => void;
}

export function useInterview({ sttModel, updateAudioUrl, clearAudioUrl }: UseInterviewOptions) {
  const { isDevMode, config, addDebugData } = useDevMode();
  const { authHeaders, updateRemaining, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [questionCount, setQuestionCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('intro');
  const [interviewData, setInterviewData] = useState<InterviewData | null>(null);
  const [resumeText, setResumeText] = useState<string>('');
  const [timeoutModalType, setTimeoutModalType] = useState<'warning' | 'final' | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestingRef = useRef(false); // 더블클릭 방지용 ref (state보다 즉시 반영)
  const ttsSeqRef = useRef(0); // TTS 요청 순서 관리 (구버전 응답 무시용)
  const inactivityWarningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 진행 중인 요청 취소
  const cancelPendingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // 무응답 타이머 초기화 + 열린 모달도 닫기
  const clearInactivityTimer = useCallback(() => {
    if (inactivityWarningRef.current) {
      clearTimeout(inactivityWarningRef.current);
      inactivityWarningRef.current = null;
    }
    if (inactivityEndRef.current) {
      clearTimeout(inactivityEndRef.current);
      inactivityEndRef.current = null;
    }
    setTimeoutModalType(null);
  }, []);

  // 무응답 타이머 시작 (AI 질문 후 호출)
  // 3분: warning 모달, 4분: final 모달 (강제 종료 대신 사용자 선택)
  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityWarningRef.current = setTimeout(() => {
      setTimeoutModalType('warning');
    }, INACTIVITY_WARNING_MS);
    inactivityEndRef.current = setTimeout(() => {
      setTimeoutModalType('final');
    }, INACTIVITY_AUTO_END_MS);
  }, [clearInactivityTimer]);

  // 모달 "계속하기" — 타이머를 처음부터 재시작
  const handleTimeoutContinue = useCallback(() => {
    startInactivityTimer();
  }, [startInactivityTimer]);

  // 모달 "지금 분석하기" — 면접 종료 (분석 버튼은 사용자가 직접 클릭)
  const handleTimeoutEnd = useCallback(() => {
    clearInactivityTimer();
    setIsInterviewStarted(false);
    setIsLoading(false);
  }, [clearInactivityTimer]);

  // 타임아웃 + AbortController가 적용된 fetch (auth 헤더 자동 주입)
  const fetchWithTimeout = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT);

    try {
      const existingHeaders = options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : (options.headers as Record<string, string>) || {};

      const response = await fetch(url, {
        ...options,
        headers: {
          ...existingHeaders,
          ...authHeaders(),
        },
        signal: controller.signal,
      });

      // 401 응답 시 자동 로그아웃 + 상태 초기화
      if (response.status === 401) {
        setMessages([]);
        setIsInterviewStarted(false);
        setQuestionCount(0);
        setCurrentPhase('intro');
        logout();
        toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
        throw new Error('인증이 만료되었습니다.');
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
      abortControllerRef.current = null;
    }
  }, [authHeaders, logout]);

  // TTS 요청 + 지수 백오프 재시도 (최대 2회, 1s → 2s)
  // seqId: ttsSeqRef 값. 재시도 도중 새 요청이 오면 구버전 응답 무시
  const playTtsWithRetry = useCallback(async (text: string, seqId: number): Promise<void> => {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s
      }
      const controller = new AbortController();
      const ttsTimeout = setTimeout(() => controller.abort(), 15000);
      try {
        const r = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (ttsSeqRef.current !== seqId) return; // 구버전 응답 무시
        if (!r.ok) {
          if (attempt < MAX_RETRIES) continue; // 5xx 등 → 재시도
          return; // 최종 실패는 비치명적 (텍스트는 이미 표시됨)
        }
        const blob = await r.blob();
        if (ttsSeqRef.current !== seqId) return;
        updateAudioUrl(URL.createObjectURL(blob));
        return; // 성공
      } catch (e) {
        if (ttsSeqRef.current !== seqId) return;
        if (e instanceof DOMException && e.name === 'AbortError') return; // 타임아웃은 재시도 안함
        if (attempt < MAX_RETRIES) continue;
        // 최종 실패: 비치명적, 텍스트는 이미 화면에 표시됨
      } finally {
        clearTimeout(ttsTimeout);
      }
    }
  }, [authHeaders, updateAudioUrl]);

  // interview_data.json 로드
  useEffect(() => {
    const loadInterviewData = async () => {
      try {
        const response = await fetch('/interview_data.json');
        if (response.ok) {
          const data = await response.json();
          setInterviewData(data);
        } else {
          console.warn('interview_data.json을 로드할 수 없습니다. 기본 설정으로 진행합니다.');
        }
      } catch (error) {
        console.error('면접 데이터 로드 오류:', error);
      }
    };
    loadInterviewData();
  }, []);

  // 면접 시작
  const startInterview = useCallback(async () => {
    if (isInterviewStarted || !selectedJob || !selectedCompany) return;
    if (isLoading || isRequestingRef.current) return; // 동시 요청 방지

    isRequestingRef.current = true;
    cancelPendingRequest();
    clearAudioUrl();
    setIsInterviewStarted(true);
    setIsLoading(true);
    setQuestionCount(0);
    setCurrentPhase('intro');

    try {
      const requestBody = {
        messages: [],
        interview_data: interviewData,
        selected_job: selectedJob,
        selected_company: selectedCompany,
        question_count: 0,
        is_first: true,
        ...(isDevMode && { config }),
        resume_text: resumeText || undefined,
      };

      const requestStartTime = Date.now();

      const chatResponse = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!chatResponse.ok) {
        let errorData;
        try { errorData = await chatResponse.json(); } catch { errorData = {}; }
        throw new Error(errorData.error || 'Chat API 요청 실패');
      }

      let chatData;
      try {
        chatData = await chatResponse.json();
      } catch {
        throw new Error('서버 응답을 파싱할 수 없습니다.');
      }

      if (!chatData.message) {
        throw new Error('AI 답변이 비어있습니다.');
      }

      // 사용량 갱신
      if (chatData.remaining !== undefined) {
        updateRemaining(chatData.remaining);
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: chatData.message,
      };

      setMessages([assistantMessage]);
      setQuestionCount(1);
      setCurrentPhase(getCurrentPhase(1));
      startInactivityTimer(); // AI 첫 질문 후 무응답 타이머 시작

      if (isDevMode) {
        const latency = chatData._meta?.latency || (Date.now() - requestStartTime);
        addDebugData({ latency, requestBody, responseBody: chatData });
      }

      // TTS 비동기 백그라운드 재생 (chat 완료 즉시 UI 해제, 재시도 포함)
      const ttsSeqId = ++ttsSeqRef.current;
      playTtsWithRetry(chatData.message, ttsSeqId);
    } catch (error) {
      setIsInterviewStarted(false); // 실패 시 상태 복원
      clearInactivityTimer();
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('요청 시간이 초과되었습니다. 다시 시도해주세요.');
        return;
      }
      console.error('면접 시작 오류:', error);
      throw error; // 상위에서 toast로 처리
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [isInterviewStarted, isLoading, selectedJob, selectedCompany, interviewData, isDevMode, config, resumeText, addDebugData, clearAudioUrl, cancelPendingRequest, fetchWithTimeout, updateRemaining, startInactivityTimer, clearInactivityTimer, playTtsWithRetry]);

  // 메시지 전송
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }
    if (isLoading || isRequestingRef.current) return; // 동시 요청 방지

    // 입력 길이 검증 — isRequestingRef 설정 전에 해야 finally가 실행됨
    if (userMessage.length > MAX_USER_INPUT_LENGTH) {
      throw new Error(`입력이 너무 깁니다. 최대 ${MAX_USER_INPUT_LENGTH}자까지 입력 가능합니다.`);
    }

    clearInactivityTimer(); // 사용자가 응답 시작 → 타이머 즉시 중단
    isRequestingRef.current = true;

    cancelPendingRequest();

    const newUserMessage: Message = {
      id: generateId(),
      role: 'user',
      content: userMessage,
    };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const requestBody = {
        messages: updatedMessages.map(({ role, content }) => ({ role, content })),
        interview_data: interviewData,
        selected_job: selectedJob,
        selected_company: selectedCompany,
        question_count: questionCount,
        is_first: false,
        ...(isDevMode && { config }),
        resume_text: resumeText || undefined,
      };

      const requestStartTime = Date.now();

      const chatResponse = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!chatResponse.ok) {
        let errorData;
        try {
          errorData = await chatResponse.json();
        } catch {
          errorData = { error: `HTTP ${chatResponse.status} 오류` };
        }
        throw new Error(errorData.error || `Chat API 요청 실패 (${chatResponse.status})`);
      }

      let chatData;
      try {
        chatData = await chatResponse.json();
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        throw new Error('서버 응답을 파싱할 수 없습니다.');
      }

      if (isDevMode) {
        const latency = chatData._meta?.latency || (Date.now() - requestStartTime);
        addDebugData({ latency, requestBody, responseBody: chatData });
      }

      if (chatData.error) {
        throw new Error(chatData.error);
      }

      if (!chatData.message) {
        throw new Error('AI 답변이 비어있습니다.');
      }

      // 사용량 갱신 (sendMessage)
      if (chatData.remaining !== undefined) {
        updateRemaining(chatData.remaining);
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: chatData.message,
      };

      const newQuestionCount = questionCount + 1;
      setMessages([...updatedMessages, assistantMessage]);
      setQuestionCount(newQuestionCount);
      setCurrentPhase(getCurrentPhase(newQuestionCount));

      // Phase 4: 서버에서 면접 종료 신호를 받았거나 클라이언트에서 한도 도달
      if (chatData.interview_ended || newQuestionCount >= TOTAL_QUESTION_COUNT) {
        setIsInterviewStarted(false);
        clearInactivityTimer();
        toast.success('면접이 종료되었습니다. 분석을 시작하세요.');
      } else {
        startInactivityTimer(); // AI 다음 질문 후 무응답 타이머 재시작
      }

      // TTS 비동기 백그라운드 재생 (chat 완료 즉시 UI 해제, 재시도 포함)
      const ttsSeqId = ++ttsSeqRef.current;
      playTtsWithRetry(chatData.message, ttsSeqId);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('요청 시간이 초과되었습니다. 다시 시도해주세요.');
        return;
      }
      throw error; // 상위에서 toast로 처리
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [isInterviewStarted, isLoading, messages, interviewData, selectedJob, selectedCompany, questionCount, isDevMode, config, resumeText, addDebugData, cancelPendingRequest, fetchWithTimeout, updateRemaining, startInactivityTimer, clearInactivityTimer, playTtsWithRetry]);

  // 오디오 입력 처리
  const handleAudioInput = useCallback(async (audioBlob: Blob) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }
    if (isLoading) return; // 동시 요청 방지

    clearInactivityTimer(); // 마이크 버튼 누름 → 타이머 즉시 중단
    cancelPendingRequest();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('stt_model', sttModel);

      const sttResponse = await fetchWithTimeout('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) {
        let errorData;
        try {
          errorData = await sttResponse.json();
        } catch {
          const text = await sttResponse.text().catch(() => '');
          errorData = { error: `HTTP ${sttResponse.status} 오류${text ? ': ' + text.substring(0, 100) : ''}` };
        }
        const errorMessage = errorData.error || `STT API 요청 실패 (${sttResponse.status})`;
        throw new Error(errorMessage);
      }

      const sttData = await sttResponse.json();

      if (sttData.error) {
        throw new Error(sttData.error);
      }

      const transcribedText = sttData.text;

      if (!transcribedText || transcribedText.trim().length < 5) {
        setIsLoading(false);
        throw new Error('음성을 인식하지 못했습니다. 다시 시도해주세요.');
      }

      await sendMessage(transcribedText.trim());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('요청 시간이 초과되었습니다. 다시 시도해주세요.');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      throw error; // 상위에서 toast로 처리
    }
  }, [isInterviewStarted, isLoading, sttModel, sendMessage, cancelPendingRequest, fetchWithTimeout, clearInactivityTimer]);

  // 면접 초기화
  const reset = useCallback(() => {
    cancelPendingRequest();
    clearInactivityTimer();
    setMessages([]);
    setIsInterviewStarted(false);
    setIsLoading(false);
    setResumeText('');
    setQuestionCount(0);
    setCurrentPhase('intro');
  }, [cancelPendingRequest, clearInactivityTimer]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => clearInactivityTimer();
  }, [clearInactivityTimer]);

  // 면접 진행 중 페이지 이탈 경고
  useEffect(() => {
    if (!isInterviewStarted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isInterviewStarted]);

  // isInterviewStarted 조건 제거: 면접 정상 종료 후에도 분석 가능하게 수정
  const canAnalyze = messages.length > 0 && questionCount >= 5;

  return {
    messages,
    isLoading,
    isInterviewStarted,
    setIsInterviewStarted,
    selectedJob,
    setSelectedJob,
    selectedCompany,
    setSelectedCompany,
    questionCount,
    currentPhase,
    resumeText,
    setResumeText,
    startInterview,
    sendMessage,
    handleAudioInput,
    reset,
    canAnalyze,
    timeoutModalType,
    handleTimeoutContinue,
    handleTimeoutEnd,
  };
}
