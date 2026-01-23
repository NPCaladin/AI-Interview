'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 glass-card-dark border-b border-cyber-500/20">
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* 로고 영역 */}
          <Link href="/" className="flex items-center gap-4 cursor-pointer">
            <div className="relative group">
              {/* 로고 이미지 */}
              <div className="w-20 h-16 flex items-center justify-center">
                <Image
                  src="/eneni-logo.png"
                  alt="ENENI Logo"
                  width={80}
                  height={64}
                  className="object-contain drop-shadow-[0_0_10px_rgba(64,224,208,0.6)] group-hover:drop-shadow-[0_0_15px_rgba(64,224,208,0.9)] transition-all duration-300 group-hover:scale-105"
                />
              </div>
              {/* 글로우 효과 */}
              <div className="absolute inset-0 bg-[#40E0D0]/20 rounded-full blur-xl -z-10 group-hover:bg-[#40E0D0]/40 transition-all duration-300"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-tech">
                <span className="text-white">Even</span><span className="text-[#00F2FF]">I</span>
                <span className="text-gray-300 font-normal ml-2">Interview Training</span>
              </h1>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Zap className="w-3 h-3 text-neon-cyan" />
                <span>AI-Powered Mock Interview for Game Industry</span>
              </p>
            </div>
          </Link>

          {/* 네비게이션 */}
          <nav className="flex items-center gap-2">
            <a
              href="#"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300"
            >
              Interview Guide
            </a>
            <a
              href="#"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300"
            >
              My Results
            </a>
            <div className="ml-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00F2FF]/10 border border-[#00F2FF]/30">
              <div className="w-2 h-2 bg-[#00F2FF] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]"></div>
              <span className="text-xs font-tech font-medium text-[#00F2FF] tracking-wider">ONLINE</span>
            </div>
          </nav>
        </div>
      </div>

      {/* 하단 그라디언트 라인 */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyber-500/50 to-transparent"></div>
    </header>
  );
}
