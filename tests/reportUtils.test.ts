import { describe, it, expect } from 'vitest';
import {
  formatScore,
  normalizeScore100,
  getScoreTone,
  getPassTone,
  sanitizeFilePart,
  formatKstDateTime,
  computeStarSummary,
  isStarApplicable,
} from '@/lib/reportUtils';
import type { PremiumFeedbackItem } from '@/lib/types';

describe('formatScore', () => {
  it('반올림 + null/undefined → 0', () => {
    expect(formatScore(72.5)).toBe(73);
    expect(formatScore(72.4)).toBe(72);
    expect(formatScore(null)).toBe(0);
    expect(formatScore(undefined)).toBe(0);
  });
});

describe('normalizeScore100', () => {
  it('1~10 정수는 ×10 보정', () => {
    expect(normalizeScore100(8)).toBe(80);
    expect(normalizeScore100(10)).toBe(100);
    expect(normalizeScore100(2)).toBe(20);
  });
  it('0~100 범위 값은 그대로(반올림), 범위 밖은 클램프', () => {
    expect(normalizeScore100(0)).toBe(0);
    expect(normalizeScore100(85)).toBe(85);
    expect(normalizeScore100(7.5)).toBe(8); // 정수가 아니면 보정하지 않음
    expect(normalizeScore100(150)).toBe(100);
    expect(normalizeScore100(-3)).toBe(0);
  });
  it('숫자 문자열 허용, 비숫자 → 0', () => {
    expect(normalizeScore100('70')).toBe(70);
    expect(normalizeScore100('abc')).toBe(0);
    expect(normalizeScore100(undefined)).toBe(0);
    expect(normalizeScore100(NaN)).toBe(0);
  });
});

describe('getScoreTone', () => {
  it('경계값', () => {
    expect(getScoreTone(80)).toBe('high');
    expect(getScoreTone(79)).toBe('mid');
    expect(getScoreTone(60)).toBe('mid');
    expect(getScoreTone(59)).toBe('low');
    expect(getScoreTone(40)).toBe('low');
    expect(getScoreTone(39)).toBe('poor');
  });
});

describe('getPassTone', () => {
  it('불합격을 합격보다 먼저 판정', () => {
    expect(getPassTone('불합격')).toBe('fail');
    expect(getPassTone('합격 가능성 높음')).toBe('pass');
    expect(getPassTone('보류')).toBe('hold');
    expect(getPassTone('알 수 없음')).toBe('fail');
  });
});

describe('sanitizeFilePart', () => {
  it('파일명 금지 문자 치환', () => {
    expect(sanitizeFilePart('a/b:c*d?"e<f>g|h(i)')).toBe('a_b_c_d__e_f_g_h_i_');
    expect(sanitizeFilePart('게임기획')).toBe('게임기획');
  });
});

describe('formatKstDateTime', () => {
  it('UTC → KST 변환, 잘못된 값은 빈 문자열', () => {
    const s = formatKstDateTime('2026-09-24T06:05:00Z');
    expect(s).toContain('2026');
    expect(s).toContain('9월');
    expect(s).toContain('24');
    expect(s).toContain('3:05');
    expect(formatKstDateTime('not-a-date')).toBe('');
  });
});

function item(n: number, scores: [number, number, number, number] | null, na = false): PremiumFeedbackItem {
  const dim = (score: number) => ({ found: na ? '해당 없음' : '있음', feedback: '', score });
  return {
    question_number: n,
    ...(scores
      ? {
          star_analysis: {
            situation: dim(scores[0]),
            task: dim(scores[1]),
            action: dim(scores[2]),
            result: dim(scores[3]),
          },
        }
      : {}),
  } as unknown as PremiumFeedbackItem;
}

describe('isStarApplicable / computeStarSummary', () => {
  it('Q5 이하·star 없음·전부 해당 없음은 제외', () => {
    expect(isStarApplicable(item(5, [80, 80, 80, 80]))).toBe(false);
    expect(isStarApplicable(item(6, null))).toBe(false);
    expect(isStarApplicable(item(7, [80, 80, 80, 80], true))).toBe(false);
    expect(isStarApplicable(item(6, [80, 80, 80, 80]))).toBe(true);
  });
  it('적용 대상 평균, 대상 없으면 null', () => {
    expect(computeStarSummary([item(3, [10, 10, 10, 10])])).toBeNull();
    const s = computeStarSummary([item(6, [80, 60, 70, 90]), item(7, [60, 80, 71, 50]), item(2, [0, 0, 0, 0])]);
    expect(s).toEqual({ situation: 70, task: 70, action: 71, result: 70, count: 2 });
  });
});
