/**
 * 어드민 인증 유틸 (jose 만 사용 → Edge middleware / Node 라우트 공용)
 *
 * - 토큰: HS256 JWT, claims { role:'admin', actor }, sub 'admin', iss 'eveni-interview', 12h
 * - 전달: httpOnly 쿠키 ADMIN_COOKIE (middleware 가 검증 후 x-admin-actor 헤더 주입)
 * - 폴백: Authorization: Bearer <token> (수동 스크립트 호환, middleware 에서 처리)
 * - 한글 actor 는 헤더 ByteString 제약 때문에 encodeURIComponent 로 주입/디코드한다.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export const ADMIN_COOKIE = 'eveni_admin';
export const ADMIN_TOKEN_TTL = '12h';
export const ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const ADMIN_ACTOR_HEADER = 'x-admin-actor';
export const ADMIN_ISSUER = 'eveni-interview';

export interface AdminClaims {
  role: 'admin';
  actor: string;
}

const ACTOR_RE = /^[가-힣A-Za-z0-9 _.-]{1,30}$/;

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET must be set');
  }
  return new TextEncoder().encode(secret);
}

export function isValidActor(v: unknown): v is string {
  return typeof v === 'string' && ACTOR_RE.test(v.trim()) && v.trim().length > 0;
}

export async function signAdminToken(actor: string): Promise<string> {
  return new SignJWT({ role: 'admin' as const, actor })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin')
    .setIssuer(ADMIN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(ADMIN_TOKEN_TTL)
    .sign(getSecretKey());
}

/** 유효하면 claims, 아니면 null (예외를 던지지 않음) */
export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { issuer: ADMIN_ISSUER });
    if (payload.role !== 'admin') return null;
    const actor = typeof payload.actor === 'string' && payload.actor.length > 0 ? payload.actor : 'admin';
    return { role: 'admin', actor };
  } catch {
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ADMIN_TOKEN_TTL_SECONDS,
  };
}

/** middleware 가 주입한 x-admin-actor(encodeURIComponent 값) → 작업자 이름. 없으면 'admin' */
export function getAdminActor(request: NextRequest): string {
  const raw = request.headers.get(ADMIN_ACTOR_HEADER);
  if (!raw) return 'admin';
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : 'admin';
  } catch {
    return 'admin';
  }
}
