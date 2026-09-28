import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, category, question, source, is_active, updated_at';

type RouteContext = { params: { id: string } };

// POST /api/admin/personality-questions/[id]/restore — 비활성 인성 질문 복원
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '질문 ID(UUID)가 필요합니다.' }, { status: 400 });

    const { data: beforeData, error: loadErr } = await supabase
      .from('interview_personality_questions')
      .select('id, category, question, is_active')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) {
      logger.error('[Admin Personality RESTORE] Lookup error:', loadErr);
      return NextResponse.json({ error: '질문 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!beforeData) return NextResponse.json({ error: '질문을 찾을 수 없습니다.' }, { status: 404 });
    const before = beforeData as { id: string; category: string; question: string; is_active: boolean };

    const { data: updated, error: updErr } = await supabase
      .from('interview_personality_questions')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Personality RESTORE] Update error:', updErr);
      return NextResponse.json({ error: '인성 질문 복원에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_RESTORE',
      resource_type: 'personality_question',
      resource_id: id,
      old_values: { is_active: before.is_active },
      new_values: { is_active: true },
      details: { category: before.category, question: before.question },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Personality RESTORE] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
