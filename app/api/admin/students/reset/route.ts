import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// POST /api/admin/students/reset — 이번 주 사용량 리셋
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const { id } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // Asia/Seoul 기준 이번 주 월요일 날짜 계산
    const now = new Date();
    const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const dayOfWeek = kst.getDay(); // 0=일, 1=월...
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    kst.setDate(kst.getDate() - daysFromMonday);
    const weekStartStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;

    const { error } = await supabase
      .from('usage_logs')
      .delete()
      .eq('student_id', id)
      .eq('week_start', weekStartStr);

    if (error) {
      logger.error('[Admin Reset] Delete usage error:', error);
      return NextResponse.json({ error: '사용량 리셋에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Admin Reset] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
