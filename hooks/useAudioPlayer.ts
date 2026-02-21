'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// 1샘플 무음 WAV (45 bytes): 8-bit, mono, 8000Hz
// iOS Safari는 HTML5 audio.play()가 실제로 성공해야 자동재생 권한이 부여됨.
// AudioContext 방식은 iOS에서 suspended 상태 문제로 unlock 실패 → 이 방식으로 교체.
const SILENT_WAV_BYTES = new Uint8Array([
  82, 73, 70, 70, 37,  0,  0,  0,  87, 65, 86, 69,  // RIFF....WAVE
 102,109,116, 32, 16,  0,  0,  0,   1,  0,  1,  0,  // fmt .........
  64, 31,  0,  0, 64, 31,  0,  0,   1,  0,  8,  0,  // 8000Hz, 8-bit
 100, 97,116, 97,  1,  0,  0,  0, 128,               // data....{silence}
]);

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // iOS Safari 잠금 해제 전용 오디오 엘리먼트 (DOM과 분리)
  const silentRef = useRef<HTMLAudioElement | null>(null);

  // 마운트 시 무음 오디오 엘리먼트 생성 (브라우저 전용)
  useEffect(() => {
    const blob = new Blob([SILENT_WAV_BYTES], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.load(); // 미리 디코딩
    silentRef.current = el;
    return () => {
      URL.revokeObjectURL(url);
      silentRef.current = null;
    };
  }, []);

  // iOS Safari: 사용자 제스처(버튼 클릭) 시 무음 오디오 play → 페이지 레벨 자동재생 권한 획득
  // iOS 13+: 어떤 오디오든 user gesture에서 play() 성공 시 해당 탭의 모든 audio 자동재생 허용
  const unlockAudio = useCallback(() => {
    silentRef.current?.play()
      .then(() => { silentRef.current?.pause(); })
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
