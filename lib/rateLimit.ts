/**
 * Rate Limiting — Upstash Redis (분산) + 인메모리 폴백 이중 구조
 *
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경변수가 있으면 Redis 사용
 * - 없거나 장애 시 자동으로 인메모리 슬라이딩 윈도우로 폴백 (서비스 중단 없음)
 * - Edge Runtime 호환 (@upstash/redis, @upstash/ratelimit 모두 Edge 지원)
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number; // 재시도까지 남은 초
}

// ── 인메모리 폴백 ──────────────────────────────────────────────────────────
interface RLEntry { timestamps: number[] }
const rlStore = new Map<string, RLEntry>();
let lastCleanup = Date.now();

function memoryRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    rlStore.forEach((e, k) => {
      e.timestamps = e.timestamps.filter(t => t > now - windowMs);
      if (e.timestamps.length === 0) rlStore.delete(k);
    });
  }
  const entry = rlStore.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(t => t > now - windowMs);
  if (entry.timestamps.length >= max) {
    return { ok: false, retryAfter: Math.ceil((entry.timestamps[0] + windowMs - now) / 1000) };
  }
  entry.timestamps.push(now);
  rlStore.set(key, entry);
  return { ok: true };
}

// ── Upstash Redis 클라이언트 (lazy init) ───────────────────────────────────
function buildRedisLimiter(max: number, windowSec: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const redis = new Redis({ url, token });
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      analytics: false,
    });
  } catch {
    return null;
  }
}

// 엔드포인트별 Ratelimit 인스턴스 캐시 (모듈 레벨, Edge 인스턴스당 1회 생성)
const limiterCache = new Map<string, Ratelimit | null>();

function getLimiter(cacheKey: string, max: number, windowSec: number): Ratelimit | null {
  if (!limiterCache.has(cacheKey)) {
    limiterCache.set(cacheKey, buildRedisLimiter(max, windowSec));
  }
  return limiterCache.get(cacheKey)!;
}

// ── 공개 API ────────────────────────────────────────────────────────────────
/**
 * @param key       rate limit 키 (예: `auth:ip`, `api:studentId`)
 * @param max       최대 요청 수
 * @param windowMs  윈도우 크기 (ms)
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  const windowSec = Math.round(windowMs / 1000);
  const cacheKey = `${max}:${windowSec}`;
  const limiter = getLimiter(cacheKey, max, windowSec);

  if (limiter) {
    try {
      const { success, reset } = await limiter.limit(key);
      if (success) return { ok: true };
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    } catch {
      // Redis 장애 → 인메모리 폴백
    }
  }

  return memoryRateLimit(key, max, windowMs);
}
