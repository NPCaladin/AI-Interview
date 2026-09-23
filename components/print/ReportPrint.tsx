'use client';

import ReactMarkdown from 'react-markdown';
import type { BestWorstAnalysis, PremiumFeedbackItem } from '@/lib/types';
import type { ReportPrintPayload } from '@/lib/reportPrint';
import {
  computeStarSummary,
  formatKstDateTime,
  formatScore,
  getPassTone,
  getScoreTone,
} from '@/lib/reportUtils';
import PrintRadar from '@/components/print/PrintRadar';
import PrintQuestionBlock from '@/components/print/PrintQuestionBlock';

const SCORE_ITEMS = [
  { key: 'job_fit', label: '직무 적합도' },
  { key: 'logic', label: '논리성' },
  { key: 'game_sense', label: '게임 센스' },
  { key: 'attitude', label: '태도' },
  { key: 'communication', label: '소통 능력' },
] as const;

// ========================================
// STAR 요약 (질문별 STAR 평균, Q6 이후 경험형 답변 기준)
// ========================================

function StarSummary({ items }: { items: PremiumFeedbackItem[] }) {
  const summary = computeStarSummary(items);
  if (!summary) return null;

  const tiles = [
    { key: 'situation', label: 'Situation (상황)', score: summary.situation },
    { key: 'task', label: 'Task (역할)', score: summary.task },
    { key: 'action', label: 'Action (행동)', score: summary.action },
    { key: 'result', label: 'Result (결과)', score: summary.result },
  ];

  return (
    <div className="rp-card">
      <h3>STAR 구조 분석 요약 (Q6 이후 경험형 답변 {summary.count}개 기준)</h3>
      <div className="rp-tiles">
        {tiles.map((t) => (
          <div key={t.key} className="rp-tile">
            <div className={`rp-tile__score rp-tone--${getScoreTone(t.score)}`}>{t.score}</div>
            <div className="rp-tile__label">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// 최고 / 개선 필요 답변
// ========================================

function BestWorst({ best, worst }: { best?: BestWorstAnalysis; worst?: BestWorstAnalysis }) {
  if (!best && !worst) return null;
  const whyBest = best?.why_best ?? [];

  return (
    <>
      {best && (
        <div className="rp-card rp-card--good">
          <h3>
            최고 답변 — Q{best.question_number} ({best.score}점)
          </h3>
          {best.question && <p className="rp-bw__question">{best.question}</p>}
          {best.answer && <blockquote className="rp-quote">{best.answer}</blockquote>}
          {whyBest.length > 0 && (
            <ul>
              {whyBest.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {worst && (
        <div className="rp-card rp-card--warn">
          <h3>개선 필요 답변 — Q{worst.question_number}</h3>
          {worst.question && <p className="rp-bw__question">{worst.question}</p>}
          {worst.answer && <blockquote className="rp-quote">{worst.answer}</blockquote>}
          {worst.rewrite_example && (
            <div className="rp-rewrite">
              <h4>개선된 답변 예시</h4>
              <p className="rp-pre">{worst.rewrite_example}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ========================================
// 바닥글
// ========================================

function PrintFooter({ name, date }: { name: string; date: string }) {
  return (
    <footer className="rp-footer">
      이븐아이 AI 모의면접 · {name} · {date}
    </footer>
  );
}

// ========================================
// 문서 본체
// ========================================

export default function ReportPrint({
  payload,
  includeTranscript,
}: {
  payload: ReportPrintPayload;
  includeTranscript: boolean;
}) {
  const { report, messages, selectedJob, selectedCompany, student, generatedAt, totalQuestions } = payload;
  const detailed = report.detailed_feedback ?? [];
  const analyzed = detailed.length;
  const overall = report.overall_summary;
  const scores = report.scores ?? { job_fit: 0, logic: 0, game_sense: 0, attitude: 0, communication: 0 };
  const scoresDetail = report.scores_detail;
  const passPrediction = report.pass_prediction ?? '';
  const generatedLabel = formatKstDateTime(generatedAt);

  const checklist = overall?.next_step_checklist ?? [];
  const followups = overall?.expected_followup_questions ?? [];

  return (
    <article className="rp-doc" lang="ko">
      {/* 표지 + 요약 */}
      <section className="rp-section rp-cover">
        <h1>AI 모의면접 결과 리포트</h1>
        <p className="rp-subtitle">
          {selectedCompany} · {selectedJob}
        </p>

        <dl className="rp-meta">
          <div>
            <dt>수강생</dt>
            <dd>{student ? `${student.name} (${student.code})` : '-'}</dd>
          </div>
          <div>
            <dt>생성일시</dt>
            <dd>{generatedLabel}</dd>
          </div>
          <div>
            <dt>질문 수</dt>
            <dd>
              분석 {analyzed} / 전체 {totalQuestions}
            </dd>
          </div>
        </dl>

        <div className="rp-cover-top">
        <div className="rp-scorebox rp-card">
          <div className="rp-scorebox__total">
            <span className="rp-scorebox__num">{formatScore(report.total_score)}</span>
            <span className="rp-scorebox__unit">점</span>
          </div>
          <div className="rp-scorebox__body">
            {passPrediction && (
              <span className={`rp-badge rp-badge--${getPassTone(passPrediction)}`}>{passPrediction}</span>
            )}
            {report.summary_title && <p className="rp-scorebox__title">{report.summary_title}</p>}
          </div>
        </div>

          <figure className="rp-figure">
            <PrintRadar scores={scores} />
          </figure>
        </div>

        <div className="rp-cover-grid">
          <table className="rp-table">
            <thead>
              <tr>
                <th>역량</th>
                <th>점수</th>
                <th>그래프</th>
                <th>평가 근거</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_ITEMS.map(({ key, label }) => {
                const value = scores[key] ?? 0;
                const reason = scoresDetail?.[key]?.reason;
                const width = Math.max(0, Math.min(100, value));
                return (
                  <tr key={key}>
                    <td className="rp-table__label">{label}</td>
                    <td className={`rp-table__score rp-tone--${getScoreTone(value)}`}>{value}</td>
                    <td className="rp-table__bar">
                      <div className="rp-bar">
                        <div
                          className={`rp-bar__fill rp-bar__fill--${getScoreTone(value)}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </td>
                    <td className="rp-table__reason">{reason ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 종합 평가 */}
      {overall && (
        <section className="rp-section rp-break-before">
          <h2>종합 평가</h2>

          {overall.total_evaluation && (
            <>
              <h3>전체 평가</h3>
              <p>{overall.total_evaluation}</p>
            </>
          )}

          {(overall.core_strength || overall.critical_improvement) && (
            <div className="rp-two-col">
              {overall.core_strength && (
                <div className="rp-card rp-card--good">
                  <h4>핵심 강점</h4>
                  <p>{overall.core_strength}</p>
                </div>
              )}
              {overall.critical_improvement && (
                <div className="rp-card rp-card--warn">
                  <h4>시급한 개선점</h4>
                  <p>{overall.critical_improvement}</p>
                </div>
              )}
            </div>
          )}

          {overall.interview_style_analysis && (
            <>
              <h3>면접 스타일 분석</h3>
              <p>{overall.interview_style_analysis}</p>
            </>
          )}

          {checklist.length > 0 && (
            <>
              <h3>다음 면접 준비 체크리스트</h3>
              <ul className="rp-checklist">
                {checklist.map((item, i) => (
                  // LLM 출력이 "□ …"로 시작하므로 CSS ::before 박스와 겹치지 않게 앞 기호 제거
                  <li key={i}>{item.replace(/^[\s□☐■☑✔✓•\-]+/, '')}</li>
                ))}
              </ul>
            </>
          )}

          {followups.length > 0 && (
            <>
              <h3>예상 꼬리 질문</h3>
              <ol>
                {followups.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </>
          )}

          <StarSummary items={detailed} />
          <BestWorst best={report.best_answer_analysis} worst={report.worst_answer_analysis} />
        </section>
      )}

      {/* 질문별 상세 분석 */}
      {analyzed > 0 ? (
        <section className="rp-section rp-break-before">
          <h2>
            질문별 상세 분석 ({analyzed}/{totalQuestions})
          </h2>
          {detailed.map((item, idx) => (
            <PrintQuestionBlock key={item.question_number || idx} item={item} />
          ))}
        </section>
      ) : report.detailed_feedback_markdown ? (
        <section className="rp-section rp-break-before">
          <h2>질문별 상세 분석</h2>
          <div className="rp-md">
            <ReactMarkdown>{report.detailed_feedback_markdown}</ReactMarkdown>
          </div>
        </section>
      ) : null}

      {/* 부록: 대화 기록 */}
      {includeTranscript && messages.length > 0 && (
        <section className="rp-section rp-break-before">
          <h2>면접 대화 기록</h2>
          {messages.map((msg, i) => (
            <div key={i} className={`rp-msg rp-msg--${msg.role}`}>
              <span className="rp-msg__role">{msg.role === 'assistant' ? '면접관' : '지원자'}</span>
              <p className="rp-pre">{msg.content}</p>
            </div>
          ))}
        </section>
      )}

      <PrintFooter name={student?.name ?? '수강생'} date={generatedLabel} />
    </article>
  );
}
