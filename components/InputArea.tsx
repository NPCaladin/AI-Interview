'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Upload, Send, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_USER_INPUT_LENGTH } from '@/lib/constants';

interface AudioDevice {
  deviceId: string;
  label: string;
}

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
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deviceSelectorRef = useRef<HTMLDivElement>(null);

  // 마이크 장치 목록 조회
  const loadAudioDevices = useCallback(async () => {
    try {
      // 권한 획득 후 장치 목록 조회 (권한 없으면 label이 빈 문자열)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `마이크 ${i + 1}`,
        }));
      setAudioDevices(mics);
      // 선택된 장치가 없거나 목록에 없으면 첫 번째로 설정
      if (mics.length > 0 && (!selectedDeviceId || !mics.some(m => m.deviceId === selectedDeviceId))) {
        setSelectedDeviceId(mics[0].deviceId);
      }
    } catch {
      // 장치 조회 실패 시 무시
    }
  }, [selectedDeviceId]);

  // 컴포넌트 언마운트 시 녹음 스트림 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  // 면접 시작 시 마이크 권한 사전 획득 + 장치 목록 로드
  useEffect(() => {
    if (!isInterviewStarted) return;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop());
        loadAudioDevices(); // 권한 획득 후 장치 목록 로드
      })
      .catch(() => {}); // 권한 거부 시 무시 (클릭 시 다시 요청됨)
  }, [isInterviewStarted, loadAudioDevices]);

  // 장치 변경 감지 (마이크 연결/해제 시 목록 갱신)
  useEffect(() => {
    const handler = () => loadAudioDevices();
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  }, [loadAudioDevices]);

  // 마이크 선택 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showDeviceSelector) return;
    const handler = (e: MouseEvent) => {
      if (deviceSelectorRef.current && !deviceSelectorRef.current.contains(e.target as Node)) {
        setShowDeviceSelector(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDeviceSelector]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUnlockAudio?.(); // iOS Safari AudioContext 잠금 해제

    if (!isInterviewStarted) {
      toast.error(window.innerWidth < 768 ? '☰ 메뉴에서 직군/회사 선택 후 시작해주세요.' : '좌측 사이드바에서 직군/회사를 선택 후 면접을 시작해주세요.');
      return;
    }

    if (inputValue.trim() && onSendMessage) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const startRecording = async () => {
    if (!isInterviewStarted) {
      toast.error(window.innerWidth < 768 ? '☰ 메뉴에서 직군/회사 선택 후 시작해주세요.' : '좌측 사이드바에서 직군/회사를 선택 후 면접을 시작해주세요.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });
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
          {/* 마이크 버튼 + 장치 선택 */}
          <div className="relative flex-shrink-0" ref={deviceSelectorRef}>
            <div className="flex items-center">
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
              {/* 마이크 선택 화살표 (장치 2개 이상일 때만) */}
              {audioDevices.length > 1 && !isRecording && (
                <button
                  type="button"
                  onClick={() => setShowDeviceSelector(!showDeviceSelector)}
                  className="flex-shrink-0 w-5 h-5 -ml-1.5 rounded-full bg-dark-600 border border-dark-500 flex items-center justify-center hover:bg-dark-500 transition-colors"
                  aria-label="마이크 선택"
                >
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>

            {/* 마이크 선택 드롭다운 */}
            {showDeviceSelector && audioDevices.length > 1 && (
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-dark-800 border border-dark-500 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-dark-600">
                  <span className="text-xs font-medium text-gray-400">마이크 선택</span>
                </div>
                {audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      setSelectedDeviceId(device.deviceId);
                      setShowDeviceSelector(false);
                      toast.success(`마이크: ${device.label}`);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors truncate ${
                      selectedDeviceId === device.deviceId
                        ? 'bg-[#00F2FF]/10 text-[#00F2FF]'
                        : 'text-gray-300 hover:bg-dark-700'
                    }`}
                  >
                    {device.label}
                  </button>
                ))}
              </div>
            )}
          </div>

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
          <div className={`flex-1 min-w-0 relative ${isRecording ? 'ring-2 ring-red-500/60 rounded-full' : ''}`}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              maxLength={MAX_USER_INPUT_LENGTH}
              placeholder={
                isInterviewEnded
                  ? '면접이 종료되었습니다. 분석을 시작하세요.'
                  : isInterviewStarted
                  ? (typeof window !== 'undefined' && window.innerWidth < 768
                    ? '답변 입력 또는 마이크 터치'
                    : '답변을 입력하거나 마이크 버튼을 눌러 음성으로 답변하세요')
                  : (typeof window !== 'undefined' && window.innerWidth < 768
                    ? '☰ 메뉴에서 면접 시작'
                    : '좌측 사이드바에서 면접을 시작해주세요')
              }
              disabled={!isInterviewStarted || isLoading || isProcessingAudio}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full px-3 md:px-4 py-3 md:py-4 bg-transparent border-0 outline-none text-gray-100 placeholder-gray-500 disabled:text-gray-600 focus:placeholder-gray-400 transition-colors text-sm md:text-base"
            />
            {inputValue.length > 0 && (
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
            className={`flex-shrink-0 w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
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
