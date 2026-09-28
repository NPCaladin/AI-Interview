import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isRegularCode, evaluate, fetchEligibility, type Eligibility } from '@/lib/erp/eligibility';

function base(overrides: Partial<Omit<Eligibility, 'all_pass'>> = {}): Omit<Eligibility, 'all_pass'> {
  return {
    code_regular: true,
    is_deleted: false,
    enrollment_active: true,
    enrollment_status: '수강중',
    phone_dup_count: 0,
    same_name_count: 1,
    source: 'erp_api',
    checked_at: '2026-09-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('isRegularCode', () => {
  it('정규 V 학번만 true', () => {
    expect(isRegularCode('V2180038')).toBe(true);
    expect(isRegularCode('V218003')).toBe(false);
    expect(isRegularCode('V21800381')).toBe(false);
    expect(isRegularCode('WC123456')).toBe(false);
    expect(isRegularCode('v2180038')).toBe(false);
    expect(isRegularCode('E2180038')).toBe(false);
    expect(isRegularCode('')).toBe(false);
  });
});

describe('evaluate', () => {
  it('4조건 전부 충족 시에만 true', () => {
    expect(evaluate(base())).toBe(true);
  });
  it('각 조건 하나라도 불충족·미확인이면 false', () => {
    expect(evaluate(base({ code_regular: false }))).toBe(false);
    expect(evaluate(base({ is_deleted: true }))).toBe(false);
    expect(evaluate(base({ is_deleted: null }))).toBe(false);
    expect(evaluate(base({ enrollment_active: false }))).toBe(false);
    expect(evaluate(base({ enrollment_active: null }))).toBe(false);
    expect(evaluate(base({ phone_dup_count: 1 }))).toBe(false);
    expect(evaluate(base({ phone_dup_count: null }))).toBe(false);
  });
  it('동명이인 수는 판정에 쓰지 않는다', () => {
    expect(evaluate(base({ same_name_count: 5 }))).toBe(true);
    expect(evaluate(base({ same_name_count: null }))).toBe(true);
  });
});

describe('fetchEligibility', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.ERP_BASE_URL = 'https://erp.example.test/';
    process.env.ERP_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  it('200 응답 필드 매핑 + all_pass', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          student_code: 'V2180038',
          is_deleted: false,
          enrollment_active: true,
          active_enrollment_status: '수강중',
          phone_duplicate_count: 0,
          same_name_count: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const e = await fetchEligibility('V2180038');
    expect(e).toMatchObject({
      code_regular: true,
      is_deleted: false,
      enrollment_active: true,
      enrollment_status: '수강중',
      phone_dup_count: 0,
      same_name_count: 2,
      source: 'erp_api',
      all_pass: true,
    });
    expect(e.error).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://erp.example.test/api/external/interview/students/V2180038/eligibility');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('200 이지만 누락 필드는 null, all_pass=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ student_code: 'V2180038', is_deleted: false }), { status: 200 })),
    );
    const e = await fetchEligibility('V2180038');
    expect(e.source).toBe('erp_api');
    expect(e.is_deleted).toBe(false);
    expect(e.enrollment_active).toBeNull();
    expect(e.enrollment_status).toBeNull();
    expect(e.phone_dup_count).toBeNull();
    expect(e.same_name_count).toBeNull();
    expect(e.all_pass).toBe(false);
  });

  it('404 → unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const e = await fetchEligibility('V2180038');
    expect(e.source).toBe('unavailable');
    expect(e.all_pass).toBe(false);
    expect(e.is_deleted).toBeNull();
    expect(e.enrollment_active).toBeNull();
    expect(e.phone_dup_count).toBeNull();
    expect(e.code_regular).toBe(true);
    expect(e.error).toMatch(/404/);
  });

  it('501 / 5xx → unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 501 })));
    expect((await fetchEligibility('V2180038')).source).toBe('unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const e = await fetchEligibility('V2180038');
    expect(e.source).toBe('unavailable');
    expect(e.error).toMatch(/503/);
  });

  it('네트워크 오류 → unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const e = await fetchEligibility('V2180038');
    expect(e.source).toBe('unavailable');
    expect(e.error).toMatch(/네트워크/);
  });

  it('env 없음 → fetch 호출 없이 unavailable', async () => {
    delete process.env.ERP_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const e = await fetchEligibility('WC000001');
    expect(e.source).toBe('unavailable');
    expect(e.code_regular).toBe(false);
    expect(e.all_pass).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('10초 타임아웃 → AbortController 로 중단, unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );
    const pending = fetchEligibility('V2180038');
    await vi.advanceTimersByTimeAsync(10_000);
    const e = await pending;
    expect(e.source).toBe('unavailable');
    expect(e.error).toMatch(/타임아웃/);
  });
});
