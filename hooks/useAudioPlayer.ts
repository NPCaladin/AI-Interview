'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPlayer() {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // iOS Safari/Chrome: 사용자 제스처(버튼 클릭) 시 메인 audioRef에 직접 play() 호출.
  // 핵심: iOS는 "자동재생 허용 플래그"를 엘리먼트 단위로 관리.
  // TTS를 재생할 audioRef와 unlock 엘리먼트가 반드시 동일해야 한다.
  // (new Audio()로 만든 DOM 비부착 엘리먼트 → unlock 실패)
  const unlockAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.01; // 거의 무음으로 unlock
    el.play()
      .then(() => {
        el.pause();
        el.volume = 1;
      })
      .catch(() => {
        // src 없어서 실패해도 iOS는 해당 엘리먼트에 user-gesture 플래그 기록
        el.volume = 1;
      });
  }, []);

  // audioUrl 변경 시 자동 재생
  // - audio.load(): React가 src 바꿔도 iOS는 자동 로드 안 할 수 있음 → 명시 필수
  // - canplaythrough: canplay보다 iOS에서 안정적 (충분한 버퍼 확보 후 발화)
  // - 100ms 폴백: canplaythrough가 이미 지나간 경우 or iOS Chrome 대응.
  //   실패해도 canplaythrough 리스너가 별도로 재시도하므로 안전.
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    const el = audioRef.current;
    setAudioPlayFailed(false);

    let cancelled = false;
    let played = false;

    const doPlay = async () => {
      if (cancelled || played) return;
      played = true;
      try {
        await el.play();
      } catch {
        if (!cancelled) setAudioPlayFailed(true);
      }
    };

    // canplaythrough: 충분히 로드됐을 때 재생 시도
    const handleCanPlayThrough = () => {
      doPlay();
    };

    el.addEventListener('canplaythrough', handleCanPlayThrough);

    // iOS: src 변경 후 명시적 load() 필수
    el.load();

    // 100ms 폴백: 무조건 play 시도 (실패해도 canplaythrough에서 재시도)
    const playTimeout = setTimeout(() => {
      if (!cancelled) doPlay();
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(playTimeout);
      el.removeEventListener('canplaythrough', handleCanPlayThrough);
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
