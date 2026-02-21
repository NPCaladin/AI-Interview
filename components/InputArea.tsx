'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Upload, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_USER_INPUT_LENGTH } from '@/lib/constants';

interface InputAreaProps {
  onSendMessage?: (message: string) => void;
  onAudioInput?: (audioBlob: Blob) => void;
  onUnlockAudio?: () => void;
  isInterviewStarted?: boolean;
  isLoading?: boolean;
  isInterviewEnded?: boolean;
}

export default function InputArea({
  onSendMessage,
  onAudioInput,
  onUnlockAudio,
  isInterviewStarted = false,
  isLoading = false,
  isInterviewEnded = false,
}: InputAreaProps) {
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 컴포넌트 언마운트 시 녹음 스트림 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // 면접 시작 시 마이크 권한 사전 획득 (클릭 후 첫마디 짤림 방지)
  // getUserMedia() 지연(100~500ms)을 면접 시작 시점으로 앞당김
  useEffect(() => {
    if (!isInterviewStarted) return;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => {}); // 권한 거부 시 무시 (클릭 시 다시 요청됨)
  }, [isInterviewStarted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUnlockAudio?.(); // iOS Safari AudioContext 잠금 해제

    if (!isInterviewStarted) {
      toast.error('먼저 우상단 ☰ 메뉴에서 직군/회사를 선택 후 면접을 시작해주세요.');
      return;
    }

    if (inputValue.trim() && onSendMessage) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const startRecording = async () => {
    if (!isInterviewStarted) {
      toast.error('먼저 우상단 ☰ 메뉴에서 직군/회사를 선택 후 면접을 시작해주세요.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mimeTypeRef.current = mediaRecorder.mimeType || 'audio/webm';
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });

        // 스트림 정리
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (onAudioInput) {
          setIsProcessingAudio(true);
          try {
            await onAudioInput(audioBlob);
          } finally {
            setIsProcessingAudio(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('녹음 시작 실패:', error);
      toast.error('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMicClick = () => {
    onUnlockAudio?.(); // iOS Safari AudioContext 잠금 해제
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isInterviewStarted) {
      toast.error('먼저 우상단 ☰ 메뉴에서 직군/회사를 선택 후 면접을 시작해주세요.');
      return;
    }

    if (onAudioInput) {
      setIsProcessingAudio(true);
      try {
        await onAudioInput(file);
      } finally {
        setIsProcessingAudio(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  return (
    <>
      {/* 플로팅 입력 바 */}
      <div className="px-3 md:px-6 pb-4 md:pb-6 bg-dark-900">
        <div className="max-w-4xl mx-auto glass-card-dark rounded-full p-1.5 md:p-2 flex items-center gap-1.5 md:gap-2">
          {/* 마이크 버튼 */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={!isInterviewStarted || isLoading || isProcessingAudio}
            className={`flex-shrink-0 w-11 h-11 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30 animate-pulse'
                : isInterviewStarted && !isLoading && !isProcessingAudio
                ? 'bg-gradient-gaming text-white shadow-glow hover:shadow-glow-lg'
                : 'bg-dark-600 text-gray-500 cursor-not-allowed'
            }`}
            aria-label={isRecording ? '녹음 중지' : '녹음 시작'}
          >
            {isRecording ? (
              <MicOff className="w-5 h-5 md:w-6 md:h-6" />
            ) : (
              <Mic className="w-5 h-5 md:w-6 md:h-6" />
            )}
          </button>

          {/* 파일 업로드 버튼 - 모바일에서 숨김 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
            id="audio-file-input"
          />
          <label
            htmlFor="audio-file-input"
            aria-label="오디오 파일 업로드"
            className={`hidden md:flex flex-shrink-0 w-12 h-12 rounded-full items-center justify-center transition-all cursor-pointer active:scale-95 ${
              isInterviewStarted && !isLoading && !isProcessingAudio
                ? 'bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white border border-cyber-500/30 hover:border-cyber-500/50 hover:shadow-glow-sm'
                : 'bg-dark-700 text-gray-600 cursor-not-allowed'
            }`}
          >
            <Upload className="w-5 h-5" />
          </label>

          {/* 텍스트 입력창 */}
          <div className="flex-1 min-w-0 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              maxLength={MAX_USER_INPUT_LENGTH}
              placeholder={
                isInterviewEnded
                  ? '면접이 종료되었습니다. 분석을 시작하세요.'
                  : isInterviewStarted
                  ? '답변을 입력하세요...'
                  : '면접을 시작해주세요'
              }
              disabled={!isInterviewStarted || isLoading || isProcessingAudio}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full px-2 md:px-4 py-3 md:py-4 bg-transparent border-0 outline-none text-gray-100 placeholder-gray-500 disabled:text-gray-600 focus:placeholder-gray-400 transition-colors text-sm md:text-base"
            />
            {inputValue.length > MAX_USER_INPUT_LENGTH * 0.8 && (
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${
                inputValue.length >= MAX_USER_INPUT_LENGTH ? 'text-red-400' : 'text-gray-400'
              }`}>
                {inputValue.length}/{MAX_USER_INPUT_LENGTH}
              </span>
            )}
          </div>

          {/* 전송 버튼 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !inputValue.trim() ||
              !isInterviewStarted ||
              isLoading ||
              isProcessingAudio
            }
            aria-label="답변 전송"
            className={`flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              inputValue.trim() && isInterviewStarted && !isLoading && !isProcessingAudio
                ? 'bg-gradient-to-r from-neon-cyan to-cyber-500 text-white shadow-glow-cyan hover:shadow-lg'
                : 'bg-dark-600 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 md:w-5 md:h-5" />
            )}
          </button>
        </div>

        {/* 상태 표시 */}
        {(isRecording || isProcessingAudio) && (
          <div className="max-w-4xl mx-auto mt-3 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 glass-card-dark rounded-full">
              {isRecording ? (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50"></div>
                  <span className="text-sm font-medium text-gray-300">녹음 중...</span>
                  <div className="flex gap-0.5 ml-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-red-400 rounded-full animate-pulse"
                        style={{
                          height: `${8 + Math.random() * 12}px`,
                          animationDelay: `${i * 100}ms`
                        }}
                      ></div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 text-cyber-400 animate-spin" />
                  <span className="text-sm font-medium text-gray-300">오디오 처리 중...</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
