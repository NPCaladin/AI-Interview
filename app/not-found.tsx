import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="relative max-w-md w-full mx-4 p-8 rounded-2xl border border-[#00F2FF]/20 bg-white/[0.03]">
        {/* HUD 코너 장식 */}
        <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-[#00F2FF]/60 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-[#00F2FF]/60 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-[#00F2FF]/60 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-[#00F2FF]/60 rounded-br-xl" />

        <div className="text-center space-y-5">
          {/* 404 표시 */}
          <div>
            <p className="text-6xl font-black font-tech text-[#00F2FF] opacity-40">404</p>
            <div className="mt-1 h-px bg-gradient-to-r from-transparent via-[#00F2FF]/40 to-transparent" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">
              페이지를 찾을 수 없습니다
            </h1>
            <p className="text-sm text-gray-400 leading-relaxed">
              요청하신 페이지가 존재하지 않거나 이동되었습니다.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#00F2FF]/10 border border-[#00F2FF]/30 text-[#00F2FF] text-sm font-medium hover:bg-[#00F2FF]/20 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,242,255,0.2)]"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
