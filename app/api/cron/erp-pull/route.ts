/**
 * Vercel Cron: 매일 18:00 UTC (KST 03:00) ERP pull
 * 스케줄: vercel.json crons
 * 인증: Authorization: Bearer {CRON_SECRET} (Vercel Cron이 자동 주입)
 *
 * maxDuration 60 — ERP_MAX_PAGES_PER_RUN 조정으로 시간 제어
 * 중간 끊김 시 다음 cron에서 last_cursor 로 재개
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { runErpPull } from '@/lib/erp/sync';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronSecret(authHeader: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error('[Cron ERP] CRON_SECRET not set');
    return false;
  }
  if (!authHeader?.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7);
  const aBuf = Buffer.from(provided);
  const bBuf = Buffer.from(expected);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401 },
    );
  }

  const dryRun = process.env.ERP_DRY_RUN === 'true';

  try {
    const result = await runErpPull({ dryRun });
    logger.info('[Cron ERP] Completed', {
      dryRun,
      pagesFetched: result.pagesFetched,
      upserted: result.upserted,
      queued: result.queued,
      deactivated: result.deactivated,
      errors: result.errors.length,
    });
    return NextResponse.json({
      ok: true,
      skipped: result.skipped === true,
      reason: result.reason,
      dryRun: result.dryRun,
      pagesFetched: result.pagesFetched,
      upserted: result.upserted,
      queued: result.queued,
      deactivated: result.deactivated,
      errorsCount: result.errors.length,
      finalCursor: result.finalCursor,
    });
  } catch (e) {
    logger.error('[Cron ERP] Uncaught error:', e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
