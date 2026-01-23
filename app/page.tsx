'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Volume2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import ChatArea, { Message } from '@/components/ChatArea';
import InputArea from '@/components/InputArea';
import Header from '@/components/Header';
import ReportView from '@/components/ReportView';
import LogPanel from '@/components/LogPanel';
import { useDevMode } from '@/contexts/DevModeContext';
import { getCurrentPhase } from '@/lib/utils';
import type { InterviewData } from '@/lib/utils';
import { TOTAL_QUESTION_COUNT } from '@/lib/constants';

interface InterviewReport {
  total_score: number;
  pass_prediction: string;
  summary_title: string;
  scores: {
    job_fit: number;
    logic: number;
    game_sense: number;
    attitude: number;
    communication: number;
  };
  feedback: {
    good_points: string[];
    bad_points: string[];
    improvement_guide: string;
  };
  best_answer: string;
  worst_answer: string;
  detailed_feedback_markdown: string;
}

export default function Home() {
  const { isDevMode, config, addDebugData } = useDevMode();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isInterviewStarted, setIsInterviewStarted] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [questionCount, setQuestionCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('intro');
  const [sttModel, setSttModel] = useState<'OpenAI Whisper' | 'Daglo'>('OpenAI Whisper');
  const [interviewData, setInterviewData] = useState<InterviewData | null>(null);
  const [lastAudioPlayed, setLastAudioPlayed] = useState<string | null>(null);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [resumeText, setResumeText] = useState<string>('');
  const [audioPlayFailed, setAudioPlayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // interview_data.json 로드
  useEffect(() => {
    const loadInterviewData = async () => {
      try {
        const response = await fetch('/interview_data.json');
        if (response.ok) {
          const data = await response.json();
          setInterviewData(data);
        } else {
          console.warn('interview_data.json을 로드할 수 없습니다. 기본 설정으로 진행합니다.');
        }
      } catch (error) {
        console.error('면접 데이터 로드 오류:', error);
      }
    };
    loadInterviewData();
  }, []);

  // audioUrl이 변경되면 자동 재생
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      setAudioPlayFailed(false);
      audioRef.current.play().catch((error) => {
        console.error('오디오 자동 재생 실패 (브라우저 정책):', error);
        setAudioPlayFailed(true);
      });
    }
  }, [audioUrl]);

  // 수동 오디오 재생 핸들러
  const handleManualAudioPlay = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setAudioPlayFailed(false);
      }).catch((error) => {
        console.error('오디오 재생 실패:', error);
      });
    }
  };

  // 면접 시작 (면접관의 첫 인사말 자동 생성)
  const startInterview = async () => {
    if (isInterviewStarted || !selectedJob || !selectedCompany) return;

    // 이전 오디오 URL 정리 (메모리 누수 방지)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    setIsInterviewStarted(true);
    setIsLoading(true);
    setQuestionCount(0);
    setCurrentPhase('intro');
    setAudioPlayFailed(false);

    try {
      const requestBody = {
        messages: [],
        interview_data: interviewData,
        selected_job: selectedJob,
        selected_company: selectedCompany,
        question_count: 0,
        is_first: true,
        ...(isDevMode && { config }),
        resume_text: resumeText || undefined,
      };

      const requestStartTime = Date.now();

      // 빈 대화 내역으로 첫 인사말 요청
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!chatResponse.ok) {
        throw new Error('Chat API 요청 실패');
      }

      const chatData = await chatResponse.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: chatData.message,
      };

      // 면접관의 첫 인사말을 messages에 추가
      setMessages([assistantMessage]);
      setQuestionCount(1);
      setCurrentPhase(getCurrentPhase(1));

      // TTS로 음성 생성
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: chatData.message,
        }),
      });

      if (!ttsResponse.ok) {
        throw new Error('TTS API 요청 실패');
      }

      const audioBlob = await ttsResponse.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setLastAudioPlayed(null);
    } catch (error) {
      console.error('면접 시작 오류:', error);
      alert('면접 시작에 실패했습니다. 다시 시도해주세요.');
      setIsInterviewStarted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (userMessage: string) => {
    if (!isInterviewStarted) {
      alert('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
      return;
    }

    // 1. 사용자 메시지를 messages에 추가
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
    };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const requestBody = {
        messages: updatedMessages,
        interview_data: interviewData,
        selected_job: selectedJob,
        selected_company: selectedCompany,
        question_count: questionCount,
        is_first: false,
        ...(isDevMode && { config }),
        resume_text: resumeText || undefined,
      };

      const requestStartTime = Date.now();

      // 2. /api/chat에 POST 요청 (전체 대화 내역 전송)
      console.log('Chat API 요청 시작:', { questionCount, selectedJob, selectedCompany });

      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Chat API 응답 상태:', chatResponse.status, chatResponse.ok);

      if (!chatResponse.ok) {
        let errorData;
        try {
          errorData = await chatResponse.json();
        } catch {
          errorData = { error: `HTTP ${chatResponse.status} 오류` };
        }
        console.error('Chat API 오류:', errorData);
        throw new Error(errorData.error || `Chat API 요청 실패 (${chatResponse.status})`);
      }

      let chatData;
      try {
        chatData = await chatResponse.json();
        console.log('Chat API 응답 데이터:', chatData);
      } catch (parseError) {
        console.error('JSON 파싱 오류:', parseError);
        throw new Error('서버 응답을 파싱할 수 없습니다.');
      }

      // 개발자 모드: 디버그 데이터 추가
      if (isDevMode) {
        const latency = chatData._meta?.latency || (Date.now() - requestStartTime);
        addDebugData({
          latency,
          requestBody,
          responseBody: chatData,
        });
      }

      // 에러 응답 체크
      if (chatData.error) {
        console.error('Chat API 에러 응답:', chatData.error);
        throw new Error(chatData.error);
      }

      if (!chatData.message) {
        console.error('Chat API 응답에 message 필드 없음:', chatData);
        throw new Error('AI 답변이 비어있습니다.');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: chatData.message,
      };

      console.log('AI 답변 추가:', assistantMessage.content.substring(0, 50) + '...');

      // 3. AI 답변을 messages에 추가
      const newQuestionCount = questionCount + 1;
      setMessages([...updatedMessages, assistantMessage]);
      setQuestionCount(newQuestionCount);
      setCurrentPhase(getCurrentPhase(newQuestionCount));

      // 면접 종료 체크는 제거 (사용자가 직접 종료 버튼을 눌러야 함)

      // 4. AI 답변 텍스트로 /api/tts에 POST 요청
      const ttsResponse = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: chatData.message,
        }),
      });

      if (!ttsResponse.ok) {
        throw new Error('TTS API 요청 실패');
      }

      // 5. 받아온 오디오 Blob을 URL로 변환하여 audioUrl에 저장
      const audioBlob = await ttsResponse.blob();
      const url = URL.createObjectURL(audioBlob);

      // 이전 오디오 URL 정리
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(url);
      setLastAudioPlayed(null);

      // 성공 시 로딩 상태 해제
      setIsLoading(false);
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      alert(`메시지 전송에 실패했습니다: ${errorMessage}`);
      // 에러 발생 시에도 로딩 상태 해제
      setIsLoading(false);
    }
  };

  const handleAudioInput = async (audioBlob: Blob) => {
    if (!isInterviewStarted) {
      alert('먼저 좌측 사이드바에서 "면접 시작" 버튼을 눌러주세요.');
      return;
    }

    setIsLoading(true);

    try {
      // 오디오를 base64로 변환
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];

        // STT API 호출
        const sttResponse = await fetch('/api/stt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio: base64Audio,
            stt_model: sttModel,
          }),
        });

        if (!sttResponse.ok) {
          let errorData;
          try {
            errorData = await sttResponse.json();
          } catch {
            const text = await sttResponse.text().catch(() => '');
            errorData = { error: `HTTP ${sttResponse.status} 오류${text ? ': ' + text.substring(0, 100) : ''}` };
          }

          // DAGLO_API_KEY 관련 에러인 경우 명확한 메시지 표시
          const errorMessage = errorData.error || `STT API 요청 실패 (${sttResponse.status})`;
          console.error('[STT API] 오류 응답:', errorMessage);

          if (errorMessage.includes('DAGLO_API_KEY') || errorMessage.includes('Daglo')) {
            alert(`Daglo STT 오류\n\n${errorMessage}\n\n.env.local 파일에 DAGLO_API_KEY를 설정하고 개발 서버를 재시작해주세요.`);
          } else {
            alert(`STT 오류\n\n${errorMessage}`);
          }
          throw new Error(errorMessage);
        }

        const sttData = await sttResponse.json();

        // 에러 응답 체크
        if (sttData.error) {
          console.error('[STT API] 에러 응답:', sttData.error);

          // DAGLO_API_KEY 관련 에러인 경우 명확한 메시지 표시
          if (sttData.error.includes('DAGLO_API_KEY') || sttData.error.includes('Daglo')) {
            alert(`Daglo STT 오류\n\n${sttData.error}\n\n.env.local 파일에 DAGLO_API_KEY를 설정하고 개발 서버를 재시작해주세요.`);
          } else {
            alert(`STT 오류\n\n${sttData.error}`);
          }
          throw new Error(sttData.error);
        }

        const transcribedText = sttData.text;

        if (!transcribedText || transcribedText.trim().length < 5) {
          alert('음성을 인식하지 못했습니다. 다시 시도해주세요.');
          setIsLoading(false);
          return;
        }

        // 인식된 텍스트로 메시지 전송
        await handleSendMessage(transcribedText.trim());
      };

      reader.onerror = () => {
        setIsLoading(false);
        alert('오디오 파일을 읽는데 실패했습니다. 다시 시도해주세요.');
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('오디오 처리 오류:', error);
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      alert(`오디오 처리에 실패했습니다: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  // 면접 초기화
  const handleReset = () => {
    setMessages([]);
    setIsInterviewStarted(false);
    setQuestionCount(0);
    setCurrentPhase('intro');
    setInterviewReport(null);
    setIsAnalyzing(false);
    setLastAudioPlayed(null);
    setAudioPlayFailed(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  // 면접 종료 및 분석
  const handleAnalyze = async () => {
    if (!isInterviewStarted || messages.length === 0 || questionCount < 5) {
      alert('최소 5개의 질문에 답변해야 분석할 수 있습니다.');
      return;
    }

    setIsAnalyzing(true);
    setIsLoading(true);

    try {
      const analyzeResponse = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          selected_job: selectedJob,
        }),
      });

      if (!analyzeResponse.ok) {
        throw new Error('분석 API 요청 실패');
      }

      const reportData = await analyzeResponse.json();
      setInterviewReport(reportData);
      setIsInterviewStarted(false);
    } catch (error) {
      console.error('면접 분석 오류:', error);
      alert('면접 분석에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsAnalyzing(false);
      setIsLoading(false);
    }
  };

  const phaseNames: Record<string, string> = {
    intro: '도입부',
    job: '직무 면접',
    personality: '인성 면접',
    closing: '마무리',
  };

  const canAnalyze = isInterviewStarted && messages.length > 0 && questionCount >= 5;

  return (
    <div className="min-h-screen flex flex-col">
      {/* 헤더 */}
      <Header />

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

      {/* 메인 컨텐츠 */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-6 py-6">
        {interviewReport ? (
          /* 리포트 뷰 */
          <ReportView
            report={interviewReport}
            messages={messages}
            selectedJob={selectedJob}
            selectedCompany={selectedCompany}
          />
        ) : (
          <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* 왼쪽 사이드바 */}
            <div className="w-80 flex-shrink-0">
              <Sidebar
                onStartInterview={startInterview}
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
                onResumeUpload={(text) => setResumeText(text)}
              />
            </div>

            {/* 중앙 채팅 영역 */}
            <div className="flex-1 flex flex-col glass-card-dark rounded-2xl overflow-hidden hud-corners-full">
              {/* 채팅 헤더 */}
              <div className="bg-gradient-gaming px-6 py-4 border-b border-cyber-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white font-tech tracking-wide">AI INTERVIEWER</h2>
                      <p className="text-sm text-neon-cyan font-medium">
                        {isInterviewStarted
                          ? `${questionCount}번째 질문 • ${phaseNames[currentPhase] || '진행 중'}`
                          : '면접 준비 중'}
                      </p>
                    </div>
                  </div>
                  {isInterviewStarted && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00F2FF]/10 border border-[#00F2FF]/30">
                      <div className="w-2 h-2 bg-[#00F2FF] rounded-full animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]"></div>
                      <span className="text-xs text-[#00F2FF] font-tech font-medium tracking-wider">LIVE</span>
                    </div>
                  )}
                </div>
                {isInterviewStarted && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-white/60 mb-1.5">
                      <span>진행률</span>
                      <span className="font-tech">{Math.min(Math.round((questionCount / TOTAL_QUESTION_COUNT) * 100), 100)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 relative"
                        style={{
                          width: `${Math.min((questionCount / TOTAL_QUESTION_COUNT) * 100, 100)}%`,
                          background: 'linear-gradient(90deg, #00D9A5 0%, #40E0D0 50%, #00F5FF 100%)',
                          boxShadow: '0 0 10px rgba(64, 224, 208, 0.6), 0 0 20px rgba(64, 224, 208, 0.4)',
                        }}
                      >
                        {/* 끝부분 글로우 포인트 */}
                        <div
                          className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
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

              {/* 채팅 영역 */}
              <ChatArea
                messages={messages}
                isLoading={isLoading}
                isInterviewStarted={isInterviewStarted}
                onStartInterview={startInterview}
                selectedJob={selectedJob}
                selectedCompany={selectedCompany}
              />

              {/* 입력 영역 */}
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
