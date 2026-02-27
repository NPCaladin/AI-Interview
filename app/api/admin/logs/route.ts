import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('id, created_at, students!student_id(code)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      logger.error('[Admin Logs] Query error:', error);
      return NextResponse.json({ error: '로그 조회 실패' }, { status: 500 });
    }

    const logs = (data || []).map((log: Record<string, unknown>) => ({
      id: log.id as string,
      code: (Array.isArray(log.students) ? (log.students as { code: string }[])[0]?.code : (log.students as { code: string } | null)?.code) ?? '알 수 없음',
      created_at: log.created_at as string,
    }));

    return NextResponse.json({ logs });
  } catch (error) {
    logger.error('[Admin Logs] Error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
