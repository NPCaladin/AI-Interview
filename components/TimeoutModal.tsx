'use client';

import { useEffect } from 'react';
import { AlertTriangle, Clock, BarChart2, RefreshCw } from 'lucide-react';

interface TimeoutModalProps {
  type: 'warning' | 'final';
  onContinue: () => void;   // "면접 계속" — 타이머 리셋
  onAnalyze: () => void;    // "지금 분석하기" — 면접 종료
}

export default function TimeoutModal({ type, onContinue, onAnalyze }: TimeoutModalProps) {
  // 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isWarning = type === 'warning';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* 모달 카드 */}
      <div
        className={`relative w-full max-w-sm rounded-2xl border bg-[#12121a] p-6 shadow-2xl
          ${isWarning
            ? 'border-amber-500/60 shadow-amber-500/20'
            : 'border-red-500/60 shadow-red-500/20'
          }`}
      >
        {/* HUD 코너 장식 */}
        <span className={`absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 rounded-tl
          ${isWarning ? 'border-amber-400' : 'border-red-400'}`} />
        <span className={`absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 rounded-tr
          ${isWarning ? 'border-amber-400' : 'border-red-400'}`} />
        <span className={`absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 rounded-bl
          ${isWarning ? 'border-amber-400' : 'border-red-400'}`} />
        <span className={`absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 rounded-br
          ${isWarning ? 'border-amber-400' : 'border-red-400'}`} />

        {/* 아이콘 */}
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2
          ${isWarning
            ? 'border-amber-500/50 bg-amber-500/10'
            : 'border-red-500/50 bg-red-500/10'
          }`}>
          {isWarning
            ? <Clock className="h-7 w-7 text-amber-400" />
            : <AlertTriangle className="h-7 w-7 text-red-400" />
          }
        </div>

        {/* 제목 */}
        <h2 className={`text-center text-base font-bold mb-2 font-sans
          ${isWarning ? 'text-amber-300' : 'text-red-300'}`}>
          {isWarning ? '⚠️ 응답 없음 감지' : '⏱ 무응답 4분 경과'}
        </h2>

        {/* 본문 */}
        <p className="text-center text-sm text-gray-300 font-sans leading-relaxed mb-6">
          {isWarning
            ? <>3분째 응답이 없습니다.<br /><span className="text-amber-300 font-semibold">1분 후 면접이 자동 종료</span>됩니다.</>
            : <>지금까지의 답변으로<br /><span className="text-[#00F2FF] font-semibold">AI 분석을 시작</span>하시겠습니까?</>
          }
        </p>

        {/* 버튼 */}
        {isWarning ? (
          <button
            onClick={onContinue}
            className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black
              hover:bg-amber-400 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            계속 답변하기
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={onAnalyze}
              className="w-full rounded-xl bg-gradient-to-r from-[#00F2FF] to-[#7B2FFF] px-4 py-3
                text-sm font-bold text-white hover:opacity-90 active:scale-95 transition-all
                flex items-center justify-center gap-2 shadow-glow"
            >
              <BarChart2 className="h-4 w-4" />
              지금 분석하기
            </button>
            <button
              onClick={onContinue}
              className="w-full rounded-xl border border-gray-600 bg-gray-800/60 px-4 py-3
                text-sm font-semibold text-gray-300 hover:bg-gray-700/60 active:scale-95
                transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              면접 계속하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
