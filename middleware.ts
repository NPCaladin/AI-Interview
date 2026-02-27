import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Edge Runtime 자체 완결형 — lib/auth.ts 미임포트

// ── 인메모리 슬라이딩 윈도우 Rate Limiter (Edge 호환) ──
const _store = new Map<string, number[]>();
function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const timestamps = (_store.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= max) {
    const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    return { ok: false, retryAfter };
  }
  timestamps.push(now);
  _store.set(key, timestamps);
  return { ok: true };
}
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set');
  }
  return new TextEncoder().encode(secret);
}

// ── 경로 설정 ──
const PUBLIC_PATHS = ['/api/auth/verify', '/api/admin/auth'];

// Rate limit 설정
const AUTH_LIMIT = { max: 10, window: 60_000 };       // 인증: 10회/분 (IP 기반)
const API_LIMIT  = { max: 30, window: 60_000 };       // 일반 API: 30회/분 (studentId 기반)

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
    const rl = await rateLimit(`auth:${clientIp}`, AUTH_LIMIT.max, AUTH_LIMIT.window);
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

    // ── admin 라우트 분기 ──
    if (pathname.startsWith('/api/admin/')) {
      if (payload.role !== 'admin') {
        return NextResponse.json(
          { error: '관리자 권한이 필요합니다.' },
          { status: 403 }
        );
      }
      // admin rate limit (IP 기반, 60회/분)
      const rl = await rateLimit(`admin:${clientIp}`, 60, 60_000);
      if (!rl.ok) {
        return NextResponse.json(
          { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
          { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
      }
      return NextResponse.next();
    }

    // ── 학생 라우트 ──
    const studentId = payload.studentId as string;

    if (!studentId) {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    // 인증된 사용자 rate limit (studentId 기반)
    const rl = await rateLimit(`api:${studentId}`, API_LIMIT.max, API_LIMIT.window);
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
