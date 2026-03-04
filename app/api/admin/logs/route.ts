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
      logger.error('[Admin Logs] Query error:', logsError.message, logsError.code, logsError.details);
      return NextResponse.json({ error: `로그 조회 실패: ${logsError.message}` }, { status: 500 });
    }

    logger.warn('[Admin Logs] 조회결과:', logsData?.length ?? 0, '건 / 최신:', logsData?.[0]?.created_at);
    // 3/3 이후 데이터 직접 조회 (RLS·필터 이슈 확인)
    const { data: recentRows, error: recentErr } = await supabase
      .from('usage_logs')
      .select('id, created_at, student_id')
      .gte('created_at', '2026-03-03T00:00:00+09:00');
    logger.warn('[Admin Logs] 3/3이후 직접조회:', recentRows?.length ?? 0, '건 / 에러:', recentErr?.message ?? 'none');

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
