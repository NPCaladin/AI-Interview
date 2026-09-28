import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET /api/admin/jobs — 직군 목록 (필터 select 용)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('interview_jobs')
      .select('job_name')
      .order('job_name', { ascending: true });

    if (error) {
      logger.error('[Admin Jobs GET] Query error:', error);
      return NextResponse.json({ error: '직군 목록 조회 실패' }, { status: 500 });
    }

    const items = ((data || []) as Array<{ job_name: string | null }>)
      .map((r) => r.job_name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);

    return NextResponse.json({ items });
  } catch (error) {
    logger.error('[Admin Jobs GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
