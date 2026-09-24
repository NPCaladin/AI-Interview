/**
 * 면접 리포트 공용 순수 헬퍼 (화면 ReportView · 인쇄 ReportPrint 공용)
 * React 의존성 없음.
 */
import type { PremiumFeedbackItem } from '@/lib/types';

/** 점수를 정수로 반올림 (null/undefined → 0) */
export function formatScore(n: number | undefined | null): number {
  return Math.round(n ?? 0);
}

/**
 * STAR 분석이 의미 있는 질문인지 판정.
 * Q6 이후 + star_analysis 존재 + 4항목 중 하나라도 "해당 없음"이 아닌 경우.
 */
export function isStarApplicable(item: PremiumFeedbackItem): boolean {
  if (item.question_number <= 5 || item.star_analysis === undefined) return false;
  const { situation, task, action, result } = item.star_analysis;
  return [situation, task, action, result].some((d) => {
    const found = d?.found ?? '';
    const feedback = d?.feedback ?? '';
    return !(found.includes('해당 없음') || feedback.includes('해당 없음'));
  });
}

export interface StarSummary {
  situation: number;
  task: number;
  action: number;
  result: number;
  count: number;
}

/** 질문별 STAR 점수 평균 (적용 대상 0개면 null) */
export function computeStarSummary(items: PremiumFeedbackItem[]): StarSummary | null {
  const targets = items.filter(isStarApplicable);
  if (targets.length === 0) return null;

  const sum = { situation: 0, task: 0, action: 0, result: 0 };
  targets.forEach((item) => {
    const star = item.star_analysis;
    if (!star) return;
    sum.situation += star.situation?.score ?? 0;
    sum.task += star.task?.score ?? 0;
    sum.action += star.action?.score ?? 0;
    sum.result += star.result?.score ?? 0;
  });

  const count = targets.length;
  return {
    situation: Math.round(sum.situation / count),
    task: Math.round(sum.task / count),
    action: Math.round(sum.action / count),
    result: Math.round(sum.result / count),
    count,
  };
}

/**
 * LLM 점수를 0~100 정수로 정규화.
 * 프롬프트가 0~100을 지시해도 간혹 10점 만점(2~9)으로 오므로, 1~10 정수는 ×10 으로 보정한다.
 * (2026-09-24 프로덕션 실측: 질문별 score 8/9/8/4/2 → 배지·톤 판정 전부 '부족'으로 표시되던 문제)
 */
export function normalizeScore100(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  const scaled = v > 0 && v <= 10 && Number.isInteger(v) ? v * 10 : v;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/** 질문별 피드백 항목의 score / STAR 4항목 score 를 0~100 으로 정규화 (불변 반환) */
export function normalizeFeedbackItemScores(item: PremiumFeedbackItem): PremiumFeedbackItem {
  const star = item.star_analysis;
  return {
    ...item,
    score: normalizeScore100(item.score),
    star_analysis: star
      ? {
          situation: { ...star.situation, score: normalizeScore100(star.situation?.score) },
          task: { ...star.task, score: normalizeScore100(star.task?.score) },
          action: { ...star.action, score: normalizeScore100(star.action?.score) },
          result: { ...star.result, score: normalizeScore100(star.result?.score) },
        }
      : star,
  };
}

export type ScoreTone = 'high' | 'mid' | 'low' | 'poor';

/** 점수 톤 (ReportView 기준과 동일) */
export function getScoreTone(score: number): ScoreTone {
  if (score >= 80) return 'high';
  if (score >= 60) return 'mid';
  if (score >= 40) return 'low';
  return 'poor';
}

export type PassTone = 'pass' | 'hold' | 'fail';

/** 합격 예측 톤 (ReportView 합격 예측 색상 로직 미러) */
export function getPassTone(p: string): PassTone {
  if (p.includes('불합격')) return 'fail'; // '불합격'에 '합격'이 포함되므로 먼저 검사
  if (p.includes('보류')) return 'hold';
  if (p.includes('합격')) return 'pass';
  return 'fail';
}

/** ISO 문자열 → KST 한국어 일시 (예: 2026년 9월 24일 오후 3:05) */
export function formatKstDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

/** 파일명에 쓸 수 없는 문자 치환 */
export function sanitizeFilePart(s: string): string {
  return s.replace(/[\/:*?"<>|()]/g, '_');
}
