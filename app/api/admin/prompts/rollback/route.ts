import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { isUuid } from '@/lib/sessionStore';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { buildRollbackMemo, invalidateSlotCache, isPromptSlot } from '@/lib/promptSlots';
import {
  PROMPT_VERSION_COLUMNS,
  activatePromptVersion,
  currentActiveBodyForAudit,
  type PromptVersionRow,
} from '@/lib/promptVersionAdmin';

export const dynamic = 'force-dynamic';

// POST /api/admin/prompts/rollback — { id } 대상 버전 본문으로 새 활성 버전 생성
export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    const { id } = (payload ?? {}) as { id?: unknown };
    if (!isUuid(id)) {
      return NextResponse.json({ error: '버전 ID(UUID)가 올바르지 않습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('prompt_versions')
      .select(PROMPT_VERSION_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.error('[Admin Prompts Rollback] Query error:', error);
      return NextResponse.json({ error: '버전 조회 실패' }, { status: 500 });
    }
    const target = data as PromptVersionRow | null;
    if (!target) {
      return NextResponse.json({ error: '버전을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!isPromptSlot(target.slot)) {
      return NextResponse.json({ error: '알 수 없는 슬롯의 버전입니다.' }, { status: 400 });
    }

    const slot = target.slot;
    const actor = getAdminActor(request);
    const memo = buildRollbackMemo(target.id, target.version_memo);
    const oldBody = await currentActiveBodyForAudit(slot);

    const res = await activatePromptVersion({ slot, body: target.body, memo, actor });
    if (res.error || !res.id) {
      logger.error('[Admin Prompts Rollback] RPC error:', res.error);
      return NextResponse.json({ error: '롤백에 실패했습니다.' }, { status: 500 });
    }

    invalidateSlotCache(slot);

    await logAdminAction({
      actor,
      action: 'PROMPT_ROLLBACK',
      resource_type: 'prompt_version',
      resource_id: res.id,
      old_values: { body: oldBody },
      new_values: { body: target.body },
      details: { slot, rolled_back_from: target.id, version_memo: memo },
      request,
    });

    return NextResponse.json({ ok: true, id: res.id });
  } catch (error) {
    logger.error('[Admin Prompts Rollback] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
