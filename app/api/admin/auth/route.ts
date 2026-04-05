import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { signAdminToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

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

    const { password } = body;

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: '비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

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

    const token = await signAdminToken();
    return NextResponse.json({ token });
  } catch (error) {
    logger.error('[Admin Auth] Error:', error);
    return NextResponse.json(
      { error: '인증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
