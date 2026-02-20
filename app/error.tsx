'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[App Error Boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="max-w-md w-full mx-4 p-8 rounded-2xl border border-red-500/30 bg-[var(--dark-800)]">
        {/* HUD 코너 */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-red-500/50 rounded-tl-lg" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-red-500/50 rounded-tr-lg" />

        <div className="text-center space-y-4">
          <div className="text-4xl">&#9888;</div>
          <h2 className="text-xl font-bold text-red-400">
            오류가 발생했습니다
          </h2>
          <p className="text-sm text-gray-400">
            예기치 않은 문제가 발생했습니다. 아래 버튼을 눌러 다시 시도해주세요.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors text-sm font-medium"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
