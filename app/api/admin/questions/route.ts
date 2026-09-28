import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const LIST_COLUMNS = 'id, job_name, question, raw_text, company_tag, source, is_active, created_at, updated_at';
const NO_TAG = '__none__';
const DEFAULT_TAG = '공통';
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const TAG_MAX = 30;

/** 회사 태그 정규화 — 비면 '공통'. 대괄호 포함·길이 초과는 null(검증 실패) */
function normalizeTag(v: unknown): string | null {
  if (v === undefined || v === null) return DEFAULT_TAG;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return DEFAULT_TAG;
  if (t.length > TAG_MAX || /[[\]]/.test(t)) return null;
  return t;
}

// GET /api/admin/questions — 직군 기출 문항 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const job = (searchParams.get('job') || '').trim();
    const company = (searchParams.get('company') || '').trim();
    const search = (searchParams.get('search') || '').trim();
    const includeInactive = searchParams.get('includeInactive') === '1';
    const offset = (page - 1) * limit;

    let query = supabase.from('interview_questions').select(LIST_COLUMNS, { count: 'exact' });
    if (job) query = query.eq('job_name', job);
    if (company === NO_TAG) query = query.is('company_tag', null);
    else if (company) query = query.eq('company_tag', company);
    if (!includeInactive) query = query.eq('is_active', true);
    if (search) {
      const safe = search.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
      query = query.ilike('question', `%${safe}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('[Admin Questions GET] Query error:', error);
      return NextResponse.json({ error: '문항 목록 조회 실패' }, { status: 500 });
    }

    return NextResponse.json({ items: data || [], total: count || 0, page, limit });
  } catch (error) {
    logger.error('[Admin Questions GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST /api/admin/questions — 단건 추가
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }

    const jobName = typeof body.job_name === 'string' ? body.job_name.trim() : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const tag = normalizeTag(body.company_tag);

    if (!jobName) return NextResponse.json({ error: '직군(job_name)이 필요합니다.' }, { status: 400 });
    if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
      return NextResponse.json(
        { error: `질문은 ${QUESTION_MIN}~${QUESTION_MAX}자여야 합니다.` },
        { status: 400 }
      );
    }
    if (tag === null) {
      return NextResponse.json(
        { error: `회사 태그는 ${TAG_MAX}자 이하이며 대괄호를 포함할 수 없습니다.` },
        { status: 400 }
      );
    }

    const { data: jobRow, error: jobErr } = await supabase
      .from('interview_jobs')
      .select('job_name')
      .eq('job_name', jobName)
      .maybeSingle();
    if (jobErr) {
      logger.error('[Admin Questions POST] Job lookup error:', jobErr);
      return NextResponse.json({ error: '직군 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!jobRow) return NextResponse.json({ error: '존재하지 않는 직군입니다.' }, { status: 404 });

    const { data: dup, error: dupErr } = await supabase
      .from('interview_questions')
      .select('id')
      .eq('job_name', jobName)
      .eq('question', question)
      .limit(1);
    if (dupErr) {
      logger.error('[Admin Questions POST] Dup check error:', dupErr);
      return NextResponse.json({ error: '중복 확인에 실패했습니다.' }, { status: 500 });
    }
    if (dup && dup.length > 0) {
      return NextResponse.json({ error: '같은 직군에 동일한 질문이 이미 있습니다.' }, { status: 409 });
    }

    const row = {
      job_name: jobName,
      question,
      raw_text: `[${tag}] ${question}`,
      company_tag: tag,
      source: 'manual',
      updated_at: new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await supabase
      .from('interview_questions')
      .insert(row)
      .select(LIST_COLUMNS)
      .single();
    if (insErr || !inserted) {
      logger.error('[Admin Questions POST] Insert error:', insErr);
      return NextResponse.json({ error: '문항 추가에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    const item = inserted as unknown as { id: string };
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_CREATE',
      resource_type: 'question',
      resource_id: item.id,
      new_values: row,
      request,
    });

    return NextResponse.json({ ok: true, item: inserted }, { status: 201 });
  } catch (error) {
    logger.error('[Admin Questions POST] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
