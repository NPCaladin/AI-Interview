'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Zap, Menu, X } from 'lucide-react';

interface HeaderProps {
  isMobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

export default function Header({ isMobileMenuOpen = false, onMobileMenuToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-card-dark border-b border-cyber-500/20">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between">
          {/* 로고 영역 */}
          <Link href="/" className="flex items-center gap-2 md:gap-4 cursor-pointer">
            <div className="relative group">
              {/* 로고 이미지 */}
              <div className="w-12 h-10 md:w-20 md:h-16 flex items-center justify-center">
                <Image
                  src="/eneni-logo.png"
                  alt="EvenI Logo"
                  width={80}
                  height={64}
                  className="object-contain brightness-110 group-hover:brightness-125 transition-all duration-300 group-hover:scale-105"
                />
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold tracking-tight font-tech">
                <span className="text-white">Even</span><span className="text-[#00F2FF]">I</span>
                <span className="hidden sm:inline text-gray-300 font-normal ml-2 font-sans">면접 연습</span>
              </h1>
              <p className="hidden md:flex text-xs text-gray-400 items-center gap-1">
                <Zap className="w-3 h-3 text-neon-cyan" />
                <span>게임 업계 AI 모의 면접 플랫폼</span>
              </p>
            </div>
          </Link>

          {/* 네비게이션 - 데스크톱 */}
          <nav className="hidden md:flex items-center gap-2">
            <Link
              href="/guide"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300"
            >
              면접 가이드
            </Link>
            <div className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00F2FF]/10 border border-[#00F2FF]/30">
              <div className="w-2 h-2 bg-[#00F2FF] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]"></div>
              <span className="text-xs font-tech font-medium text-[#00F2FF] tracking-wider">ONLINE</span>
            </div>
          </nav>

          {/* 모바일 메뉴 버튼 */}
          <button
            onClick={onMobileMenuToggle}
            className="md:hidden relative w-11 h-11 flex items-center justify-center rounded-lg border border-[#00F2FF]/30 bg-[#00F2FF]/5 hover:bg-[#00F2FF]/10 transition-all duration-300"
            aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 text-[#00F2FF]" />
            ) : (
              <Menu className="w-5 h-5 text-[#00F2FF]" />
            )}
            {/* 코너 장식 */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00F2FF]/50"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00F2FF]/50"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#00F2FF]/50"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#00F2FF]/50"></div>
          </button>
        </div>
      </div>

      {/* 하단 그라디언트 라인 */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyber-500/50 to-transparent"></div>
    </header>
  );
}
