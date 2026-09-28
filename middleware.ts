import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { ADMIN_COOKIE, adminCookieOptions, verifyAdminToken } from '@/lib/adminAuth';

// Edge Runtime — lib/auth.ts 미임포트 (lib/adminAuth.ts 는 jose 만 사용하므로 Edge 호환)

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
// /api/cron/* : Vercel Cron (Bearer CRON_SECRET) — middleware JWT 건너뜀
const PUBLIC_PATHS = ['/api/auth/verify', '/api/admin/auth', '/api/cron/'];
const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

// Rate limit 설정
const AUTH_LIMIT = { max: 10, window: 60_000 };       // 인증: 10회/분 (IP 기반)
const API_LIMIT  = { max: 30, window: 60_000 };       // 일반 API: 30회/분 (studentId 기반)
const VERIFY_LIMIT = { max: 5, window: 15 * 60_000 }; // 인증 시도: 5회/15분 (브루트포스 방지)

function getClientIp(request: NextRequest): string {
  // Vercel이 주입하는 신뢰할 수 있는 IP (프록시 스푸핑 불가)
  if ('ip' in request && typeof (request as any).ip === 'string') {
    return (request as any).ip;
  }
  // 개발 환경 폴백
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // CSRF 방어: 변경 요청의 Origin 헤더 검증
  const method = request.method;
  const origin = request.headers.get('origin');
  if (MUTATING_METHODS.includes(method)) {
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL,
      'http://localhost:3001',
      'https://interview.evenigame.com',
    ].filter(Boolean);
    if (origin && !allowedOrigins.some(allowed => origin === allowed)) {
      return NextResponse.json(
        { error: '허용되지 않은 출처의 요청입니다.' },
        { status: 403 }
      );
    }
  }

  // ── 어드민 페이지 보호 (/admin/*) ──
  // httpOnly 쿠키 JWT 검증. 미인증 → /admin/login?next=... 리다이렉트
  if (pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }
    const cookieToken = request.cookies.get(ADMIN_COOKIE)?.value;
    const claims = cookieToken ? await verifyAdminToken(cookieToken) : null;
    if (!claims) {
      const loginUrl = new URL('/admin/login', request.url);
      if (pathname.startsWith('/admin')) {
        loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
      }
      const response = NextResponse.redirect(loginUrl);
      if (cookieToken) {
        // 만료·위조 쿠키 정리
        response.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 });
      }
      return response;
    }
    return NextResponse.next();
  }

  // 공개 경로 (JWT 불필요, rate limit만 적용)
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    // GET /api/admin/auth: 페이지 로드마다 호출되는 세션 확인 → AUTH_LIMIT 제외 (POST/DELETE만 제한)
    const isAdminAuth = pathname.startsWith('/api/admin/auth');
    if (isAdminAuth && method === 'GET') {
      return NextResponse.next();
    }
    // 어드민 로그인/로그아웃(쿠키 기반 변경 요청)은 Origin 헤더 필수 — CSRF 로 강제 로그아웃·비번 시도 차단
    if (isAdminAuth && MUTATING_METHODS.includes(method) && !origin) {
      return NextResponse.json(
        { error: '허용되지 않은 출처의 요청입니다.' },
        { status: 403 }
      );
    }
    // 브루트포스 방지: 학생 코드 검증과 어드민 로그인(POST)은 동일하게 5회/15분
    const isVerify = pathname.startsWith('/api/auth/verify') || (isAdminAuth && method === 'POST');
    const limit = isVerify ? VERIFY_LIMIT : AUTH_LIMIT;
    const rlKey = isAdminAuth && method === 'POST' ? 'admin-login' : isVerify ? 'verify' : 'auth';
    const rl = await rateLimit(`${rlKey}:${clientIp}`, limit.max, limit.window);
    if (!rl.ok) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
      );
    }
    return NextResponse.next();
  }

  // ── admin API 라우트 (/api/admin/*, /api/admin/auth 제외) ──
  // 토큰: 쿠키 우선, 없으면 Authorization: Bearer (수동 스크립트 폴백)
  if (pathname.startsWith('/api/admin/')) {
    const cookieToken = request.cookies.get(ADMIN_COOKIE)?.value;
    const adminAuthHeader = request.headers.get('authorization');
    const bearerToken = adminAuthHeader?.startsWith('Bearer ') ? adminAuthHeader.slice(7) : undefined;
    // 쿠키가 만료됐어도 유효한 Bearer 가 있으면 통과 (스크립트 호환)
    let claims = cookieToken ? await verifyAdminToken(cookieToken) : null;
    if (!claims && bearerToken) {
      claims = await verifyAdminToken(bearerToken);
    }
    if (!claims) {
      return NextResponse.json(
        { error: '관리자 인증이 필요합니다.' },
        { status: 401 }
      );
    }
    // 쿠키 인증 + 변경 요청은 Origin 헤더 필수 (쿠키 자동 전송 기반 CSRF 차단)
    // Origin 이 있으면 위 CSRF 블록에서 허용 목록 비교를 이미 통과한 상태
    if (cookieToken && MUTATING_METHODS.includes(method) && !origin) {
      return NextResponse.json(
        { error: '허용되지 않은 출처의 요청입니다.' },
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
    // 작업자 이름 주입 (한글은 헤더 ByteString 제약 → encodeURIComponent)
    const adminHeaders = new Headers(request.headers);
    adminHeaders.set('x-admin-actor', encodeURIComponent(claims.actor));
    return NextResponse.next({
      request: {
        headers: adminHeaders,
      },
    });
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
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'eveni-interview',
    });

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

    // 요청 헤더에 학생 ID·코드 주입 (이름은 한글이라 헤더 주입 안 함)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-student-id', studentId);
    requestHeaders.delete('x-student-code'); // 클라이언트 위조 값 제거 후 토큰 값만 주입
    if (typeof payload.studentCode === 'string' && payload.studentCode.length > 0) {
      requestHeaders.set('x-student-code', payload.studentCode);
    }

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
  matcher: ['/api/:path*', '/admin/:path*'],
};
