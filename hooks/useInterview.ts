'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useDevMode } from '@/contexts/DevModeContext';
import { getCurrentPhase } from '@/lib/utils';
import type { InterviewData } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { TOTAL_QUESTION_COUNT } from '@/lib/constants';

interface UseInterviewOptions {
  sttModel: 'OpenAI Whisper' | 'Daglo';
  updateAudioUrl: (url: string) => void;
  clearAudioUrl: () => void;
}

export function useInterview({ sttModel, updateAudioUrl, clearAudioUrl }: UseInterviewOptions) {
  const { isDevMode, config, addDebugData } = useDevMode();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [questionCount, setQuestionCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('intro');
  const [interviewData, setInterviewData] = useState<InterviewData | null>(null);
  const [resumeText, setResumeText] = useState<string>('');

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

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!chatResponse.ok) {
        throw new Error('Chat API 요청 실패');
      }

      const chatData = await chatResponse.json();
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
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

      // TTS
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.message }),
      });

      if (!ttsResponse.ok) {
        throw new Error('TTS API 요청 실패');
      }

      const audioBlob = await ttsResponse.blob();
      const url = URL.createObjectURL(audioBlob);
      updateAudioUrl(url);
    } catch (error) {
      console.error('면접 시작 오류:', error);
      throw error; // 상위에서 toast로 처리
    } finally {
      setIsLoading(false);
    }
  }, [isInterviewStarted, selectedJob, selectedCompany, interviewData, isDevMode, config, resumeText, addDebugData, clearAudioUrl, updateAudioUrl]);

  // 메시지 전송
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
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

      const chatResponse = await fetch('/api/chat', {
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

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
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

      // TTS
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.message }),
      });

      if (!ttsResponse.ok) {
        throw new Error('TTS API 요청 실패');
      }

      const audioBlob = await ttsResponse.blob();
      const url = URL.createObjectURL(audioBlob);
      updateAudioUrl(url);
    } catch (error) {
      throw error; // 상위에서 toast로 처리
    } finally {
      setIsLoading(false);
    }
  }, [isInterviewStarted, messages, interviewData, selectedJob, selectedCompany, questionCount, isDevMode, config, resumeText, addDebugData, updateAudioUrl]);

  // 오디오 입력 처리
  const handleAudioInput = useCallback(async (audioBlob: Blob) => {
    if (!isInterviewStarted) {
      throw new Error('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('stt_model', sttModel);

      const sttResponse = await fetch('/api/stt', {
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
      setIsLoading(false);
      throw error; // 상위에서 toast로 처리
    }
  }, [isInterviewStarted, sttModel, sendMessage]);

  // 면접 초기화
  const reset = useCallback(() => {
    setMessages([]);
    setIsInterviewStarted(false);
    setQuestionCount(0);
    setCurrentPhase('intro');
  }, []);

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
