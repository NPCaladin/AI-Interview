'use client';

import { useState, useCallback } from 'react';
import { Bot, Volume2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import InputArea from '@/components/InputArea';
import Header from '@/components/Header';
import ReportView from '@/components/ReportView';
import LogPanel from '@/components/LogPanel';
import { useDevMode } from '@/contexts/DevModeContext';
import { TOTAL_QUESTION_COUNT } from '@/lib/constants';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useInterview } from '@/hooks/useInterview';
import { useStreamingAnalysis } from '@/hooks/useStreamingAnalysis';
import { toast } from 'sonner';

export default function Home() {
  const { isDevMode } = useDevMode();
  const [sttModel, setSttModel] = useState<'OpenAI Whisper' | 'Daglo'>('OpenAI Whisper');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const {
    audioUrl, audioPlayFailed, audioRef, handleManualAudioPlay,
    updateAudioUrl, clearAudioUrl, resetAudio,
  } = useAudioPlayer();

  const {
    messages, isLoading, isInterviewStarted, setIsInterviewStarted,
    selectedJob, setSelectedJob, selectedCompany, setSelectedCompany,
    questionCount, currentPhase, setResumeText,
    startInterview, sendMessage, handleAudioInput: interviewAudioInput,
    reset: interviewReset, canAnalyze,
  } = useInterview({ sttModel, updateAudioUrl, clearAudioUrl });

  const {
    interviewReport, isAnalyzing, streamingState,
    startAnalysis, retryAnalysis, resetAnalysis,
  } = useStreamingAnalysis({
    messages, selectedJob, selectedCompany, questionCount,
    isInterviewStarted, setIsInterviewStarted,
  });

  // 에러를 toast로 표시하는 래퍼
  const handleStartInterview = useCallback(async () => {
    try {
      await startInterview();
    } catch {
      toast.error('면접 시작에 실패했습니다. 다시 시도해주세요.');
    }
  }, [startInterview]);

  const handleSendMessage = useCallback(async (message: string) => {
    try {
      await sendMessage(message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      toast.error(msg);
    }
  }, [sendMessage]);

  const handleAudioInput = useCallback(async (audioBlob: Blob) => {
    try {
      await interviewAudioInput(audioBlob);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      toast.error(msg);
    }
  }, [interviewAudioInput]);

  const handleAnalyze = useCallback(async () => {
    try {
      await startAnalysis();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '면접 분석에 실패했습니다.';
      toast.error(msg);
    }
  }, [startAnalysis]);

  const handleReset = useCallback(() => {
    interviewReset();
    resetAnalysis();
    resetAudio();
  }, [interviewReset, resetAnalysis, resetAudio]);

  const phaseNames: Record<string, string> = {
    intro: '도입부',
    job: '직무 면접',
    personality: '인성 면접',
    closing: '마무리',
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        isMobileMenuOpen={isMobileMenuOpen}
        onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* 숨겨진 오디오 태그 */}
      <audio ref={audioRef} src={audioUrl || undefined} />

      {/* 오디오 자동재생 실패 시 재생 버튼 */}
      {audioPlayFailed && audioUrl && (
        <div className="fixed bottom-24 right-6 z-50">
          <button
            onClick={handleManualAudioPlay}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-gaming text-white rounded-full shadow-glow hover:shadow-glow-lg transition-all animate-pulse"
          >
            <Volume2 className="w-5 h-5" />
            <span className="font-medium">면접관 음성 재생</span>
          </button>
        </div>
      )}

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 md:px-6 py-4 md:py-6">
        {interviewReport || streamingState.isStreaming ? (
          <ReportView
            report={interviewReport || streamingState.partialReport}
            messages={messages}
            selectedJob={selectedJob}
            selectedCompany={selectedCompany}
            streaming={streamingState}
            onRetryAnalysis={retryAnalysis}
          />
        ) : (
          <div className="flex gap-4 md:gap-6 h-[calc(100vh-100px)] md:h-[calc(100vh-120px)]">
            {/* 왼쪽 사이드바 - 데스크톱 */}
            <div className="hidden md:block w-80 flex-shrink-0">
              <Sidebar
                onStartInterview={handleStartInterview}
                onReset={handleReset}
                onAnalyze={handleAnalyze}
                isInterviewStarted={isInterviewStarted}
                selectedJob={selectedJob}
                selectedCompany={selectedCompany}
                onJobChange={setSelectedJob}
                onCompanyChange={setSelectedCompany}
                sttModel={sttModel}
                onSttModelChange={setSttModel}
                questionCount={questionCount}
                canAnalyze={canAnalyze}
                isAnalyzing={isAnalyzing}
                onResumeUpload={setResumeText}
              />
            </div>

            {/* 모바일 사이드바 드로어 */}
            {isMobileMenuOpen && (
              <Sidebar
                onStartInterview={() => {
                  handleStartInterview();
                  setIsMobileMenuOpen(false);
                }}
                onReset={() => {
                  handleReset();
                  setIsMobileMenuOpen(false);
                }}
                onAnalyze={() => {
                  handleAnalyze();
                  setIsMobileMenuOpen(false);
                }}
                isInterviewStarted={isInterviewStarted}
                selectedJob={selectedJob}
                selectedCompany={selectedCompany}
                onJobChange={setSelectedJob}
                onCompanyChange={setSelectedCompany}
                sttModel={sttModel}
                onSttModelChange={setSttModel}
                questionCount={questionCount}
                canAnalyze={canAnalyze}
                isAnalyzing={isAnalyzing}
                onResumeUpload={setResumeText}
                isMobileOpen={isMobileMenuOpen}
                onMobileClose={() => setIsMobileMenuOpen(false)}
              />
            )}

            {/* 중앙 채팅 영역 */}
            <div className="flex-1 flex flex-col glass-card-dark rounded-2xl overflow-hidden hud-corners-full">
              {/* 채팅 헤더 */}
              <div className="bg-gradient-gaming px-4 md:px-6 py-3 md:py-4 border-b border-cyber-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-9 h-9 md:w-11 md:h-11 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20">
                      <Bot className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base md:text-lg font-semibold text-white font-tech tracking-wide">AI INTERVIEWER</h2>
                      <p className="text-xs md:text-sm text-neon-cyan font-medium">
                        {isInterviewStarted
                          ? `${questionCount}번째 질문 • ${phaseNames[currentPhase] || '진행 중'}`
                          : '면접 준비 중'}
                      </p>
                    </div>
                  </div>
                  {isInterviewStarted && (
                    <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-[#00F2FF]/10 border border-[#00F2FF]/30">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#00F2FF] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]"></div>
                      <span className="text-[10px] md:text-xs text-[#00F2FF] font-tech font-medium tracking-wider">LIVE</span>
                    </div>
                  )}
                </div>
                {isInterviewStarted && (
                  <div className="mt-3 md:mt-4">
                    <div className="flex justify-between text-[10px] md:text-xs text-white/60 mb-1 md:mb-1.5">
                      <span>진행률</span>
                      <span className="font-tech">{Math.min(Math.round((questionCount / TOTAL_QUESTION_COUNT) * 100), 100)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2 md:h-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 relative"
                        style={{
                          width: `${Math.min((questionCount / TOTAL_QUESTION_COUNT) * 100, 100)}%`,
                          background: 'linear-gradient(90deg, #00D9A5 0%, #40E0D0 50%, #00F5FF 100%)',
                          boxShadow: '0 0 10px rgba(64, 224, 208, 0.6), 0 0 20px rgba(64, 224, 208, 0.4)',
                        }}
                      >
                        <div
                          className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full"
                          style={{
                            background: 'radial-gradient(circle, #fff 0%, #40E0D0 50%, transparent 70%)',
                            boxShadow: '0 0 8px #40E0D0, 0 0 15px #40E0D0',
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <ChatArea
                messages={messages}
                isLoading={isLoading}
                isInterviewStarted={isInterviewStarted}
                onStartInterview={handleStartInterview}
                selectedJob={selectedJob}
                selectedCompany={selectedCompany}
              />

              <InputArea
                onSendMessage={handleSendMessage}
                onAudioInput={handleAudioInput}
                isInterviewStarted={isInterviewStarted}
                isLoading={isLoading}
              />
            </div>

            {/* 우측 로그 패널 (개발자 모드일 때만) */}
            {isDevMode && <LogPanel />}
          </div>
        )}
      </main>
    </div>
  );
}
