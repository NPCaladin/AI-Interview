import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '인증 토큰이 필요합니다.' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    let payload;
    try {
      payload = await verifyToken(token);
    } catch {
      return NextResponse.json(
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    const { data: usageData, error: rpcError } = await supabase
      .rpc('get_weekly_remaining', { p_student_id: payload.studentId });

    if (rpcError || !usageData?.success) {
      logger.error('[Auth Remaining] Usage RPC error:', rpcError || usageData);
      return NextResponse.json(
        { error: '사용량 조회에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      remaining: usageData.remaining,
      limit: usageData.limit,
      used: usageData.used,
    });
  } catch (error) {
    logger.error('[Auth Remaining] Error:', error);
    return NextResponse.json(
      { error: '사용량 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
