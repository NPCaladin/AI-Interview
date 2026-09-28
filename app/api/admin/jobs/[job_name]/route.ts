import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const KEYWORD_MAX_LEN = 30;
const KEYWORDS_MAX = 50;

interface JobRow {
  job_name: string;
  keywords: string[] | null;
  is_active: boolean;
  updated_at: string | null;
}

type RouteContext = { params: { job_name: string } };

// PATCH /api/admin/jobs/[job_name] — 직군 키워드·활성 여부 수정
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    let jobName: string;
    try {
      jobName = decodeURIComponent(params.job_name || '').trim();
    } catch {
      return NextResponse.json({ error: '직군명이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!jobName) return NextResponse.json({ error: '직군명이 필요합니다.' }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }

    const updates: { keywords?: string[]; is_active?: boolean } = {};
    if (body.keywords !== undefined) {
      if (!Array.isArray(body.keywords) || !body.keywords.every((k) => typeof k === 'string')) {
        return NextResponse.json({ error: 'keywords 는 문자열 배열이어야 합니다.' }, { status: 400 });
      }
      const keywords = (body.keywords as string[]).map((k) => k.trim());
      if (keywords.length > KEYWORDS_MAX) {
        return NextResponse.json({ error: `키워드는 최대 ${KEYWORDS_MAX}개까지입니다.` }, { status: 400 });
      }
      if (keywords.some((k) => k.length < 1 || k.length > KEYWORD_MAX_LEN)) {
        return NextResponse.json(
          { error: `각 키워드는 1~${KEYWORD_MAX_LEN}자여야 합니다.` },
          { status: 400 }
        );
      }
      updates.keywords = keywords;
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active 는 boolean 이어야 합니다.' }, { status: 400 });
      }
      updates.is_active = body.is_active;
    }
    if (updates.keywords === undefined && updates.is_active === undefined) {
      return NextResponse.json({ error: '수정할 항목(keywords, is_active)이 없습니다.' }, { status: 400 });
    }

    const { data: beforeData, error: loadErr } = await supabase
      .from('interview_jobs')
      .select('job_name, keywords, is_active, updated_at')
      .eq('job_name', jobName)
      .maybeSingle();
    if (loadErr) {
      logger.error('[Admin Job PATCH] Lookup error:', loadErr);
      return NextResponse.json({ error: '직군 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!beforeData) return NextResponse.json({ error: '존재하지 않는 직군입니다.' }, { status: 404 });
    const before = beforeData as unknown as JobRow;

    const { data: updated, error: updErr } = await supabase
      .from('interview_jobs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('job_name', jobName)
      .select('job_name, keywords, is_active, updated_at')
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Job PATCH] Update error:', updErr);
      return NextResponse.json({ error: '직군 수정에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    if (updates.keywords !== undefined) {
      oldValues.keywords = before.keywords ?? [];
      newValues.keywords = updates.keywords;
    }
    if (updates.is_active !== undefined) {
      oldValues.is_active = before.is_active;
      newValues.is_active = updates.is_active;
    }
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'JOB_KEYWORDS_UPDATE',
      resource_type: 'job',
      resource_id: jobName,
      old_values: oldValues,
      new_values: newValues,
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Job PATCH] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
