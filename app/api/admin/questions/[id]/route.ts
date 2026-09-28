import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, job_name, question, raw_text, company_tag, source, is_active, created_at, updated_at';
const DEFAULT_TAG = '공통';
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const TAG_MAX = 30;

interface QuestionRow {
  id: string;
  job_name: string;
  question: string;
  raw_text: string;
  company_tag: string | null;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

type RouteContext = { params: { id: string } };

function normalizeTag(v: unknown): string | null {
  if (v === undefined || v === null) return DEFAULT_TAG;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return DEFAULT_TAG;
  if (t.length > TAG_MAX || /[[\]]/.test(t)) return null;
  return t;
}

/** 태그가 NULL(기존 태그 없는 문항)이면 접두 없이 질문만 */
function buildRawText(tag: string | null, question: string): string {
  return tag ? `[${tag}] ${question}` : question;
}

async function loadRow(id: string): Promise<{ row: QuestionRow | null; error: boolean }> {
  const { data, error } = await supabase.from('interview_questions').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    logger.error('[Admin Question] Lookup error:', error);
    return { row: null, error: true };
  }
  return { row: (data as unknown as QuestionRow) ?? null, error: false };
}

// PATCH /api/admin/questions/[id] — 질문·회사 태그 수정 (raw_text 재조립)
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '문항 ID(UUID)가 필요합니다.' }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }

    const hasQuestion = body.question !== undefined;
    const hasTag = body.company_tag !== undefined;
    if (!hasQuestion && !hasTag) {
      return NextResponse.json({ error: '수정할 항목(question, company_tag)이 없습니다.' }, { status: 400 });
    }

    let nextQuestion: string | undefined;
    if (hasQuestion) {
      if (typeof body.question !== 'string') {
        return NextResponse.json({ error: '질문은 문자열이어야 합니다.' }, { status: 400 });
      }
      nextQuestion = body.question.trim();
      if (nextQuestion.length < QUESTION_MIN || nextQuestion.length > QUESTION_MAX) {
        return NextResponse.json(
          { error: `질문은 ${QUESTION_MIN}~${QUESTION_MAX}자여야 합니다.` },
          { status: 400 }
        );
      }
    }
    let nextTag: string | undefined;
    if (hasTag) {
      const t = normalizeTag(body.company_tag);
      if (t === null) {
        return NextResponse.json(
          { error: `회사 태그는 ${TAG_MAX}자 이하이며 대괄호를 포함할 수 없습니다.` },
          { status: 400 }
        );
      }
      nextTag = t;
    }

    const { row: before, error: loadErr } = await loadRow(id);
    if (loadErr) return NextResponse.json({ error: '문항 조회에 실패했습니다.' }, { status: 500 });
    if (!before) return NextResponse.json({ error: '문항을 찾을 수 없습니다.' }, { status: 404 });

    const question = nextQuestion ?? before.question;
    const tag = nextTag !== undefined ? nextTag : before.company_tag;

    if (question !== before.question) {
      const { data: dup, error: dupErr } = await supabase
        .from('interview_questions')
        .select('id')
        .eq('job_name', before.job_name)
        .eq('question', question)
        .neq('id', id)
        .limit(1);
      if (dupErr) {
        logger.error('[Admin Question PATCH] Dup check error:', dupErr);
        return NextResponse.json({ error: '중복 확인에 실패했습니다.' }, { status: 500 });
      }
      if (dup && dup.length > 0) {
        return NextResponse.json({ error: '같은 직군에 동일한 질문이 이미 있습니다.' }, { status: 409 });
      }
    }

    const updates = {
      question,
      company_tag: tag,
      raw_text: buildRawText(tag, question),
      updated_at: new Date().toISOString(),
    };
    const { data: updated, error: updErr } = await supabase
      .from('interview_questions')
      .update(updates)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Question PATCH] Update error:', updErr);
      return NextResponse.json({ error: '문항 수정에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_UPDATE',
      resource_type: 'question',
      resource_id: id,
      old_values: { question: before.question, company_tag: before.company_tag, raw_text: before.raw_text },
      new_values: { question: updates.question, company_tag: updates.company_tag, raw_text: updates.raw_text },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Question PATCH] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE /api/admin/questions/[id] — soft delete (is_active=false)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '문항 ID(UUID)가 필요합니다.' }, { status: 400 });

    const { row: before, error: loadErr } = await loadRow(id);
    if (loadErr) return NextResponse.json({ error: '문항 조회에 실패했습니다.' }, { status: 500 });
    if (!before) return NextResponse.json({ error: '문항을 찾을 수 없습니다.' }, { status: 404 });

    const { data: updated, error: updErr } = await supabase
      .from('interview_questions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Question DELETE] Update error:', updErr);
      return NextResponse.json({ error: '문항 비활성화에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_DELETE',
      resource_type: 'question',
      resource_id: id,
      old_values: { is_active: before.is_active },
      new_values: { is_active: false },
      details: { job_name: before.job_name, question: before.question },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Question DELETE] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
