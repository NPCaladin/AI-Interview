'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // iOS Safari: 사용자 제스처(버튼 클릭) 시 호출 → 오디오 자동재생 권한 획득
  // AudioContext 무음 버퍼 재생 방식 사용 — src 없어도 동작 (면접 시작 버튼 클릭 시 커버)
  const unlockAudio = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const buf = ctx.createBuffer(1, 1, 22050); // 1샘플 무음 버퍼
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume().catch(() => {});
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch { /* 미지원 환경 무시 */ }

    // src가 이미 있는 경우 HTML5 audio도 함께 unlock
    const el = audioRef.current;
    if (el && el.readyState > 0) {
      el.play().then(() => { el.pause(); el.currentTime = 0; }).catch(() => {});
    }
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
