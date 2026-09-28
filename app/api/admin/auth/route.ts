import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  isValidActor,
  signAdminToken,
  verifyAdminToken,
} from '@/lib/adminAuth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function getRequestIp(request: NextRequest): string | null {
  // Vercel 이 주입하는 신뢰할 수 있는 IP 우선, 개발 환경은 x-real-ip 폴백
  if ('ip' in request && typeof (request as { ip?: unknown }).ip === 'string') {
    return (request as { ip?: string }).ip ?? null;
  }
  return request.headers.get('x-real-ip') ?? null;
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      );
    }

    const { password, actor: rawActor } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: '비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (!isValidActor(rawActor)) {
      return NextResponse.json(
        { error: '작업자 이름은 1~30자(한글·영문·숫자·공백·._-)로 입력해주세요.' },
        { status: 400 }
      );
    }
    const actor = rawActor.trim();

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      logger.error('[Admin Auth] ADMIN_PASSWORD not set');
      return NextResponse.json(
        { error: '서버 설정 오류입니다.' },
        { status: 500 }
      );
    }

    // 타이밍 사이드채널 방어: 길이 비교 + 상수 시간 비교
    const pwBuf = Buffer.from(password);
    const adminBuf = Buffer.from(adminPassword);
    if (pwBuf.length !== adminBuf.length || !timingSafeEqual(pwBuf, adminBuf)) {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    const token = await signAdminToken(actor);
    const res = NextResponse.json({ ok: true, actor });
    res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());

    // 감사 로그 (실패해도 로그인은 진행)
    try {
      const { error: auditError } = await supabase.from('admin_audit_log').insert({
        actor,
        action: 'ADMIN_LOGIN',
        ip_address: getRequestIp(request),
        details: { user_agent: request.headers.get('user-agent') },
      });
      if (auditError) {
        logger.warn('[Admin Auth] audit log insert failed:', auditError.message);
      }
    } catch (auditErr) {
      logger.warn('[Admin Auth] audit log insert error:', auditErr);
    }

    return res;
  } catch (error) {
    logger.error('[Admin Auth] Error:', error);
    return NextResponse.json(
      { error: '인증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  const claims = token ? await verifyAdminToken(token) : null;
  if (!claims) {
    return NextResponse.json(
      { error: '관리자 인증이 필요합니다.' },
      { status: 401 }
    );
  }
  return NextResponse.json({ actor: claims.actor });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 });
  return res;
}
