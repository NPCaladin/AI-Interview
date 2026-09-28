import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id, job_name, question, raw_text, company_tag, source, is_active, created_at, updated_at';

type RouteContext = { params: { id: string } };

// POST /api/admin/questions/[id]/restore — 비활성 문항 복원 (is_active=true)
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) return NextResponse.json({ error: '문항 ID(UUID)가 필요합니다.' }, { status: 400 });

    const { data: beforeData, error: loadErr } = await supabase
      .from('interview_questions')
      .select('id, job_name, question, is_active')
      .eq('id', id)
      .maybeSingle();
    if (loadErr) {
      logger.error('[Admin Question RESTORE] Lookup error:', loadErr);
      return NextResponse.json({ error: '문항 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!beforeData) return NextResponse.json({ error: '문항을 찾을 수 없습니다.' }, { status: 404 });
    const before = beforeData as { id: string; job_name: string; question: string; is_active: boolean };

    const { data: updated, error: updErr } = await supabase
      .from('interview_questions')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updErr || !updated) {
      logger.error('[Admin Question RESTORE] Update error:', updErr);
      return NextResponse.json({ error: '문항 복원에 실패했습니다.' }, { status: 500 });
    }

    invalidateInterviewDataCache();
    await logAdminAction({
      actor: getAdminActor(request),
      action: 'QUESTION_RESTORE',
      resource_type: 'question',
      resource_id: id,
      old_values: { is_active: before.is_active },
      new_values: { is_active: true },
      details: { job_name: before.job_name, question: before.question },
      request,
    });

    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    logger.error('[Admin Question RESTORE] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
