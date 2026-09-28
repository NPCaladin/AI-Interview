import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { invalidateInterviewDataCache } from '@/lib/serverInterviewData';

export const dynamic = 'force-dynamic';

const CRITERION_MAX = 200;
const ITEMS_MIN = 1;
const ITEMS_MAX = 20;

interface CriterionRow {
  id: string;
  criterion: string;
  sort_order: number;
}

async function loadCriteria(): Promise<CriterionRow[] | null> {
  const { data, error } = await supabase
    .from('interview_eval_criteria')
    .select('id, criterion, sort_order')
    .order('sort_order', { ascending: true });
  if (error) {
    logger.error('[Admin Criteria] Query error:', error);
    return null;
  }
  return (data || []) as CriterionRow[];
}

// GET /api/admin/eval-criteria — 평가 기준 목록 (sort_order asc)
export async function GET() {
  try {
    const items = await loadCriteria();
    if (!items) return NextResponse.json({ error: '평가 기준 조회 실패' }, { status: 500 });
    return NextResponse.json({ items });
  } catch (error) {
    logger.error('[Admin Criteria GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT /api/admin/eval-criteria — 순서 포함 전체 교체
// RPC replace_eval_criteria 1회(한 트랜잭션): body 에 없는 기존 id → delete, 있는 id → update, id 없음 → insert
export async function PUT(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '요청 본문(JSON)이 올바르지 않습니다.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || !Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items 배열이 필요합니다.' }, { status: 400 });
    }

    const rawItems = body.items as unknown[];
    if (rawItems.length < ITEMS_MIN || rawItems.length > ITEMS_MAX) {
      return NextResponse.json(
        { error: `평가 기준은 ${ITEMS_MIN}~${ITEMS_MAX}개여야 합니다.` },
        { status: 400 }
      );
    }

    const items: Array<{ id: string | null; criterion: string }> = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i] as Record<string, unknown> | null;
      if (!it || typeof it !== 'object') {
        return NextResponse.json({ error: `${i + 1}번째 항목이 올바르지 않습니다.` }, { status: 400 });
      }
      const criterion = typeof it.criterion === 'string' ? it.criterion.trim() : '';
      if (criterion.length < 1 || criterion.length > CRITERION_MAX) {
        return NextResponse.json(
          { error: `${i + 1}번째 기준은 1~${CRITERION_MAX}자여야 합니다.` },
          { status: 400 }
        );
      }
      let id: string | null = null;
      if (it.id !== undefined && it.id !== null && it.id !== '') {
        if (!isUuid(it.id)) {
          return NextResponse.json({ error: `${i + 1}번째 항목의 id 가 올바르지 않습니다.` }, { status: 400 });
        }
        if (seenIds.has(it.id)) {
          return NextResponse.json({ error: '같은 id 가 두 번 포함되어 있습니다.' }, { status: 400 });
        }
        seenIds.add(it.id);
        id = it.id;
      }
      items.push({ id, criterion });
    }

    const before = await loadCriteria();
    if (!before) return NextResponse.json({ error: '평가 기준 조회 실패' }, { status: 500 });
    const existingIds = new Set(before.map((r) => r.id));
    const unknownId = items.find((it) => it.id !== null && !existingIds.has(it.id));
    if (unknownId) {
      return NextResponse.json({ error: '존재하지 않는 평가 기준 id 가 포함되어 있습니다.' }, { status: 400 });
    }

    // 한 트랜잭션: 목록에 없는 행 delete / 있는 id update(sort_order=index) / id 없음 insert
    const pItems = items.map((it) => (it.id ? { id: it.id, criterion: it.criterion } : { criterion: it.criterion }));
    const { data: rpcData, error: rpcErr } = await supabase.rpc('replace_eval_criteria', { p_items: pItems });
    if (rpcErr) {
      logger.error('[Admin Criteria PUT] RPC error:', rpcErr.message);
      return NextResponse.json({ error: '평가 기준 저장에 실패했습니다.' }, { status: 500 });
    }
    const after = (Array.isArray(rpcData) ? rpcData : []) as CriterionRow[];
    const deletedCount = before.filter((r) => !seenIds.has(r.id)).length;
    const insertedCount = items.filter((it) => it.id === null).length;

    await logAdminAction({
      actor: getAdminActor(request),
      action: 'CRITERIA_UPDATE',
      resource_type: 'eval_criteria',
      resource_id: null,
      old_values: { items: before.map((r) => r.criterion) },
      new_values: { items: items.map((it) => it.criterion) },
      details: { deleted: deletedCount, updated: seenIds.size, inserted: insertedCount },
      request,
    });
    invalidateInterviewDataCache();

    return NextResponse.json({ ok: true, items: after });
  } catch (error) {
    logger.error('[Admin Criteria PUT] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
