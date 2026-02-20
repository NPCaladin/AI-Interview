import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Edge Runtime 자체 완결형 — lib/auth.ts 미임포트
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set');
  }
  return new TextEncoder().encode(secret);
}

// ── Rate Limiter (인메모리 슬라이딩 윈도우) ──
interface RLEntry { timestamps: number[] }
const rlStore = new Map<string, RLEntry>();
let lastCleanup = Date.now();

function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  // 5분마다 만료 엔트리 정리
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    const cutoff = now - windowMs;
    rlStore.forEach((e, k) => {
      e.timestamps = e.timestamps.filter(t => t > cutoff);
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

// ── 경로 설정 ──
const PUBLIC_PATHS = ['/api/auth/verify'];

// Rate limit 설정: [max요청, 윈도우(ms)]
const AUTH_LIMIT = { max: 10, window: 60_000 };       // 인증: 10회/분
const API_LIMIT  = { max: 30, window: 60_000 };       // 일반 API: 30회/분

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // 공개 경로 (JWT 불필요, rate limit만 적용)
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    const rl = rateLimit(`auth:${clientIp}`, AUTH_LIMIT.max, AUTH_LIMIT.window);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
      );
    }
    return NextResponse.next();
  }

  // JWT 인증
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const studentId = payload.studentId as string;

    if (!studentId) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    // 인증된 사용자 rate limit (studentId 기반)
    const rl = rateLimit(`api:${studentId}`, API_LIMIT.max, API_LIMIT.window);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
      );
    }

    // 요청 헤더에 학생 ID 주입
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-student-id', studentId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    return NextResponse.json(
      { error: '인증 토큰이 만료되었거나 유효하지 않습니다.' },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
