import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // order+limit 단독 사용 시 PostgreSQL 플래너가 특정 행을 누락하는 버그 회피
    // → analytics와 동일하게 날짜 범위 필터 추가 (최근 60일)
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const { data: logsData, error: logsError } = await supabase
      .from('usage_logs')
      .select('id, created_at, student_id')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (logsError) {
      logger.error('[Admin Logs] Query error:', logsError.message, logsError.code, logsError.details);
      return NextResponse.json({ error: `로그 조회 실패: ${logsError.message}` }, { status: 500 });
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
