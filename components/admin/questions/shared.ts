import { COMPANY_LIST } from '@/lib/constants';

export interface JobDetail {
  job_name: string;
  keywords: string[];
  is_active: boolean;
  question_count: number;
  active_question_count: number;
}

export const NO_TAG = '__none__';
export const DEFAULT_TAG = '공통';

/** 회사 태그 선택지 — '공통' + COMPANY_LIST 의 실제 회사들 ('공통(회사선택X)' 는 면접 화면 전용 옵션이라 제외) */
export const COMPANY_TAG_OPTIONS: string[] = [
  DEFAULT_TAG,
  ...COMPANY_LIST.filter((c) => c !== '공통(회사선택X)'),
];

export const inputClass =
  'px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-[#00F2FF]/50';

export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-[#00F2FF] text-dark-900 hover:bg-[#00F2FF]/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const smallBtn =
  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** 응답 본문의 error 메시지 추출 (없으면 fallback) */
export async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${fallback} (${res.status})`;
}

/** adminFetch 가 401 에서 던지는 에러·Abort 는 조용히 무시 */
export function isSilentError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'AdminFetchError');
}
