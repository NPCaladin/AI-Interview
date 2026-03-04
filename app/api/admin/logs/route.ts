import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // JOIN 대신 2-step 쿼리 (Supabase JOIN이 일부 행을 누락시키는 버그 회피)
    const { data: logsData, error: logsError } = await supabase
      .from('usage_logs')
      .select('id, created_at, student_id')
      .order('created_at', { ascending: false })
      .limit(50);

    if (logsError) {
      logger.error('[Admin Logs] Query error:', logsError);
      return NextResponse.json({ error: '로그 조회 실패' }, { status: 500 });
    }

    if (!logsData || logsData.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    // 고유 student_id로 code 조회
    const studentIds = Array.from(new Set(logsData.map((l) => l.student_id)));
    const { data: studentsData } = await supabase
      .from('students')
      .select('id, code')
      .in('id', studentIds);

    const codeMap: Record<string, string> = {};
    for (const s of studentsData || []) {
      codeMap[s.id] = s.code;
    }

    const logs = logsData.map((log) => ({
      id: log.id as string,
      code: codeMap[log.student_id as string] ?? '알 수 없음',
      created_at: log.created_at as string,
    }));

    return NextResponse.json({ logs }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error('[Admin Logs] Error:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
