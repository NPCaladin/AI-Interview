/**
 * 재활성화 큐 일괄 승인 (ERP 합의 2026-09-23 4조건 전부 충족 건만)
 * POST /api/admin/reactivations/bulk-approve  body: { ids: string[] }  (1~50, 각 UUID)
 *  - 클라이언트 캐시를 믿지 않고 서버가 id 마다 fetchEligibility 를 다시 호출한다 (동시 5개)
 *  - all_pass 인 건만 RPC approve_reactivation 호출, 나머지는 skip
 *  - 자격 결과는 큐 행에도 캐시
 * 응답: { approved: [{id, student_code}], skipped: [{id, student_code, reason}] }
 *   reason: 'not_eligible' | 'unavailable' | 'not_pending' | 'not_found' | RPC code | 'rpc_error'
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';
import { fetchEligibility } from '@/lib/erp/eligibility';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // ERP 자격 조회 10s 타임아웃 기준

const MAX_IDS = 50;
const CONCURRENCY = 5;
const BULK_NOTE = '[일괄 승인] 4조건 충족';

interface ApprovedItem {
  id: string;
  student_code: string;
}

interface SkippedItem {
  id: string;
  student_code: string | null;
  reason: string;
}

interface RpcResult {
  ok?: boolean;
  code?: string;
  student_id?: string;
  student_code?: string;
}

type Outcome = { kind: 'approved'; item: ApprovedItem } | { kind: 'skipped'; item: SkippedItem };

async function processOne(
  id: string,
  row: { student_code: string; status: string } | undefined,
  actor: string,
): Promise<Outcome> {
  if (!row) return { kind: 'skipped', item: { id, student_code: null, reason: 'not_found' } };
  const code = row.student_code;
  if (row.status !== 'pending') {
    return { kind: 'skipped', item: { id, student_code: code, reason: 'not_pending' } };
  }

  const eligibility = await fetchEligibility(code);

  const { error: cacheErr } = await supabase
    .from('pending_reactivations')
    .update({ eligibility, eligibility_checked_at: eligibility.checked_at })
    .eq('id', id);
  if (cacheErr) logger.warn('[Admin Bulk Approve] eligibility cache failed:', id, cacheErr.message);

  if (eligibility.source === 'unavailable') {
    return { kind: 'skipped', item: { id, student_code: code, reason: 'unavailable' } };
  }
  if (!eligibility.all_pass) {
    return { kind: 'skipped', item: { id, student_code: code, reason: 'not_eligible' } };
  }

  const { data, error } = await supabase.rpc('approve_reactivation', {
    p_id: id,
    p_actor: actor,
    p_note: BULK_NOTE,
  });
  if (error) {
    logger.error('[Admin Bulk Approve] RPC error:', id, error);
    return { kind: 'skipped', item: { id, student_code: code, reason: 'rpc_error' } };
  }
  const result = (data ?? {}) as RpcResult;
  if (!result.ok) {
    return { kind: 'skipped', item: { id, student_code: code, reason: result.code || 'rpc_error' } };
  }
  return { kind: 'approved', item: { id, student_code: result.student_code || code } };
}

/** 동시 실행 개수 제한 풀 — 결과는 입력 순서 유지 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
    }
    const rawIds = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > MAX_IDS) {
      return NextResponse.json({ error: `ids 는 1~${MAX_IDS}개 배열이어야 합니다.` }, { status: 400 });
    }
    if (!rawIds.every((v) => isUuid(v))) {
      return NextResponse.json({ error: 'ids 의 각 항목은 UUID 여야 합니다.' }, { status: 400 });
    }
    const ids = Array.from(new Set(rawIds as string[]));

    const { data: rows, error: rowsErr } = await supabase
      .from('pending_reactivations')
      .select('id, student_code, status')
      .in('id', ids);
    if (rowsErr) {
      logger.error('[Admin Bulk Approve] rows lookup error:', rowsErr);
      return NextResponse.json({ error: '조회 실패' }, { status: 500 });
    }
    const rowMap = new Map<string, { student_code: string; status: string }>();
    ((rows ?? []) as Array<{ id: string; student_code: string; status: string }>).forEach((r) => {
      rowMap.set(r.id, { student_code: r.student_code, status: r.status });
    });

    const actor = getAdminActor(request);
    const outcomes = await mapWithConcurrency(ids, CONCURRENCY, (id) => processOne(id, rowMap.get(id), actor));

    const approved: ApprovedItem[] = [];
    const skipped: SkippedItem[] = [];
    outcomes.forEach((o) => {
      if (o.kind === 'approved') approved.push(o.item);
      else skipped.push(o.item);
    });

    await logAdminAction({
      actor,
      action: 'QUEUE_BULK_APPROVE',
      resource_type: 'reactivation',
      resource_id: null,
      details: { requested: ids.length, approved, skipped },
      request,
    });

    return NextResponse.json({ approved, skipped });
  } catch (e) {
    logger.error('[Admin Bulk Approve] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
