import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface JobDetailRow {
  job_name: string;
  keywords: string[] | null;
  is_active: boolean;
}

/** ?detail=1 — 직군별 키워드·활성 여부·문항 수(전체/활성) */
async function getJobDetails() {
  const { data, error } = await supabase
    .from('interview_jobs')
    .select('job_name, keywords, is_active')
    .order('job_name', { ascending: true });
  if (error) {
    logger.error('[Admin Jobs GET detail] Query error:', error);
    return null;
  }
  const jobs = (data || []) as JobDetailRow[];

  // 직군별 문항 수 집계 RPC 1회 (결과에 없는 직군은 0/0)
  const { data: countData, error: countErr } = await supabase.rpc('job_question_counts');
  if (countErr) {
    logger.error('[Admin Jobs GET detail] Count RPC error:', countErr);
    return null;
  }
  const counts = new Map<string, { total: number; active: number }>();
  ((countData || []) as Array<{ job_name: string; question_count: number; active_question_count: number }>).forEach(
    (r) => counts.set(r.job_name, { total: Number(r.question_count) || 0, active: Number(r.active_question_count) || 0 })
  );

  return jobs.map((j) => ({
    job_name: j.job_name,
    keywords: j.keywords || [],
    is_active: j.is_active,
    question_count: counts.get(j.job_name)?.total ?? 0,
    active_question_count: counts.get(j.job_name)?.active ?? 0,
  }));
}

// GET /api/admin/jobs — 직군 목록 (필터 select 용, {items:string[]})
// GET /api/admin/jobs?detail=1 — 문항 관리용 상세 ({items:[{job_name, keywords, is_active, question_count, active_question_count}]})
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get('detail') === '1') {
      const items = await getJobDetails();
      if (!items) return NextResponse.json({ error: '직군 상세 조회 실패' }, { status: 500 });
      return NextResponse.json({ items });
    }

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
