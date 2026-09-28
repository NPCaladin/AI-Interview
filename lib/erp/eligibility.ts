/**
 * 재활성화 큐 자격 판정 (ERP 합의 2026-09-23 — 자체 approve 4조건)
 *  ① 정규 V 학번 (/^V\d{7}$/)
 *  ② ERP student.is_deleted = false
 *  ③ 활성 enrollment 보유
 *  ④ 정규화 전화번호가 같은 다른 학번 0건 (동명이인은 이름이 아니라 전화번호로 판정)
 *
 * ERP 자격 조회 API (요청만 보낸 상태 — 미구현일 수 있음):
 *   GET {ERP_BASE_URL}/api/external/interview/students/{code}/eligibility
 *   Authorization: Bearer {ERP_API_KEY}
 *   200 → { student_code, is_deleted, enrollment_active, active_enrollment_status, phone_duplicate_count, same_name_count }
 *   404 → 없는 코드
 * env 누락·404·501·5xx·네트워크·타임아웃(10s) → source 'unavailable' (나머지 null) — 수동 판단 대상.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const REGULAR_CODE_RE = /^V\d{7}$/;

export interface Eligibility {
  code_regular: boolean;
  is_deleted: boolean | null;
  enrollment_active: boolean | null;
  enrollment_status: string | null;
  phone_dup_count: number | null;
  same_name_count: number | null;
  source: 'erp_api' | 'unavailable';
  checked_at: string;
  all_pass: boolean;
  error?: string;
}

export function isRegularCode(code: string): boolean {
  return REGULAR_CODE_RE.test(code);
}

/** 4조건 전부 충족 여부 — 미확인(null)은 충족으로 보지 않는다 */
export function evaluate(e: Omit<Eligibility, 'all_pass'>): boolean {
  return (
    e.code_regular === true &&
    e.is_deleted === false &&
    e.enrollment_active === true &&
    e.phone_dup_count === 0
  );
}

function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function unavailable(code: string, checkedAt: string, error: string): Eligibility {
  return {
    code_regular: isRegularCode(code),
    is_deleted: null,
    enrollment_active: null,
    enrollment_status: null,
    phone_dup_count: null,
    same_name_count: null,
    source: 'unavailable',
    checked_at: checkedAt,
    all_pass: false,
    error,
  };
}

export async function fetchEligibility(code: string): Promise<Eligibility> {
  const checkedAt = new Date().toISOString();
  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.ERP_API_KEY;
  if (!baseUrl || !apiKey) {
    return unavailable(code, checkedAt, 'ERP_BASE_URL/ERP_API_KEY 미설정');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/external/interview/students/${encodeURIComponent(code)}/eligibility`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (res.status === 404) return unavailable(code, checkedAt, 'HTTP 404 (ERP에 없는 코드 또는 API 미구현)');
    if (res.status === 501) return unavailable(code, checkedAt, 'HTTP 501 (ERP 자격 조회 API 미구현)');
    if (!res.ok) return unavailable(code, checkedAt, `HTTP ${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return unavailable(code, checkedAt, '응답 JSON 파싱 실패');
    }
    if (typeof body !== 'object' || body === null) {
      return unavailable(code, checkedAt, '응답 형식 오류');
    }
    const b = body as Record<string, unknown>;

    const base: Omit<Eligibility, 'all_pass'> = {
      code_regular: isRegularCode(code),
      is_deleted: asBool(b.is_deleted),
      enrollment_active: asBool(b.enrollment_active),
      enrollment_status: asStr(b.active_enrollment_status),
      phone_dup_count: asNum(b.phone_duplicate_count),
      same_name_count: asNum(b.same_name_count),
      source: 'erp_api',
      checked_at: checkedAt,
    };
    return { ...base, all_pass: evaluate(base) };
  } catch (e) {
    if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
      return unavailable(code, checkedAt, `타임아웃 (${REQUEST_TIMEOUT_MS / 1000}s)`);
    }
    return unavailable(code, checkedAt, `네트워크 오류: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}
