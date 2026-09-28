import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, category, question, source, is_active, updated_at';
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const CATEGORY_MAX = 50;

interface PersonalityRow {
  id: string;
  category: string;
  question: string;
  source: string;
  is_active: boolean;
  updated_at: string | null;
}

type RouteContext = { params: { id: string } };

async function loadRow(id: string): Promise<{ row: PersonalityRow | null; error: boolean }> {
  const { data, error } = await supabase
    .from('interview_personality_questions')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[Admin Personality] Lookup error:', error);
    return { row: null, error: true };
  }
  return { row: (data as unknown as PersonalityRow) ?? null, error: false };
}

// PATCH /api/admin/personality-questions/[id] — 카테고리·질문 수정
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '질문 ID(UUID)가 필요합니다.' }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }

    const updates: { category?: string; question?: string } = {};
    if (body.category !== undefined) {
      const c = typeof body.category === 'string' ? body.category.trim() : '';
      if (!c || c.length > CATEGORY_MAX) {
        return NextResponse.json({ error: `카테고리는 1~${CATEGORY_MAX}자여야 합니다.` }, { status: 400 });
      }
      updates.category = c;
    }
    if (body.question !== undefined) {
      const q = typeof body.question === 'string' ? body.question.trim() : '';
      if (q.length < QUESTION_MIN || q.length > QUESTION_MAX) {
        return NextResponse.json(
          { error: `질문은 ${QUESTION_MIN}~${QUESTION_MAX}자여야 합니다.` },
          { status: 400 }
        );
      }
      updates.question = q;
    }
    if (updates.category === undefined && updates.question === undefined) {
      return NextResponse.json({ error: '수정할 항목(category, question)이 없습니다.' }, { status: 400 });
    }

    const { row: before, error: loadErr } = await loadRow(id);
    if (loadErr) return NextResponse.json({ error: '질문 조회에 실패했습니다.' }, { status: 500 });
    if (!before) return NextResponse.json({ error: '질문을 찾을 수 없습니다.' }, { status: 404 });

    const { data: updated, error: updErr } = await supabase
      .from('interview_personality_questions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Personality PATCH] Update error:', updErr);
      return NextResponse.json({ error: '인성 질문 수정에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_UPDATE',
      resource_type: 'personality_question',
      resource_id: id,
      old_values: { category: before.category, question: before.question },
      new_values: {
        category: updates.category ?? before.category,
        question: updates.question ?? before.question,
      },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Personality PATCH] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE /api/admin/personality-questions/[id] — soft delete (is_active=false)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '질문 ID(UUID)가 필요합니다.' }, { status: 400 });

    const { row: before, error: loadErr } = await loadRow(id);
    if (loadErr) return NextResponse.json({ error: '질문 조회에 실패했습니다.' }, { status: 500 });
    if (!before) return NextResponse.json({ error: '질문을 찾을 수 없습니다.' }, { status: 404 });

    const { data: updated, error: updErr } = await supabase
      .from('interview_personality_questions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Personality DELETE] Update error:', updErr);
      return NextResponse.json({ error: '인성 질문 비활성화에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_DELETE',
      resource_type: 'personality_question',
      resource_id: id,
      old_values: { is_active: before.is_active },
      new_values: { is_active: false },
      details: { category: before.category, question: before.question },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Personality DELETE] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
