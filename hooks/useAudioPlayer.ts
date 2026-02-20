'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // audioUrl이 변경되면 자동 재생 (2배 볼륨 증폭)
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      setAudioPlayFailed(false);

      // Web Audio API로 볼륨 2배 증폭
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        gainNodeRef.current = audioContextRef.current.createGain();

        sourceNodeRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContextRef.current.destination);
      }

      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = 2.0;
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      audioRef.current.play().catch((error) => {
        console.error('오디오 자동 재생 실패 (브라우저 정책):', error);
        setAudioPlayFailed(true);
      });
    }
  }, [audioUrl]);

  // Web Audio API + audioUrl 리소스 정리 (언마운트 시)
  useEffect(() => {
    return () => {
      // 오디오 URL 메모리 해제
      setAudioUrl(prevUrl => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return null;
      });
      sourceNodeRef.current?.disconnect();
      gainNodeRef.current?.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleManualAudioPlay = useCallback(() => {
    if (audioRef.current) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      audioRef.current.play().then(() => {
        setAudioPlayFailed(false);
      }).catch((error) => {
        console.error('오디오 재생 실패:', error);
      });
    }
  }, []);

  // 안전한 audioUrl 설정 (이전 URL revoke 포함)
  const updateAudioUrl = useCallback((url: string) => {
    setAudioUrl(prevUrl => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return url;
    });
  }, []);

  const clearAudioUrl = useCallback(() => {
    setAudioUrl(prevUrl => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return null;
    });
  }, []);

  const resetAudio = useCallback(() => {
    clearAudioUrl();
    setAudioPlayFailed(false);
  }, [clearAudioUrl]);

  return {
    audioUrl,
    audioPlayFailed,
    audioRef,
    handleManualAudioPlay,
    updateAudioUrl,
    clearAudioUrl,
    resetAudio,
  };
}
