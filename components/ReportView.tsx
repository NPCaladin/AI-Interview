'use client';

import ReactMarkdown from 'react-markdown';
import { Download, Trophy, Target, Zap, TrendingUp, MessageSquare } from 'lucide-react';

interface Report {
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

interface ReportViewProps {
  report: Report;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  selectedJob: string;
  selectedCompany: string;
  onDownload?: () => void;
}

export default function ReportView({
  report,
  messages,
  selectedJob,
  selectedCompany,
  onDownload,
}: ReportViewProps) {
  const { total_score, pass_prediction, summary_title, scores, feedback, detailed_feedback_markdown } = report;

  // 합격 예측에 따른 색상 결정
  let statusColor = 'from-red-500 to-red-600';
  let statusBg = 'bg-red-500/10 border-red-500/30';
  let statusText = 'text-red-400';
  if (pass_prediction.includes('합격') && !pass_prediction.includes('보류')) {
    statusColor = 'from-neon-green to-emerald-500';
    statusBg = 'bg-neon-green/10 border-neon-green/30';
    statusText = 'text-neon-green';
  } else if (pass_prediction.includes('보류')) {
    statusColor = 'from-yellow-500 to-amber-500';
    statusBg = 'bg-yellow-500/10 border-yellow-500/30';
    statusText = 'text-yellow-400';
  }

  const scoreItems = [
    { key: 'job_fit', label: '직무 적합도', icon: Target },
    { key: 'logic', label: '논리성', icon: Zap },
    { key: 'game_sense', label: '게임 센스', icon: Trophy },
    { key: 'attitude', label: '태도', icon: TrendingUp },
    { key: 'communication', label: '소통 능력', icon: MessageSquare },
  ] as const;

  // 점수에 따른 프로그레스 바 색상
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'from-neon-green to-emerald-500';
    if (score >= 60) return 'from-neon-cyan to-cyber-500';
    if (score >= 40) return 'from-yellow-500 to-amber-500';
    return 'from-red-500 to-red-600';
  };

  const handleDownload = () => {
    // 다운로드용 텍스트 생성
    const content: string[] = [];

    content.push('='.repeat(50));
    content.push('AI 모의면접 결과 리포트');
    content.push(`일시: ${new Date().toLocaleString('ko-KR')}`);
    content.push(`지원: ${selectedCompany} / ${selectedJob}`);
    content.push('='.repeat(50));
    content.push('');

    content.push('='.repeat(50));
    content.push('면접 분석 결과');
    content.push('='.repeat(50));
    content.push('');

    content.push(`총점: ${total_score}점`);
    content.push(`결과: ${pass_prediction}`);
    content.push('');

    content.push('[역량별 점수]');
    scoreItems.forEach(({ key, label }) => {
      content.push(`  - ${label}: ${scores[key]}점`);
    });
    content.push('');

    if (summary_title) {
      content.push('[종합 피드백]');
      content.push(summary_title);
      content.push('');
    }

    if (feedback.good_points.length > 0) {
      content.push('[강점]');
      feedback.good_points.forEach((point) => {
        content.push(`  - ${point}`);
      });
      content.push('');
    }

    if (feedback.bad_points.length > 0) {
      content.push('[보완점]');
      feedback.bad_points.forEach((point) => {
        content.push(`  - ${point}`);
      });
      content.push('');
    }

    if (detailed_feedback_markdown) {
      content.push('='.repeat(50));
      content.push('상세 분석 리포트');
      content.push('='.repeat(50));
      content.push('');
      // 마크다운 형식을 텍스트로 변환 (간단한 정리)
      const cleanedFeedback = detailed_feedback_markdown
        .replace(/^#+\s*/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1');
      content.push(cleanedFeedback);
      content.push('');
    }

    content.push('='.repeat(50));
    content.push('면접 대화 기록 (Script)');
    content.push('='.repeat(50));
    content.push('');

    messages.forEach((msg) => {
      const role = msg.role === 'assistant' ? '면접관' : '지원자';
      content.push(`[${role}]`);
      content.push(msg.content);
      content.push('');
    });

    const blob = new Blob([content.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeCompany = selectedCompany.replace(/[()/]/g, '_');
    a.href = url;
    a.download = `면접결과_${safeCompany}_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (onDownload) {
      onDownload();
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-dark-800 to-dark-900 p-6 scrollbar-gaming">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-gaming rounded-xl shadow-glow">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text font-tech tracking-wide">INTERVIEW REPORT</h1>
            <p className="text-sm text-gray-400">{selectedCompany} / {selectedJob}</p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="btn-gaming px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-tech tracking-wider"
        >
          <Download className="w-4 h-4" />
          결과 다운로드
        </button>
      </div>

      {/* 점수 보드 - 게임 스코어보드 스타일 */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {/* 총점 */}
        <div className="glass-card-dark rounded-xl p-5 relative overflow-hidden hud-corners">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyber-500/10 rounded-full blur-2xl"></div>
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-neon-cyan rounded-full"></div>
            총점
          </div>
          <div className="text-4xl font-bold gradient-text font-tech">{total_score}<span className="text-lg text-gray-400">점</span></div>
          <div className="mt-3 h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon-cyan to-cyber-500 rounded-full transition-all duration-1000 progress-gaming-fill"
              style={{ width: `${total_score}%` }}
            ></div>
          </div>
        </div>

        {/* 합격 예측 */}
        <div className={`glass-card-dark rounded-xl p-5 border ${statusBg}`}>
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${statusColor}`}></div>
            합격 예측
          </div>
          <div className={`text-2xl font-bold ${statusText}`}>
            {pass_prediction}
          </div>
          <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusBg} ${statusText}`}>
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse bg-gradient-to-r ${statusColor}`}></div>
            AI 분석 결과
          </div>
        </div>

        {/* 종합 피드백 */}
        <div className="glass-card-dark rounded-xl p-5">
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-cyber-400 rounded-full"></div>
            종합 평가
          </div>
          {summary_title && (
            <p className="text-sm text-gray-200 leading-relaxed">{summary_title}</p>
          )}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyber-500/30 to-transparent my-8"></div>

      {/* 상세 리포트 */}
      {detailed_feedback_markdown ? (
        <div>
          <h2 className="text-xl font-bold text-gray-100 mb-6 flex items-center gap-3">
            <div className="w-1 h-6 bg-gradient-gaming rounded-full"></div>
            상세 분석 리포트
          </h2>

          {/* 역량 점수 요약 - 게이밍 프로그레스 바 */}
          <div className="mb-8 glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-5 flex items-center gap-2">
              <Zap className="w-5 h-5 text-neon-cyan" />
              역량 점수 요약
            </h3>
            <div className="space-y-4">
              {scoreItems.map(({ key, label, icon: Icon }) => {
                const scoreValue = scores[key];
                return (
                  <div key={key} className="group">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-cyber-400" />
                        {label}
                      </span>
                      <span className="text-sm font-bold text-gray-100">{scoreValue}<span className="text-gray-500">점</span></span>
                    </div>
                    <div className="w-full h-2.5 bg-dark-600 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${getScoreColor(scoreValue)} rounded-full transition-all duration-700 shadow-glow-sm`}
                        style={{ width: `${scoreValue}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 구분선 */}
          <div className="h-[1px] bg-gradient-to-r from-transparent via-cyber-500/30 to-transparent my-8"></div>

          {/* 상세 피드백 마크다운 */}
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-gray-100 prose-headings:font-bold
            prose-p:text-gray-300 prose-p:leading-relaxed
            prose-strong:text-cyber-300
            prose-ul:text-gray-300
            prose-li:marker:text-cyber-500
            prose-a:text-neon-cyan prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown>{detailed_feedback_markdown}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* 역량 점수 */}
          <div className="glass-card-dark rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-200 mb-5 flex items-center gap-2">
              <Zap className="w-5 h-5 text-neon-cyan" />
              역량 점수
            </h3>
            <div className="space-y-4">
              {scoreItems.map(({ key, label, icon: Icon }) => {
                const scoreValue = scores[key];
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-cyber-400" />
                        {label}
                      </span>
                      <span className="text-sm font-bold text-gray-100">{scoreValue}<span className="text-gray-500">점</span></span>
                    </div>
                    <div className="w-full h-2.5 bg-dark-600 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${getScoreColor(scoreValue)} rounded-full transition-all duration-700`}
                        style={{ width: `${scoreValue}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 핵심 피드백 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-cyber-400" />
              핵심 피드백
            </h3>

            {feedback.good_points.length > 0 && (
              <div className="glass-card-dark rounded-xl p-5 border border-neon-green/20">
                <p className="text-sm font-semibold text-neon-green mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-neon-green rounded-full"></div>
                  잘한 점
                </p>
                <ul className="space-y-2">
                  {feedback.good_points.slice(0, 3).map((point, idx) => (
                    <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-neon-green mt-1">-</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {feedback.bad_points.length > 0 && (
              <div className="glass-card-dark rounded-xl p-5 border border-yellow-500/20">
                <p className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                  개선이 필요한 점
                </p>
                <ul className="space-y-2">
                  {feedback.bad_points.slice(0, 3).map((point, idx) => (
                    <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-yellow-400 mt-1">-</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
