/**
 * 프로덕션 로거
 * - development: 모든 레벨 출력
 * - production: error/warn만 출력, 민감 정보 미포함
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  /** 디버그용 — 프로덕션에서는 출력하지 않음 */
  debug(...args: unknown[]) {
    if (isDev) console.log(...args);
  },

  /** 정보성 로그 — 프로덕션에서는 출력하지 않음 */
  info(...args: unknown[]) {
    if (isDev) console.log(...args);
  },

  /** 경고 — 항상 출력 */
  warn(...args: unknown[]) {
    console.warn(...args);
  },

  /** 에러 — 항상 출력 */
  error(...args: unknown[]) {
    console.error(...args);
  },
};
