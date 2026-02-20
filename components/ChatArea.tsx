'use client';

import { useRef, useEffect } from 'react';
import { UserCircle, Bot, Play, Terminal, Wifi, Signal, Volume2, Mic } from 'lucide-react';
import { toast } from 'sonner';
import type { Message } from '@/lib/types';
import { TOTAL_QUESTION_COUNT } from '@/lib/constants';

interface ChatAreaProps {
  messages: Message[];
  isLoading?: boolean;
  isInterviewStarted?: boolean;
  onStartInterview?: () => void;
  selectedJob?: string;
  selectedCompany?: string;
  questionCount?: number;
}

// 타이핑 효과 도트 애니메이션
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 bg-[#00F2FF] rounded-full animate-[bounce_1s_infinite_0ms]" />
      <span className="w-2 h-2 bg-[#00F2FF]/70 rounded-full animate-[bounce_1s_infinite_150ms]" />
      <span className="w-2 h-2 bg-[#00F2FF]/40 rounded-full animate-[bounce_1s_infinite_300ms]" />
    </div>
  );
}

// 면접관 메시지 컴포넌트
function InterviewerMessage({ content, isLatest }: { content: string; isLatest: boolean }) {
  return (
    <div className="flex items-start gap-2 md:gap-4 group">
      {/* 아바타 */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-[#00F2FF]/20 to-[#8b5cf6]/20 border border-[#00F2FF]/30 flex items-center justify-center backdrop-blur-sm">
          <Bot className="w-4 h-4 md:w-6 md:h-6 text-[#00F2FF]" />
        </div>
        {/* 온라인 상태 표시 */}
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3.5 md:h-3.5 bg-dark-800 rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#00ff88] rounded-full animate-pulse" />
        </div>
        {/* 음성 웨이브 (최신 메시지일 때) */}
        {isLatest && (
          <div className="absolute -left-1 top-1/2 -translate-y-1/2 hidden md:flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Volume2 className="w-3 h-3 text-[#00F2FF]/50" />
          </div>
        )}
      </div>

      {/* 메시지 버블 */}
      <div className="flex-1 max-w-[85%] md:max-w-[80%]">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-1.5 md:mb-2">
          <span className="text-[10px] md:text-xs font-mono text-[#00F2FF] tracking-wider">면접관</span>
          <div className="hidden md:flex items-center gap-1">
            <Signal className="w-3 h-3 text-[#00ff88]" />
            <span className="text-[10px] font-mono text-gray-500">AI</span>
          </div>
        </div>

        {/* 버블 */}
        <div className="relative">
          {/* 배경 글로우 */}
          <div className="absolute inset-0 bg-[#00F2FF]/5 rounded-2xl blur-xl" />

          {/* 메인 버블 */}
          <div className="relative bg-gradient-to-br from-dark-700/90 to-dark-800/90 backdrop-blur-md rounded-2xl rounded-tl-sm px-3 md:px-5 py-3 md:py-4 border border-[#00F2FF]/20">
            {/* 코너 장식 */}
            <div className="hidden md:block absolute top-0 right-0 w-4 h-4 border-t border-r border-[#00F2FF]/30 rounded-tr-2xl" />
            <div className="hidden md:block absolute bottom-0 left-0 w-4 h-4 border-b border-l border-[#8b5cf6]/30 rounded-bl-2xl" />

            <p className="text-xs md:text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// 지원자 메시지 컴포넌트
function ApplicantMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 md:gap-4 justify-end">
      {/* 메시지 버블 */}
      <div className="max-w-[85%] md:max-w-[80%]">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-1.5 md:mb-2 justify-end">
          <Mic className="hidden md:block w-3 h-3 text-[#8b5cf6]/50" />
          <span className="text-[10px] md:text-xs font-mono text-[#8b5cf6] tracking-wider">지원자</span>
        </div>

        {/* 버블 */}
        <div className="relative">
          {/* 배경 글로우 */}
          <div className="absolute inset-0 bg-[#8b5cf6]/10 rounded-2xl blur-xl" />

          {/* 메인 버블 */}
          <div className="relative bg-gradient-to-br from-[#8b5cf6]/30 to-[#6366f1]/20 backdrop-blur-md rounded-2xl rounded-tr-sm px-3 md:px-5 py-3 md:py-4 border border-[#8b5cf6]/30">
            {/* 스캔라인 효과 */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none opacity-20">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent h-[200%] animate-[scan_3s_linear_infinite]" />
            </div>

            <p className="text-xs md:text-sm leading-relaxed text-white whitespace-pre-wrap relative z-10">{content}</p>
          </div>
        </div>
      </div>

      {/* 아바타 */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-[#8b5cf6]/20 to-[#6366f1]/20 border border-[#8b5cf6]/30 flex items-center justify-center">
          <UserCircle className="w-4 h-4 md:w-6 md:h-6 text-[#8b5cf6]" />
        </div>
      </div>
    </div>
  );
}

// 로딩 메시지 컴포넌트
function LoadingMessage() {
  return (
    <div className="flex items-start gap-2 md:gap-4">
      {/* 아바타 */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-[#00F2FF]/20 to-[#8b5cf6]/20 border border-[#00F2FF]/30 flex items-center justify-center animate-pulse">
          <Bot className="w-4 h-4 md:w-6 md:h-6 text-[#00F2FF]" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 md:w-3.5 md:h-3.5 bg-dark-800 rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#00F2FF] rounded-full animate-ping" />
        </div>
      </div>

      {/* 메시지 */}
      <div className="max-w-[85%] md:max-w-[80%]">
        <div className="flex items-center gap-2 mb-1.5 md:mb-2">
          <span className="text-[10px] md:text-xs font-mono text-[#00F2FF] tracking-wider">면접관</span>
          <span className="text-[10px] font-mono text-[#00F2FF] animate-pulse">처리 중</span>
        </div>

        <div className="relative bg-gradient-to-br from-dark-700/90 to-dark-800/90 backdrop-blur-md rounded-2xl rounded-tl-sm px-3 md:px-5 py-3 md:py-4 border border-[#00F2FF]/20">
          <div className="flex items-center gap-2 md:gap-3">
            <TypingIndicator />
            <span className="text-xs md:text-sm text-gray-400">응답 생성 중...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 빈 상태 (시작 전) 컴포넌트
function EmptyState({
  onStartInterview,
  isInterviewStarted,
  selectedJob,
  selectedCompany,
}: {
  onStartInterview?: () => void;
  isInterviewStarted: boolean;
  selectedJob: string;
  selectedCompany: string;
}) {
  const handleStartClick = () => {
    if (!selectedJob || !selectedCompany) {
      toast.error('좌측 사이드바에서 직군 카테고리, 지원 직군, 회사를 모두 선택해주세요.');
      return;
    }
    onStartInterview?.();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full relative px-4 md:px-8">
      {/* 배경 그리드 애니메이션 */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,242,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] animate-[grid-move_20s_linear_infinite]" />
      </div>

      {/* 메인 컨텐츠 */}
      <div className="relative z-10 flex flex-col items-center">

        {/* 홀로그램 터미널 */}
        <div className="relative mb-8 md:mb-12 group">
          {/* 외부 링 - 모바일에서 숨김 */}
          <div className="hidden md:block absolute -inset-16 rounded-full border border-[#00F2FF]/10 animate-[spin_30s_linear_infinite]" />
          <div className="hidden md:block absolute -inset-12 rounded-full border border-[#8b5cf6]/10 animate-[spin_25s_linear_infinite_reverse]" />

          {/* 코너 마커 - 모바일에서 숨김 */}
          <div className="hidden md:block absolute -inset-8">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#00F2FF]/50 rotate-45" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#00F2FF]/50 rotate-45" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#8b5cf6]/50 rotate-45" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#8b5cf6]/50 rotate-45" />
          </div>

          {/* 터미널 박스 */}
          <div className="relative w-20 h-20 md:w-32 md:h-32 bg-gradient-to-br from-dark-700/80 to-dark-800/80 rounded-xl md:rounded-2xl border border-[#00F2FF]/30 backdrop-blur-xl flex items-center justify-center overflow-hidden">
            {/* 스캔라인 */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00F2FF]/5 to-transparent h-[200%] animate-[scan_2s_linear_infinite]" />

            {/* 아이콘 */}
            <div className="relative">
              <Terminal className="w-8 h-8 md:w-12 md:h-12 text-[#00F2FF] drop-shadow-[0_0_20px_rgba(0,242,255,0.5)]" />
              <div className="absolute inset-0 animate-ping">
                <Terminal className="w-8 h-8 md:w-12 md:h-12 text-[#00F2FF] opacity-30" />
              </div>
            </div>

            {/* 코너 HUD */}
            <div className="absolute top-1.5 left-1.5 md:top-2 md:left-2 w-2 h-2 md:w-3 md:h-3 border-t border-l border-[#00F2FF]/50" />
            <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-2 h-2 md:w-3 md:h-3 border-t border-r border-[#00F2FF]/50" />
            <div className="absolute bottom-1.5 left-1.5 md:bottom-2 md:left-2 w-2 h-2 md:w-3 md:h-3 border-b border-l border-[#8b5cf6]/50" />
            <div className="absolute bottom-1.5 right-1.5 md:bottom-2 md:right-2 w-2 h-2 md:w-3 md:h-3 border-b border-r border-[#8b5cf6]/50" />
          </div>

          {/* 글로우 */}
          <div className="absolute inset-0 bg-[#00F2FF]/10 rounded-xl md:rounded-2xl blur-2xl md:blur-3xl" />
        </div>

        {/* 상태 텍스트 */}
        <div className="text-center mb-6 md:mb-10">
          <div className="flex items-center justify-center gap-2 mb-3 md:mb-4">
            <Wifi className="w-3 h-3 md:w-4 md:h-4 text-[#00ff88] animate-pulse" />
            <span className="text-[10px] md:text-xs font-mono text-[#00ff88] tracking-[0.2em] md:tracking-[0.3em]">시스템 준비 완료</span>
          </div>

          <h2 className="text-2xl md:text-4xl font-bold mb-3 md:mb-4 tracking-tight">
            <span className="text-white">INTERVIEW</span>
            <span className="text-[#00F2FF] ml-2 md:ml-3 drop-shadow-[0_0_20px_rgba(0,242,255,0.5)]">TERMINAL</span>
          </h2>

          <p className="text-gray-400 max-w-sm md:max-w-md leading-relaxed text-xs md:text-sm px-2">
            <span className="md:hidden">메뉴에서 직군과 회사를 선택 후 시작하세요</span>
            <span className="hidden md:inline">
              좌측 패널에서 <span className="text-[#00F2FF] font-medium">직군</span>과{' '}
              <span className="text-[#8b5cf6] font-medium">회사</span>를 선택한 후<br />
              아래 버튼을 눌러 면접을 시작하세요
            </span>
          </p>
        </div>

        {/* 시작 버튼 */}
        {!isInterviewStarted && onStartInterview && (
          <button
            onClick={handleStartClick}
            className="group relative"
          >
            {/* 외부 글로우 */}
            <div className="absolute -inset-4 bg-gradient-to-r from-[#00F2FF]/20 to-[#8b5cf6]/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />

            {/* 버튼 */}
            <div className="relative px-6 md:px-10 py-3 md:py-4 bg-gradient-to-r from-[#00D9A5] via-[#00F2FF] to-[#00C4E0] rounded-xl overflow-hidden transition-all duration-300 group-hover:shadow-[0_0_40px_rgba(0,242,255,0.4)] group-active:scale-95">
              {/* 스캔 효과 */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

              {/* 컨텐츠 */}
              <div className="relative flex items-center gap-3 md:gap-4">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-dark-900/20 rounded-lg flex items-center justify-center">
                  <Play className="w-4 h-4 md:w-5 md:h-5 text-dark-900 fill-current" />
                </div>
                <div className="text-left">
                  <div className="text-[8px] md:text-[10px] text-dark-900/60 tracking-[0.15em] md:tracking-[0.2em] font-mono">START</div>
                  <div className="text-sm md:text-lg font-bold text-dark-900 tracking-wide">면접 시작하기</div>
                </div>
                <div className="ml-2 md:ml-4 text-xl md:text-2xl text-dark-900/60 font-light">»</div>
              </div>
            </div>

            {/* 코너 브라켓 - 모바일에서 숨김 */}
            <div className="hidden md:block absolute -inset-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00F2FF]" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00F2FF]" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#8b5cf6]" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#8b5cf6]" />
            </div>
          </button>
        )}

        {/* 선택 정보 표시 */}
        {(selectedJob || selectedCompany) && (
          <div className="mt-5 md:mt-8 flex flex-wrap items-center justify-center gap-2 md:gap-4 text-[10px] md:text-xs font-mono">
            {selectedJob && (
              <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-[#00F2FF]/10 border border-[#00F2FF]/30 rounded-lg">
                <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-[#00F2FF] rounded-full" />
                <span className="text-[#00F2FF]">{selectedJob}</span>
              </div>
            )}
            {selectedCompany && (
              <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 rounded-lg">
                <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-[#8b5cf6] rounded-full" />
                <span className="text-[#8b5cf6]">{selectedCompany}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 장식 - 모바일에서 숨김 */}
      <div className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 items-center gap-3">
        <div className="w-20 h-px bg-gradient-to-r from-transparent to-[#00F2FF]/30" />
        <span className="text-[10px] font-mono text-gray-600 tracking-[0.2em]">EvenI INTERVIEW v2.0</span>
        <div className="w-20 h-px bg-gradient-to-l from-transparent to-[#8b5cf6]/30" />
      </div>

      {/* 스타일 */}
      <style jsx>{`
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(0%); }
        }
      `}</style>
    </div>
  );
}

export default function ChatArea({
  messages,
  isLoading = false,
  isInterviewStarted = false,
  onStartInterview,
  selectedJob = '',
  selectedCompany = '',
  questionCount = 0,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 오면 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scrollbar-gaming relative"
      style={{
        background: `
          linear-gradient(to bottom, rgba(18,18,26,0.95), rgba(10,10,15,0.98)),
          radial-gradient(ellipse at top, rgba(0,242,255,0.05) 0%, transparent 50%),
          radial-gradient(ellipse at bottom, rgba(139,92,246,0.05) 0%, transparent 50%)
        `,
      }}
    >
      {messages.length === 0 && !isLoading ? (
        <EmptyState
          onStartInterview={onStartInterview}
          isInterviewStarted={isInterviewStarted}
          selectedJob={selectedJob}
          selectedCompany={selectedCompany}
        />
      ) : (
        <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-4xl mx-auto">
          {/* 세션 시작 표시 + 진행률 */}
          <div className="flex items-center justify-center gap-2 md:gap-4 py-2 md:py-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#00F2FF]/20 to-transparent" />
            <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1 md:py-1.5 bg-dark-700/50 rounded-full border border-[#00F2FF]/20">
              <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-[#00ff88] rounded-full animate-pulse" />
              <span className="text-[8px] md:text-[10px] font-mono text-gray-500 tracking-wider">세션 시작</span>
            </div>
            {questionCount > 0 && (
              <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1 md:py-1.5 bg-dark-700/50 rounded-full border border-[#8b5cf6]/20">
                <span className="text-[8px] md:text-[10px] font-mono text-[#8b5cf6] tracking-wider">
                  Q {Math.min(questionCount, TOTAL_QUESTION_COUNT)}/{TOTAL_QUESTION_COUNT}
                </span>
                <div className="w-12 md:w-16 h-1 bg-dark-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00F2FF] to-[#8b5cf6] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((questionCount / TOTAL_QUESTION_COUNT) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#8b5cf6]/20 to-transparent" />
          </div>

          {/* 메시지 목록 */}
          {messages.map((message, index) => (
            <div key={message.id}>
              {message.role === 'assistant' ? (
                <InterviewerMessage
                  content={message.content}
                  isLatest={index === messages.length - 1 && !isLoading}
                />
              ) : (
                <ApplicantMessage content={message.content} />
              )}
            </div>
          ))}

          {/* 로딩 표시 */}
          {isLoading && <LoadingMessage />}

          {/* 하단 여백 */}
          <div className="h-4" />
        </div>
      )}

      {/* 스타일 */}
      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </div>
  );
}
