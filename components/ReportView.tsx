'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { Download, Trophy, Target, Zap, TrendingUp, MessageSquare, ChevronUp, FileText, RefreshCw, CheckCircle2, AlertTriangle, Star } from 'lucide-react';
import type { GameInterviewReport, StreamingReportState, PremiumFeedbackItem } from '@/lib/types';
import { SCORE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';

// ========================================
// 스트리밍 진행 배너
// ========================================

function StreamingBanner({
  streaming,
  onRetry,
}: {
  streaming: StreamingReportState;
  onRetry?: () => void;
}) {
  // 에러 상태 확인
  if (streaming.error) {
    return (
      <div className="mb-6 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div className="flex-1">
              <p className="font-bold text-red-400">분석 중 오류가 발생했습니다</p>
              <p className="text-sm text-red-300 mt-1">{streaming.error}</p>
            </div>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 w-fit"
            >
              <RefreshCw className="w-4 h-4" />
              분석 다시 시도
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!streaming.isStreaming) return null;

  // 진행률에 따른 아이콘 결정
  const getProgressIcon = (progress: number) => {
    if (progress < 15) return '🚀';
    if (progress < 40) return '⭐';
    if (progress < 90) return '📝';
    return '✅';
  };

  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-cyber-500/10 to-neon-cyan/10 border-2 border-cyber-500/30 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl animate-bounce">{getProgressIcon(streaming.progress)}</span>
          <div>
            <p className="font-bold text-cyber-300">{streaming.currentStep || '분석 중...'}</p>
            <p className="text-sm text-gray-400">잠시만 기다려주세요...</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-cyber-400">{Math.round(streaming.progress)}%</span>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-3 bg-dark-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyber-500 to-neon-cyan transition-all duration-500 ease-out"
          style={{ width: `${streaming.progress}%` }}
        />
      </div>

      {/* 단계 표시 */}
      <div className="flex justify-between mt-4 text-xs text-gray-500">
        {['시작', 'STAR', '종합평가', '상세분석', '완료'].map((stage, idx) => {
          const stageProgress = [5, 15, 40, 90, 100];
          const isComplete = streaming.progress >= stageProgress[idx];
          const isCurrent = streaming.progress >= (stageProgress[idx - 1] || 0) && streaming.progress < stageProgress[idx];
          return (
            <div key={stage} className={`flex flex-col items-center ${isComplete ? 'text-cyber-400' : isCurrent ? 'text-cyber-300' : ''}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1
                ${isComplete ? 'bg-cyber-500 text-white' : isCurrent ? 'bg-cyber-500/30 text-cyber-300 animate-pulse' : 'bg-dark-600'}`}>
                {isComplete ? '✓' : idx + 1}
              </div>
              <span>{stage}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========================================
// STAR 분석 시각화 컴포넌트
// ========================================

function STARVisualization({ analysis }: { analysis: PremiumFeedbackItem['star_analysis'] }) {
  if (!analysis) return null;

  const items = [
    { key: 'situation', label: 'S (상황)', data: analysis.situation },
    { key: 'task', label: 'T (역할)', data: analysis.task },
    { key: 'action', label: 'A (행동)', data: analysis.action },
    { key: 'result', label: 'R (결과)', data: analysis.result },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-neon-green';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 70) return '○';
    if (score >= 50) return '△';
    return '×';
  };

  return (
    <div className="mt-4 p-4 bg-dark-700/50 rounded-lg border border-dark-500">
      <div className="flex items-center gap-2 mb-3">
        <Star className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-semibold text-gray-300">STAR 분석</span>
        <span className="text-xs text-gray-500 ml-2">
          {items.map(item => (
            <span key={item.key} className={`mr-2 ${getScoreColor(item.data.score)}`}>
              {item.label.charAt(0)}:{getScoreIcon(item.data.score)}
            </span>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.key} className="p-2 bg-dark-600/50 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-400">{item.label}</span>
              <span className={`text-xs font-bold ${getScoreColor(item.data.score)}`}>
                {item.data.score}점
              </span>
            </div>
            {item.data.found && (
              <p className="text-xs text-gray-500 mb-1 italic">&ldquo;{item.data.found}&rdquo;</p>
            )}
            <p className="text-xs text-gray-400">{item.data.feedback}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// 질문별 상세 피드백 카드
// ========================================

function QuestionFeedbackCard({ feedback, index }: { feedback: PremiumFeedbackItem; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-neon-green border-neon-green/30 bg-neon-green/10';
    if (score >= 60) return 'text-cyber-400 border-cyber-400/30 bg-cyber-400/10';
    if (score >= 40) return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
    return 'text-red-400 border-red-400/30 bg-red-400/10';
  };

  return (
    <div className="glass-card-dark rounded-xl p-5 mb-4 border border-dark-500 hover:border-cyber-500/30 transition-colors">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-cyber-500/20 text-cyber-400 text-xs font-bold rounded">
              Q{feedback.question_number}
            </span>
            {feedback.question_type && (
              <span className="px-2 py-0.5 bg-dark-600 text-gray-400 text-xs rounded">
                {feedback.question_type}
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium text-gray-200 leading-relaxed">
            {feedback.question}
          </h4>
        </div>
        <div className={`px-3 py-1.5 rounded-lg border ${getScoreColor(feedback.score)}`}>
          <span className="text-lg font-bold">{feedback.score}</span>
          <span className="text-xs ml-0.5">점</span>
        </div>
      </div>

      {/* 답변 요약 */}
      <div className="mb-4 p-3 bg-dark-700/50 rounded-lg">
        <p className="text-xs text-gray-500 mb-1">🗣️ 지원자 답변 요약</p>
        <p className="text-sm text-gray-300 leading-relaxed">{feedback.answer_summary}</p>
      </div>

      {/* STAR 분석 */}
      {feedback.star_analysis && <STARVisualization analysis={feedback.star_analysis} />}

      {/* 평가 */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3 bg-neon-green/5 border border-neon-green/20 rounded-lg">
          <p className="text-xs font-semibold text-neon-green mb-2 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> 강점
          </p>
          <ul className="space-y-1">
            {feedback.evaluation.strengths.map((s, i) => (
              <li key={i} className="text-xs text-gray-400 leading-relaxed">• {s}</li>
            ))}
          </ul>
        </div>
        <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <p className="text-xs font-semibold text-yellow-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> 약점
          </p>
          <ul className="space-y-1">
            {feedback.evaluation.weaknesses.map((w, i) => (
              <li key={i} className="text-xs text-gray-400 leading-relaxed">• {w}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 확장 가능한 개선 가이드 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-4 w-full text-left p-3 bg-dark-600/50 rounded-lg hover:bg-dark-600 transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-cyber-400">💡 개선 가이드 & 모범 답안</span>
          <ChevronUp className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {/* 개선 팁 */}
          <div className="p-3 bg-dark-700/50 rounded-lg">
            <p className="text-xs font-semibold text-gray-300 mb-2">구체적 개선 방법</p>
            <ul className="space-y-2">
              {feedback.improvement.specific_tips.map((tip, i) => (
                <li key={i} className="text-xs text-gray-400 leading-relaxed pl-3 border-l-2 border-cyber-500/30">
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* 모범 답안 */}
          <div className="p-3 bg-cyber-500/5 border border-cyber-500/20 rounded-lg">
            <p className="text-xs font-semibold text-cyber-400 mb-2">📝 모범 답안 예시</p>
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
              {feedback.improvement.model_answer_example}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// 메인 ReportView 컴포넌트
// ========================================

interface ReportViewProps {
  report: GameInterviewReport | null;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  selectedJob: string;
  selectedCompany: string;
  onDownload?: () => void;
  onRetryAnalysis?: () => void;
  streaming?: StreamingReportState;
}

export default function ReportView({
  report,
  messages,
  selectedJob,
  selectedCompany,
  onDownload,
  onRetryAnalysis,
  streaming,
}: ReportViewProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 스트리밍 중일 때 빈 리포트 처리
  const isStreaming = streaming?.isStreaming || false;

  // 리포트 데이터 추출 (null 안전 처리)
  const total_score = report?.total_score || 0;
  const pass_prediction = report?.pass_prediction || '';
  const summary_title = report?.summary_title || '';
  const scores = report?.scores || { job_fit: 0, logic: 0, game_sense: 0, attitude: 0, communication: 0 };
  const scores_detail = report?.scores_detail;
  const feedback = report?.feedback || { good_points: [], bad_points: [], improvement_guide: '' };
  const detailed_feedback = report?.detailed_feedback || [];
  const detailed_feedback_markdown = report?.detailed_feedback_markdown;
  const overall_summary = report?.overall_summary;
  const best_answer_analysis = report?.best_answer_analysis;
  const worst_answer_analysis = report?.worst_answer_analysis;
  const star_analysis = report?.star_analysis;

  // 스크롤 이벤트
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // 합격 예측 색상
  let statusColor = 'from-red-500 to-red-600';
  let statusBg = 'bg-red-500/10 border-red-500/30';
  let statusText = 'text-red-400';
  if (pass_prediction?.includes('합격') && !pass_prediction?.includes('보류')) {
    statusColor = 'from-neon-green to-emerald-500';
    statusBg = 'bg-neon-green/10 border-neon-green/30';
    statusText = 'text-neon-green';
  } else if (pass_prediction?.includes('보류')) {
    statusColor = 'from-yellow-500 to-amber-500';
    statusBg = 'bg-yellow-500/10 border-yellow-500/30';
    statusText = 'text-yellow-400';
  }

  // 레이더 차트 데이터
  const radarData = scores ? [
    { subject: '직무 적합도', score: scores.job_fit, fullMark: 100 },
    { subject: '논리성', score: scores.logic, fullMark: 100 },
    { subject: '게임 센스', score: scores.game_sense, fullMark: 100 },
    { subject: '태도', score: scores.attitude, fullMark: 100 },
    { subject: '소통 능력', score: scores.communication, fullMark: 100 },
  ] : [];

  const scoreItems = [
    { key: 'job_fit', label: '직무 적합도', icon: Target },
    { key: 'logic', label: '논리성', icon: Zap },
    { key: 'game_sense', label: '게임 센스', icon: Trophy },
    { key: 'attitude', label: '태도', icon: TrendingUp },
    { key: 'communication', label: '소통 능력', icon: MessageSquare },
  ] as const;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'from-neon-green to-emerald-500';
    if (score >= 60) return 'from-neon-cyan to-cyber-500';
    if (score >= 40) return 'from-yellow-500 to-amber-500';
    return 'from-red-500 to-red-600';
  };

  // TXT 다운로드
  const handleDownloadTxt = () => {
    const content: string[] = [];
    content.push('='.repeat(50));
    content.push('AI 모의면접 결과 리포트');
    content.push(`일시: ${new Date().toLocaleString('ko-KR')}`);
    content.push(`지원: ${selectedCompany} / ${selectedJob}`);
    content.push('='.repeat(50));
    content.push('');
    content.push(`총점: ${total_score}점`);
    content.push(`결과: ${pass_prediction}`);
    content.push('');
    content.push('[역량별 점수]');
    if (scores) {
      scoreItems.forEach(({ key, label }) => {
        content.push(`  - ${label}: ${scores[key]}점`);
      });
    }
    content.push('');
    if (summary_title) {
      content.push('[종합 피드백]');
      content.push(summary_title);
      content.push('');
    }
    if (overall_summary) {
      content.push('[상세 종합 평가]');
      content.push(overall_summary.total_evaluation);
      content.push('');
      content.push('[핵심 강점]');
      content.push(overall_summary.core_strength);
      content.push('');
      content.push('[시급한 개선점]');
      content.push(overall_summary.critical_improvement);
      content.push('');
    }
    if (detailed_feedback && detailed_feedback.length > 0) {
      content.push('='.repeat(50));
      content.push('질문별 상세 분석');
      content.push('='.repeat(50));
      detailed_feedback.forEach((fb) => {
        content.push('');
        content.push(`Q${fb.question_number}. ${fb.question}`);
        content.push(`점수: ${fb.score}점`);
        content.push(`답변 요약: ${fb.answer_summary}`);
        if (fb.evaluation) {
          content.push('강점: ' + fb.evaluation.strengths.join(', '));
          content.push('약점: ' + fb.evaluation.weaknesses.join(', '));
        }
        content.push('');
      });
    }
    content.push('='.repeat(50));
    content.push('면접 대화 기록');
    content.push('='.repeat(50));
    messages.forEach((msg) => {
      const role = msg.role === 'assistant' ? '면접관' : '지원자';
      content.push(`[${role}] ${msg.content}`);
      content.push('');
    });

    const blob = new Blob([content.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `면접결과_${selectedCompany.replace(/[()/]/g, '_')}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onDownload?.();
  };

  // PDF 다운로드
  const handleDownloadPdf = async () => {
    if (!reportRef.current || isDownloading) return;
    setIsDownloading(true);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#0f0f0f',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      pdf.save(`면접결과_${selectedCompany.replace(/[()/]/g, '_')}_${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF 생성 오류:', err);
      toast.error('PDF 생성 중 오류가 발생했습니다. TXT 다운로드를 이용해주세요.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-dark-800 to-dark-900 p-3 md:p-6 scrollbar-gaming">
      {/* 스트리밍 배너 */}
      {streaming && <StreamingBanner streaming={streaming} onRetry={onRetryAnalysis} />}

      <div ref={reportRef}>
        {/* 헤더 */}
        <div className="mb-6 md:mb-8 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-gaming rounded-xl shadow-glow">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold gradient-text font-tech tracking-wide">INTERVIEW REPORT</h1>
              <p className="text-xs md:text-sm text-gray-400">{selectedCompany} / {selectedJob}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadTxt}
              className="btn-gaming px-3 py-2 md:px-4 rounded-lg flex items-center gap-1.5 md:gap-2 text-xs md:text-sm"
            >
              <FileText className="w-4 h-4" />
              TXT
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="btn-gaming px-3 py-2 md:px-4 rounded-lg flex items-center gap-1.5 md:gap-2 text-xs md:text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isDownloading ? '생성중...' : 'PDF'}
            </button>
          </div>
        </div>

        {/* 점수 보드 */}
        <div className="mb-6 md:mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {/* 총점 */}
          <div className="glass-card-dark rounded-xl p-5 relative overflow-hidden">
            <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-neon-cyan rounded-full" />
              총점
            </div>
            <div className="text-4xl font-bold gradient-text font-tech">
              {total_score}<span className="text-lg text-gray-400">점</span>
            </div>
            <div className="mt-3 h-1.5 bg-dark-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-neon-cyan to-cyber-500 rounded-full transition-all duration-1000"
                style={{ width: `${total_score}%` }}
              />
            </div>
          </div>

          {/* 합격 예측 */}
          <div className={`glass-card-dark rounded-xl p-5 border ${statusBg}`}>
            <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${statusColor}`} />
              합격 예측
            </div>
            <div className={`text-2xl font-bold ${statusText}`}>{pass_prediction}</div>
          </div>

          {/* 종합 피드백 */}
          <div className="glass-card-dark rounded-xl p-5">
            <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 bg-cyber-400 rounded-full" />
              종합 평가
            </div>
            <p className="text-sm text-gray-200 leading-relaxed">{summary_title}</p>
          </div>
        </div>

        {/* 레이더 차트 + 역량 점수 */}
        <div className="mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* 레이더 차트 */}
          <div className="glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-cyber-400" />
              역량 분석
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                <Radar
                  name="점수"
                  dataKey="score"
                  stroke="#06B6D4"
                  fill="#06B6D4"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 역량 점수 상세 */}
          <div className="glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-neon-cyan" />
              역량별 점수
            </h3>
            <div className="space-y-4">
              {scoreItems.map(({ key, label, icon: Icon }) => {
                const scoreValue = scores?.[key] || 0;
                const detail = scores_detail?.[key];
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-cyber-400" />
                        {label}
                      </span>
                      <span className="text-sm font-bold text-gray-100">{scoreValue}점</span>
                    </div>
                    <div className="w-full h-2 bg-dark-600 rounded-full overflow-hidden mb-1">
                      <div
                        className={`h-full bg-gradient-to-r ${getScoreColor(scoreValue)} rounded-full transition-all duration-700`}
                        style={{ width: `${scoreValue}%` }}
                      />
                    </div>
                    {detail && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{detail.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* STAR 분석 요약 */}
        {star_analysis && (
          <div className="mb-8 glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              STAR 구조 분석 요약
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {[
                { key: 'situation', label: 'Situation (상황)', score: star_analysis.situation },
                { key: 'task', label: 'Task (역할)', score: star_analysis.task },
                { key: 'action', label: 'Action (행동)', score: star_analysis.action },
                { key: 'result', label: 'Result (결과)', score: star_analysis.result },
              ].map(item => (
                <div key={item.key} className="text-center p-4 bg-dark-700/50 rounded-lg">
                  <div className="text-2xl font-bold gradient-text mb-1">{item.score}</div>
                  <div className="text-xs text-gray-400">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 종합 평가 상세 */}
        {overall_summary && (
          <div className="mb-8 glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">📊 종합 평가</h3>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-cyber-400 mb-2">전체 평가</h4>
                <p className="text-sm text-gray-300 leading-relaxed">{overall_summary.total_evaluation}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-neon-green/5 border border-neon-green/20 rounded-lg">
                  <h4 className="text-sm font-semibold text-neon-green mb-2">💪 핵심 강점</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{overall_summary.core_strength}</p>
                </div>
                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ 시급한 개선점</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{overall_summary.critical_improvement}</p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">📋 다음 면접 준비 체크리스트</h4>
                <ul className="space-y-1">
                  {overall_summary.next_step_checklist.map((item, i) => (
                    <li key={i} className="text-sm text-gray-300">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 질문별 상세 분석 */}
        {detailed_feedback && detailed_feedback.length > 0 ? (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-cyber-400" />
              질문별 상세 분석
              {streaming?.totalQuestions && (
                <span className="text-sm font-normal text-gray-500">
                  ({detailed_feedback.length}/{streaming.totalQuestions}개)
                </span>
              )}
            </h3>

            {/* 누락된 질문 경고 */}
            {streaming?.missingQuestions && streaming.missingQuestions.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-yellow-400 font-medium">
                    일부 질문이 분석되지 않았습니다
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    누락된 질문: Q{streaming.missingQuestions.join(', Q')}
                    {onRetryAnalysis && (
                      <button
                        onClick={onRetryAnalysis}
                        className="ml-2 text-cyber-400 hover:text-cyber-300 underline"
                      >
                        다시 분석하기
                      </button>
                    )}
                  </p>
                </div>
              </div>
            )}

            {detailed_feedback.map((fb, idx) => (
              <QuestionFeedbackCard key={fb.question_number || idx} feedback={fb} index={idx} />
            ))}
          </div>
        ) : detailed_feedback_markdown ? (
          /* 레거시 마크다운 피드백 (폴백) */
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">상세 분석 리포트</h3>
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-gray-100 prose-headings:font-bold prose-headings:mt-6 prose-headings:mb-3
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-3
              prose-strong:text-cyber-300
              prose-ul:text-gray-300 prose-ul:my-2
              prose-li:marker:text-cyber-500 prose-li:my-1
            ">
              <ReactMarkdown>{detailed_feedback_markdown}</ReactMarkdown>
            </div>
          </div>
        ) : null}

        {/* 최고/최저 답변 분석 */}
        {(best_answer_analysis || worst_answer_analysis) && (
          <div className="mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {best_answer_analysis && (
              <div className="glass-card-dark rounded-xl p-6 border border-neon-green/20">
                <h3 className="text-lg font-semibold text-neon-green mb-4">🏆 최고 답변 분석</h3>
                <p className="text-xs text-gray-500 mb-2">Q{best_answer_analysis.question_number}</p>
                <p className="text-sm text-gray-300 mb-3">{best_answer_analysis.question}</p>
                <div className="p-3 bg-dark-700/50 rounded-lg mb-3">
                  <p className="text-xs text-gray-400 leading-relaxed">{best_answer_analysis.answer}</p>
                </div>
                <ul className="space-y-1">
                  {best_answer_analysis.why_best?.map((reason, i) => (
                    <li key={i} className="text-xs text-gray-400">✓ {reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {worst_answer_analysis && (
              <div className="glass-card-dark rounded-xl p-6 border border-red-500/20">
                <h3 className="text-lg font-semibold text-red-400 mb-4">📉 개선 필요 답변</h3>
                <p className="text-xs text-gray-500 mb-2">Q{worst_answer_analysis.question_number}</p>
                <p className="text-sm text-gray-300 mb-3">{worst_answer_analysis.question}</p>
                <div className="p-3 bg-dark-700/50 rounded-lg mb-3">
                  <p className="text-xs text-gray-400 leading-relaxed">{worst_answer_analysis.answer}</p>
                </div>
                <div className="p-3 bg-cyber-500/5 border border-cyber-500/20 rounded-lg">
                  <p className="text-xs font-semibold text-cyber-400 mb-1">✏️ 개선된 답변 예시</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{worst_answer_analysis.rewrite_example}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll to Top 버튼 */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 p-3 min-w-[44px] min-h-[44px] flex items-center justify-center bg-cyber-500 rounded-full shadow-lg hover:bg-cyber-600 transition-colors z-50"
        >
          <ChevronUp className="w-5 h-5 text-white" />
        </button>
      )}
    </div>
  );
}
