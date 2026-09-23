import type { PremiumFeedbackItem } from '@/lib/types';
import { getScoreTone, isStarApplicable } from '@/lib/reportUtils';

const STAR_ITEMS = [
  { key: 'situation', label: 'S (상황)' },
  { key: 'task', label: 'T (역할)' },
  { key: 'action', label: 'A (행동)' },
  { key: 'result', label: 'R (결과)' },
] as const;

/** 질문 1개 블록 (블록 전체는 분할 허용 — 헤더와 각 서브카드만 원자적) */
export default function PrintQuestionBlock({ item }: { item: PremiumFeedbackItem }) {
  const strengths = item.evaluation?.strengths ?? [];
  const weaknesses = item.evaluation?.weaknesses ?? [];
  const tips = item.improvement?.specific_tips ?? [];
  const modelAnswer = item.improvement?.model_answer_example ?? '';
  const star = isStarApplicable(item) ? item.star_analysis : undefined;

  return (
    <section className="rp-q">
      <div className="rp-q__head">
        <div className="rp-q__meta">
          <span className="rp-badge rp-badge--q">Q{item.question_number}</span>
          {item.question_type && <span className="rp-q__type">{item.question_type}</span>}
          <span className={`rp-badge rp-tone--${getScoreTone(item.score)}`}>{item.score}점</span>
        </div>
        <h3>{item.question}</h3>
        {item.answer_summary && (
          <div className="rp-card rp-card--muted">
            <h4>지원자 답변 요약</h4>
            <p>{item.answer_summary}</p>
          </div>
        )}
      </div>

      {star && (
        <div className="rp-card rp-star">
          <h4>STAR 분석</h4>
          <div className="rp-star__grid">
            {STAR_ITEMS.map(({ key, label }) => {
              const d = star[key];
              return (
                <div key={key} className="rp-star__cell">
                  <div className="rp-star__label">
                    <span>{label}</span>
                    <span className={`rp-tone--${getScoreTone(d.score)}`}>{d.score}점</span>
                  </div>
                  {d.found && <p className="rp-star__found">&ldquo;{d.found}&rdquo;</p>}
                  {d.feedback && <p className="rp-star__feedback">{d.feedback}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="rp-two-col">
          {strengths.length > 0 && (
            <div className="rp-card rp-card--good">
              <h4>강점</h4>
              <ul>
                {strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div className="rp-card rp-card--warn">
              <h4>약점</h4>
              <ul>
                {weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tips.length > 0 && (
        <div className="rp-card">
          <h4>구체적 개선 방법</h4>
          <ul className="rp-tips">
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {modelAnswer && (
        <div className="rp-card rp-card--model">
          <h4>모범 답안 예시</h4>
          <p className="rp-pre">{modelAnswer}</p>
        </div>
      )}
    </section>
  );
}
