import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import {
  PROMPT_SLOT_META,
  getDefaultSlotBody,
  invalidateSlotCache,
  isPromptSlot,
  validateSlotBody,
} from '@/lib/promptSlots';
import {
  PROMPT_HISTORY_COLUMNS,
  PROMPT_HISTORY_LIMIT,
  VERSION_MEMO_MAX,
  activatePromptVersion,
  currentActiveBodyForAudit,
  fetchActiveVersion,
} from '@/lib/promptVersionAdmin';

export const dynamic = 'force-dynamic';

// GET /api/admin/prompts?slot= — 슬롯 메타 + 현재 활성(없으면 코드 기본값) + 최근 이력 20건(body 제외)
export async function GET(request: NextRequest) {
  try {
    const slot = request.nextUrl.searchParams.get('slot');
    if (!isPromptSlot(slot)) {
      return NextResponse.json({ error: '슬롯 값이 올바르지 않습니다.' }, { status: 400 });
    }

    const [activeRes, historyRes] = await Promise.all([
      fetchActiveVersion(slot),
      supabase
        .from('prompt_versions')
        .select(PROMPT_HISTORY_COLUMNS)
        .eq('slot', slot)
        .order('created_at', { ascending: false })
        .limit(PROMPT_HISTORY_LIMIT),
    ]);

    if (activeRes.error) {
      logger.error('[Admin Prompts GET] Active query error:', activeRes.error);
      return NextResponse.json({ error: '활성 버전 조회 실패' }, { status: 500 });
    }
    if (historyRes.error) {
      logger.error('[Admin Prompts GET] History query error:', historyRes.error);
      return NextResponse.json({ error: '버전 이력 조회 실패' }, { status: 500 });
    }

    const row = activeRes.data;
    const defaultBody = getDefaultSlotBody(slot);
    const active = row
      ? {
          id: row.id,
          body: row.body,
          char_count: row.char_count,
          version_memo: row.version_memo,
          created_by: row.created_by,
          created_at: row.created_at,
          from_default: false,
        }
      : {
          id: null,
          body: defaultBody,
          char_count: defaultBody.length,
          version_memo: null,
          created_by: null,
          created_at: null,
          from_default: true,
        };

    return NextResponse.json({
      slot,
      meta: PROMPT_SLOT_META[slot],
      active,
      history: historyRes.data || [],
    });
  } catch (error) {
    logger.error('[Admin Prompts GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST /api/admin/prompts — { slot, body, version_memo } 새 버전 저장 + 즉시 활성화
export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    const { slot, body, version_memo } = (payload ?? {}) as {
      slot?: unknown;
      body?: unknown;
      version_memo?: unknown;
    };

    if (!isPromptSlot(slot)) {
      return NextResponse.json({ error: '슬롯 값이 올바르지 않습니다.' }, { status: 400 });
    }
    if (typeof body !== 'string') {
      return NextResponse.json({ error: '본문(body)이 필요합니다.' }, { status: 400 });
    }
    const memo = typeof version_memo === 'string' ? version_memo.trim() : '';
    if (memo.length < 1 || memo.length > VERSION_MEMO_MAX) {
      return NextResponse.json(
        { error: `변경 사유는 1~${VERSION_MEMO_MAX}자로 입력해 주세요.` },
        { status: 400 }
      );
    }
    const check = validateSlotBody(slot, body);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const actor = getAdminActor(request);
    const oldBody = await currentActiveBodyForAudit(slot);

    const { id, error } = await activatePromptVersion({ slot, body, memo, actor });
    if (error || !id) {
      logger.error('[Admin Prompts POST] RPC error:', error);
      return NextResponse.json({ error: '버전 저장에 실패했습니다.' }, { status: 500 });
    }

    invalidateSlotCache(slot);

    await logAdminAction({
      actor,
      action: 'PROMPT_UPDATE',
      resource_type: 'prompt_version',
      resource_id: id,
      old_values: { body: oldBody },
      new_values: { body },
      details: { slot, version_memo: memo },
      request,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    logger.error('[Admin Prompts POST] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
