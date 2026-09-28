import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { RESET_MEMO, getDefaultSlotBody, invalidateSlotCache, isPromptSlot } from '@/lib/promptSlots';
import { activatePromptVersion, currentActiveBodyForAudit } from '@/lib/promptVersionAdmin';

export const dynamic = 'force-dynamic';

// POST /api/admin/prompts/reset — { slot } 코드 기본값으로 새 활성 버전 생성
export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    const { slot } = (payload ?? {}) as { slot?: unknown };
    if (!isPromptSlot(slot)) {
      return NextResponse.json({ error: '슬롯 값이 올바르지 않습니다.' }, { status: 400 });
    }

    const actor = getAdminActor(request);
    const body = getDefaultSlotBody(slot);
    const oldBody = await currentActiveBodyForAudit(slot);

    const res = await activatePromptVersion({ slot, body, memo: RESET_MEMO, actor });
    if (res.error || !res.id) {
      logger.error('[Admin Prompts Reset] RPC error:', res.error);
      return NextResponse.json({ error: '기본값 복원에 실패했습니다.' }, { status: 500 });
    }

    invalidateSlotCache(slot);

    await logAdminAction({
      actor,
      action: 'PROMPT_RESET_DEFAULT',
      resource_type: 'prompt_version',
      resource_id: res.id,
      old_values: { body: oldBody },
      new_values: { body },
      details: { slot, version_memo: RESET_MEMO },
      request,
    });

    return NextResponse.json({ ok: true, id: res.id });
  } catch (error) {
    logger.error('[Admin Prompts Reset] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
