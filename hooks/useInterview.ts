'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useDevMode } from '@/contexts/DevModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPhase, generateId } from '@/lib/utils';
import type { InterviewData } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { TOTAL_QUESTION_COUNT, MAX_USER_INPUT_LENGTH, CLIENT_FETCH_TIMEOUT } from '@/lib/constants';

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRequestingRef = useRef(false); // 더블클릭 방지용 ref (state보다 즉시 반영)
  const ttsSeqRef = useRef(0); // TTS 요청 순서 관리 (구버전 응답 무시용)

  // 진행 중인 요청 취소
  const cancelPendingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

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

      if (isDevMode) {
        const latency = chatData._meta?.latency || (Date.now() - requestStartTime);
        addDebugData({ latency, requestBody, responseBody: chatData });
      }

      // TTS 비동기 백그라운드 재생 (chat 완료 즉시 UI 해제, 음성은 준비되면 자동 재생)
      const ttsSeqId = ++ttsSeqRef.current;
      (async () => {
        const controller = new AbortController();
        const ttsTimeout = setTimeout(() => controller.abort(), 15000);
        try {
          const r = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ text: chatData.message }),
            signal: controller.signal,
          });
          if (ttsSeqRef.current !== ttsSeqId || !r.ok) return;
          const blob = await r.blob();
          if (ttsSeqRef.current !== ttsSeqId) return;
          updateAudioUrl(URL.createObjectURL(blob));
        } catch { /* TTS 실패는 비치명적 — 텍스트는 이미 표시됨 */ } finally { clearTimeout(ttsTimeout); }
      })();
    } catch (error) {
      setIsInterviewStarted(false); // 실패 시 상태 복원
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
  }, [isInterviewStarted, isLoading, selectedJob, selectedCompany, interviewData, isDevMode, config, resumeText, addDebugData, clearAudioUrl, updateAudioUrl, cancelPendingRequest, fetchWithTimeout, updateRemaining, authHeaders]);

  // 메시지 전송
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }
    if (isLoading || isRequestingRef.current) return; // 동시 요청 방지

    isRequestingRef.current = true;

    // 입력 길이 검증
    if (userMessage.length > MAX_USER_INPUT_LENGTH) {
      throw new Error(`입력이 너무 깁니다. 최대 ${MAX_USER_INPUT_LENGTH}자까지 입력 가능합니다.`);
    }

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
        toast.success('면접이 종료되었습니다. 분석을 시작하세요.');
      }

      // TTS 비동기 백그라운드 재생 (chat 완료 즉시 UI 해제)
      const ttsSeqId = ++ttsSeqRef.current;
      (async () => {
        const controller = new AbortController();
        const ttsTimeout = setTimeout(() => controller.abort(), 15000);
        try {
          const r = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ text: chatData.message }),
            signal: controller.signal,
          });
          if (ttsSeqRef.current !== ttsSeqId || !r.ok) return;
          const blob = await r.blob();
          if (ttsSeqRef.current !== ttsSeqId) return;
          updateAudioUrl(URL.createObjectURL(blob));
        } catch { /* TTS 실패는 비치명적 */ } finally { clearTimeout(ttsTimeout); }
      })();
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
  }, [isInterviewStarted, isLoading, messages, interviewData, selectedJob, selectedCompany, questionCount, isDevMode, config, resumeText, addDebugData, updateAudioUrl, cancelPendingRequest, fetchWithTimeout, updateRemaining, authHeaders]);

  // 오디오 입력 처리
  const handleAudioInput = useCallback(async (audioBlob: Blob) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }
    if (isLoading) return; // 동시 요청 방지

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
  }, [isInterviewStarted, isLoading, sttModel, sendMessage, cancelPendingRequest, fetchWithTimeout]);

  // 면접 초기화
  const reset = useCallback(() => {
    cancelPendingRequest();
    setMessages([]);
    setIsInterviewStarted(false);
    setQuestionCount(0);
    setCurrentPhase('intro');
  }, [cancelPendingRequest]);

  const canAnalyze = isInterviewStarted && messages.length > 0 && questionCount >= 5;

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
  };
}
