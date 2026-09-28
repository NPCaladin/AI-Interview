import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';

export const dynamic = 'force-dynamic';

// POST /api/admin/students/[id]/reset-usage — 이번 주(KST) 사용량 초기화
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    if (!isUuid(id)) {
      return NextResponse.json({ error: '학생 ID(UUID)가 필요합니다.' }, { status: 400 });
    }

    const { data: weekData, error: weekErr } = await supabase.rpc('current_week_start');
    const weekStart = typeof weekData === 'string' ? weekData.slice(0, 10) : '';
    if (weekErr || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      logger.error('[Admin Reset Usage] current_week_start error:', weekErr ?? weekData);
      return NextResponse.json({ error: '이번 주 시작일 조회에 실패했습니다.' }, { status: 500 });
    }

    const { error, count } = await supabase
      .from('usage_logs')
      .delete({ count: 'exact' })
      .eq('student_id', id)
      .eq('week_start', weekStart);

    if (error) {
      logger.error('[Admin Reset Usage] Delete error:', error);
      return NextResponse.json({ error: '사용량 초기화에 실패했습니다.' }, { status: 500 });
    }

    const deletedCount = count ?? 0;

    await logAdminAction({
      actor: getAdminActor(request),
      action: 'STUDENT_RESET_USAGE',
      resource_type: 'student',
      resource_id: id,
      details: { deleted_count: deletedCount, week_start: weekStart },
      request,
    });

    return NextResponse.json({ ok: true, deleted_count: deletedCount });
  } catch (error) {
    logger.error('[Admin Reset Usage] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
