/**
 * ERP REST Pull 클라이언트
 * - 엔드포인트: GET {ERP_BASE_URL}/api/external/interview/students
 * - 인증: Bearer {ERP_API_KEY}
 * - Vercel Deployment Protection 우회 (옵션): x-vercel-protection-bypass: {ERP_VERCEL_BYPASS_TOKEN}
 *   ERP가 Vercel Preview Protection을 사용 중일 때만 필요. env가 없으면 헤더 미전송.
 * - 타임아웃: 10s (AbortController)
 * - 재시도: 지수 백오프 1→2→4s (최대 3회), 5xx/timeout만
 * - 4xx 즉시 실패 (재시도 금지)
 * - gzip: Next.js fetch 자동 처리 (Accept-Encoding 힌트만 명시)
 */

import { logger } from '@/lib/logger';

const ENDPOINT_PATH = '/api/external/interview/students';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];

export interface ErpFetchParams {
  updatedAfter?: string; // ISO8601 — cursor와 택일 (cursor 우선)
  cursor?: string | null;
  limit?: number;
}

export interface ErpFetchResponse {
  students: Array<{
    student_code: string;
    name: string;
    is_active: boolean;
    updated_at: string;
  }>;
  next_cursor: string | null;
}

export class ErpFetchError extends Error {
  constructor(
    message: string,
    public code: 'HTTP_4XX' | 'HTTP_5XX' | 'TIMEOUT' | 'NETWORK' | 'CONFIG' | 'PARSE',
    public status?: number,
    public bodySnippet?: string,
  ) {
    super(message);
    this.name = 'ErpFetchError';
  }
}

function getConfig(): { baseUrl: string; apiKey: string; bypassToken?: string } {
  const baseUrl = process.env.ERP_BASE_URL;
  const apiKey = process.env.ERP_API_KEY;
  const bypassToken = process.env.ERP_VERCEL_BYPASS_TOKEN;
  if (!baseUrl || !apiKey) {
    const missing = [
      !baseUrl && 'ERP_BASE_URL',
      !apiKey && 'ERP_API_KEY',
    ].filter(Boolean).join(', ');
    throw new ErpFetchError(
      `ERP 클라이언트 초기화 실패: ${missing} 누락`,
      'CONFIG',
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    bypassToken: bypassToken || undefined,
  };
}

function buildUrl(params: ErpFetchParams): string {
  const { baseUrl } = getConfig();
  const url = new URL(baseUrl + ENDPOINT_PATH);
  const limit = Math.min(500, Math.max(1, params.limit ?? 500));
  url.searchParams.set('limit', String(limit));
  // cursor 우선, 없으면 updated_after
  if (params.cursor) {
    url.searchParams.set('cursor', params.cursor);
  } else if (params.updatedAfter) {
    url.searchParams.set('updated_after', params.updatedAfter);
  }
  const finalUrl = url.toString();
  // [DEBUG 2026-04-22] delta 이상 진단용
  logger.warn(`[ERP Client][DEBUG] buildUrl:`, {
    input_cursor: params.cursor,
    input_updatedAfter: params.updatedAfter,
    input_limit: params.limit,
    final_url: finalUrl,
  });
  return finalUrl;
}

/**
 * ERP 학생 리스트 1페이지 조회 (재시도 포함)
 */
export async function fetchErpStudents(params: ErpFetchParams): Promise<ErpFetchResponse> {
  const { apiKey, bypassToken } = getConfig();
  const url = buildUrl(params);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
  };
  if (bypassToken) {
    headers['x-vercel-protection-bypass'] = bypassToken;
  }

  let lastError: ErpFetchError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (res.status >= 400 && res.status < 500) {
        const body = await safeReadSnippet(res);
        throw new ErpFetchError(
          `ERP API 4xx: ${res.status}`,
          'HTTP_4XX',
          res.status,
          body,
        );
      }

      if (res.status >= 500) {
        const body = await safeReadSnippet(res);
        lastError = new ErpFetchError(
          `ERP API 5xx: ${res.status}`,
          'HTTP_5XX',
          res.status,
          body,
        );
        logger.warn(`[ERP Client] 5xx response (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${res.status}`);
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw lastError;
      }

      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch (e) {
        throw new ErpFetchError(
          `ERP 응답 JSON 파싱 실패: ${(e as Error).message}`,
          'PARSE',
          res.status,
        );
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new ErpFetchError('ERP 응답 형식 오류: object 아님', 'PARSE', res.status);
      }

      const rec = parsed as Record<string, unknown>;
      const students = Array.isArray(rec.students) ? rec.students : null;
      if (!students) {
        throw new ErpFetchError('ERP 응답 형식 오류: students 배열 누락', 'PARSE', res.status);
      }
      const nextCursor = typeof rec.next_cursor === 'string' ? rec.next_cursor : null;

      // [DEBUG 2026-04-22] 응답 카운트 로깅
      logger.warn(`[ERP Client][DEBUG] response:`, {
        records_count: students.length,
        has_next_cursor: !!nextCursor,
        http_status: res.status,
      });

      return {
        students: students as ErpFetchResponse['students'],
        next_cursor: nextCursor,
      };
    } catch (e) {
      clearTimeout(timeoutId);
      // AbortController timeout
      if ((e as Error).name === 'AbortError') {
        lastError = new ErpFetchError(
          `ERP 요청 타임아웃 (${REQUEST_TIMEOUT_MS}ms)`,
          'TIMEOUT',
        );
        logger.warn(`[ERP Client] Timeout (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw lastError;
      }
      if (e instanceof ErpFetchError) {
        // 4xx는 즉시 실패
        if (e.code === 'HTTP_4XX' || e.code === 'PARSE' || e.code === 'CONFIG') {
          throw e;
        }
        lastError = e;
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw e;
      }
      // 네트워크 예외
      lastError = new ErpFetchError(
        `ERP 네트워크 오류: ${(e as Error).message}`,
        'NETWORK',
      );
      logger.warn(`[ERP Client] Network error (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${(e as Error).message}`);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw lastError;
    }
  }

  // unreachable
  throw lastError ?? new ErpFetchError('ERP fetch failed (unknown)', 'NETWORK');
}

async function safeReadSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
