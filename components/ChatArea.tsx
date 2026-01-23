'use client';

import { UserCircle, Bot, Play, Scan, ArrowRight } from 'lucide-react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatAreaProps {
  messages: Message[];
  isLoading?: boolean;
  isInterviewStarted?: boolean;
  onStartInterview?: () => void;
  selectedJob?: string;
  selectedCompany?: string;
}

export default function ChatArea({
  messages,
  isLoading = false,
  isInterviewStarted = false,
  onStartInterview,
  selectedJob = '',
  selectedCompany = '',
}: ChatAreaProps) {
  const handleStartClick = () => {
    if (!selectedJob || !selectedCompany) {
      alert('좌측 사이드바에서 직군 카테고리, 지원 직군, 회사를 모두 선택해주세요.');
      return;
    }
    onStartInterview?.();
  };
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-dark-800 to-dark-900 p-6 scrollbar-gaming">
      {messages.length === 0 && !isLoading ? (
        /* Empty State - FPS 조준경 스타일 */
        <div className="flex flex-col items-center justify-center h-full relative">
          {/* FPS 레티클 (조준경) */}
          <div className="relative mb-10 group cursor-pointer">
            {/* 외부 코너 브라켓 - 회전 */}
            <div className="absolute inset-0 -m-12 w-40 h-40 animate-[spin_20s_linear_infinite]">
              {/* 좌상단 */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#00F2FF]/60"></div>
              {/* 우상단 */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#00F2FF]/60"></div>
              {/* 좌하단 */}
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#00F2FF]/60"></div>
              {/* 우하단 */}
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#00F2FF]/60"></div>
            </div>

            {/* 내부 코너 브라켓 - 역회전 */}
            <div className="absolute inset-0 -m-6 w-28 h-28 animate-[spin_15s_linear_infinite_reverse]">
              <div className="absolute top-0 left-0 w-5 h-5 border-t border-l border-cyber-400/80"></div>
              <div className="absolute top-0 right-0 w-5 h-5 border-t border-r border-cyber-400/80"></div>
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-cyber-400/80"></div>
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-cyber-400/80"></div>
            </div>

            {/* 십자선 */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* 가로선 */}
              <div className="absolute w-32 h-[1px] bg-gradient-to-r from-transparent via-[#00F2FF]/40 to-transparent"></div>
              {/* 세로선 */}
              <div className="absolute h-32 w-[1px] bg-gradient-to-b from-transparent via-[#00F2FF]/40 to-transparent"></div>
            </div>

            {/* 중앙 원 + 펄스 */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              {/* 펄스 링 */}
              <div className="absolute inset-0 rounded-full border border-[#00F2FF]/30 animate-ping"></div>
              <div className="absolute inset-2 rounded-full border border-[#00F2FF]/20 animate-pulse"></div>

              {/* 중앙 점 */}
              <div className="w-3 h-3 rounded-full bg-[#00F2FF] shadow-[0_0_15px_rgba(0,242,255,0.8),0_0_30px_rgba(0,242,255,0.4)]"></div>
            </div>

            {/* 배경 글로우 */}
            <div className="absolute inset-0 -m-8 bg-[#00F2FF]/5 rounded-full blur-3xl"></div>

            {/* 거리 표시 (장식) */}
            <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-[10px] font-tech text-[#00F2FF]/50 tracking-wider">
              100m
            </div>
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 text-[10px] font-tech text-[#00F2FF]/50 tracking-wider">
              READY
            </div>
          </div>

          {/* 상태 텍스트 */}
          <div className="text-center mb-8">
            <p className="text-xs font-tech text-[#00F2FF] tracking-[0.3em] mb-2 animate-pulse">
              ● TARGET ACQUIRED
            </p>
            <h3 className="text-3xl font-bold font-tech tracking-wide mb-3">
              <span className="text-white">INTERVIEW</span>
              <span className="text-[#00F2FF] ml-2">MODE</span>
            </h3>
            <p className="text-gray-400 max-w-md leading-relaxed">
              좌측 사이드바에서 직군과 회사를 선택한 후<br />
              <span className="text-[#00F2FF] font-tech">START</span> 버튼을 눌러주세요
            </p>
          </div>

          {/* 시작 버튼 */}
          {!isInterviewStarted && onStartInterview && (
            <div className="relative group">
              {/* 외부 글로우 링 */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#00F2FF]/20 via-[#00D9A5]/20 to-[#00F2FF]/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              {/* 코너 브라켓 장식 */}
              <div className="absolute -inset-3 pointer-events-none">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00F2FF]/50 group-hover:border-[#00F2FF] transition-colors"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00F2FF]/50 group-hover:border-[#00F2FF] transition-colors"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00F2FF]/50 group-hover:border-[#00F2FF] transition-colors"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00F2FF]/50 group-hover:border-[#00F2FF] transition-colors"></div>
              </div>

              <button
                onClick={handleStartClick}
                className="relative btn-cutout h-14 px-6 flex items-center justify-between gap-6 font-tech transition-all duration-300 min-w-[320px]"
              >
                {/* 좌측: Play 아이콘 */}
                <div className="flex-shrink-0">
                  <Play className="w-5 h-5 fill-current" />
                </div>

                {/* 중앙: 텍스트 영역 */}
                <div className="flex items-center gap-3 flex-1 justify-center">
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[9px] text-[#0B0E14]/60 tracking-[0.2em]">PRESS TO</span>
                    <span className="text-lg font-bold tracking-wide text-[#0B0E14]">START</span>
                  </div>

                  {/* 구분선 */}
                  <div className="w-[2px] h-8 bg-[#0B0E14]/40"></div>

                  <span className="text-sm font-medium tracking-[0.15em] text-[#0B0E14]">INTERVIEW</span>
                </div>

                {/* 우측: 화살표 아이콘 (원형 배경) */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0B0E14]/10 flex items-center justify-center group-hover:bg-[#0B0E14]/20 transition-colors">
                  <span className="text-[#0B0E14] font-bold text-lg">»</span>
                </div>
              </button>
            </div>
          )}

          {/* 하단 데코레이션 */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div className="w-16 h-[1px] bg-gradient-to-r from-transparent to-[#00F2FF]/30"></div>
            <div className="w-1.5 h-1.5 bg-[#00F2FF]/50 rotate-45"></div>
            <p className="text-[10px] font-tech text-gray-500 tracking-widest">EvenI INTERVIEW SYSTEM</p>
            <div className="w-1.5 h-1.5 bg-[#00F2FF]/50 rotate-45"></div>
            <div className="w-16 h-[1px] bg-gradient-to-l from-transparent to-[#00F2FF]/30"></div>
          </div>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex items-start gap-4 ${
                message.role === 'assistant' ? 'justify-start' : 'justify-end'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0">
                  <div className="w-11 h-11 bg-gradient-gaming rounded-xl flex items-center justify-center shadow-glow">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-5 py-4 ${
                  message.role === 'assistant'
                    ? 'message-assistant'
                    : 'message-user shadow-glow'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="text-xs font-semibold text-cyber-400 mb-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full"></div>
                    <span>면접관</span>
                  </div>
                )}
                {message.role === 'user' && (
                  <div className="text-xs font-semibold text-white/70 mb-2 flex items-center gap-1.5">
                    <UserCircle className="w-3.5 h-3.5" />
                    <span>지원자</span>
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-gray-100">{message.content}</p>
              </div>

              {message.role === 'user' && (
                <div className="flex-shrink-0">
                  <div className="w-11 h-11 bg-gradient-to-br from-dark-500 to-dark-600 rounded-xl flex items-center justify-center border border-cyber-500/30">
                    <UserCircle className="w-6 h-6 text-cyber-300" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-4 justify-start">
              <div className="flex-shrink-0">
                <div className="w-11 h-11 bg-gradient-gaming rounded-xl flex items-center justify-center shadow-glow animate-glow-pulse">
                  <Bot className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="max-w-[75%] rounded-2xl px-5 py-4 message-assistant">
                <div className="text-xs font-semibold text-cyber-400 mb-2 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-neon-cyan rounded-full animate-pulse"></div>
                  <span>면접관</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-cyber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-cyber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-cyber-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-xs text-gray-400">답변 생성 중...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
