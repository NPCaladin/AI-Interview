'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // iOS Safari: 사용자 제스처(버튼 클릭) 시 호출 → 오디오 자동재생 권한 획득
  const unlockAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    // play() 후 즉시 pause() → iOS가 이 엘리먼트에 대한 재생 권한 부여
    el.play()
      .then(() => { el.pause(); el.currentTime = 0; })
      .catch(() => {});
  }, []);

  // audioUrl 변경 시 canplay 이벤트 대기 후 재생 (첫마디 짤림 방지)
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    const el = audioRef.current;
    setAudioPlayFailed(false);

    let cancelled = false;

    const doPlay = async () => {
      if (cancelled) return;
      try {
        await el.play();
      } catch {
        if (!cancelled) setAudioPlayFailed(true);
      }
    };

    // 리스너 먼저 등록 후 readyState 확인 → 레이스 컨디션 방지
    el.addEventListener('canplay', doPlay, { once: true });
    if (el.readyState >= 3) {
      // 이미 재생 가능한 상태이면 리스너 제거 후 즉시 재생
      el.removeEventListener('canplay', doPlay);
      doPlay();
    }

    return () => {
      cancelled = true;
      el.removeEventListener('canplay', doPlay);
    };
  }, [audioUrl]);

  // 언마운트 시 blob URL 정리
  useEffect(() => {
    return () => {
      setAudioUrl(prevUrl => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return null;
      });
    };
  }, []);

  const handleManualAudioPlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
      setAudioPlayFailed(false);
    } catch {
      // noop
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
