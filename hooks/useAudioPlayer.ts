'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Web Audio API 그래프 초기화 (최초 1회)
  const initAudioGraph = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContextRef.current = new AudioCtx();
    sourceNodeRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
    gainNodeRef.current = audioContextRef.current.createGain();
    sourceNodeRef.current.connect(gainNodeRef.current);
    gainNodeRef.current.connect(audioContextRef.current.destination);
  }, []);

  // 사용자 제스처 시 AudioContext 잠금 해제 (iOS Safari 대응)
  // 마이크 버튼·전송 버튼 클릭 시 호출
  const unlockAudio = useCallback(() => {
    initAudioGraph();
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, [initAudioGraph]);

  // audioUrl이 변경되면 자동 재생 (2배 볼륨 증폭)
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;

    setAudioPlayFailed(false);

    const playAudio = async () => {
      try {
        initAudioGraph();

        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = 2.0;
        }

        // suspended 상태를 반드시 await로 해제 (iOS Safari 핵심 수정)
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        await audioRef.current!.play();
      } catch (error) {
        console.error('오디오 자동 재생 실패 (브라우저 정책):', error);
        setAudioPlayFailed(true);
      }
    };

    playAudio();
  }, [audioUrl, initAudioGraph]);

  // Web Audio API + audioUrl 리소스 정리 (언마운트 시)
  useEffect(() => {
    return () => {
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

  const handleManualAudioPlay = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      await audioRef.current.play();
      setAudioPlayFailed(false);
    } catch (error) {
      console.error('오디오 재생 실패:', error);
    }
  }, []);

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
    unlockAudio,
    handleManualAudioPlay,
    updateAudioUrl,
    clearAudioUrl,
    resetAudio,
  };
}
