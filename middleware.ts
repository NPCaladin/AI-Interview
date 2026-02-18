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

// 공개 경로 (JWT 검증 불필요)
const PUBLIC_PATHS = ['/api/auth/verify'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

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
