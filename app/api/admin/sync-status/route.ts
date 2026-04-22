/**
 * ERP 동기화 상태 조회 + 수동 트리거
 * GET  /api/admin/sync-status      -> { state, recentRuns }
 * POST /api/admin/sync-status      body: {dryRun?: boolean, maxPages?: number}
 *
 * 권한: middleware 의 admin JWT 검증에 의존
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { runErpPull } from '@/lib/erp/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const { data: state, error: sErr } = await supabase
      .from('erp_sync_state')
      .select('id, last_updated_at, last_cursor, last_run_at, last_success_at, is_running, started_at')
      .eq('id', 1)
      .maybeSingle();

    if (sErr) {
      logger.error('[Admin SyncStatus GET] state error:', sErr);
      return NextResponse.json({ error: '상태 조회 실패' }, { status: 500 });
    }

    const { data: runs, error: rErr } = await supabase
      .from('erp_sync_runs')
      .select('id, started_at, finished_at, status, pages_fetched, records_upserted, records_queued, error_code, error_snippet, dry_run')
      .order('started_at', { ascending: false })
      .limit(10);

    if (rErr) {
      logger.error('[Admin SyncStatus GET] runs error:', rErr);
      return NextResponse.json({ error: '실행 이력 조회 실패' }, { status: 500 });
    }

    return NextResponse.json(
      {
        state: state ?? null,
        recentRuns: runs || [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    logger.error('[Admin SyncStatus GET] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
    }

    const dryRun = body.dryRun === true;
    const maxPages =
      typeof body.maxPages === 'number' && body.maxPages > 0
        ? Math.min(50, Math.floor(body.maxPages))
        : undefined;

    const result = await runErpPull({ dryRun, maxPages });
    return NextResponse.json(result);
  } catch (e) {
    logger.error('[Admin SyncStatus POST] Error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
