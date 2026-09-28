import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { estimateCostUsd } from '@/lib/llmCost';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' (KST 달력 날짜) → 해당 날짜의 UTC 기준 00:00 ms (달력 연산용). 잘못된 날짜면 null */
function parseYmd(s: string): number | null {
  if (!DATE_RE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // 2026-02-30 같은 롤오버 방지: 왕복 일치 확인
  if (new Date(ms).toISOString().slice(0, 10) !== s) return null;
  return ms;
}

/** 달력 연산용 ms → 'YYYY-MM-DD' */
function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 현재 KST 달력 날짜 (UTC 00:00 ms 표현) */
function todayKstMs(): number {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  return Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
}

/** KST 달력 날짜의 00:00 KST → ISO 타임스탬프 */
function kstMidnightIso(dayMs: number): string {
  return new Date(dayMs - KST_OFFSET_MS).toISOString();
}

interface RpcTotals {
  tokens?: { chat_in?: number; chat_out?: number; ana_in?: number; ana_out?: number };
  [key: string]: unknown;
}

interface RpcResult {
  totals?: RpcTotals;
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const fromParam = searchParams.get('from')?.trim() || '';
    const toParam = searchParams.get('to')?.trim() || '';
    const job = searchParams.get('job')?.trim() || '';
    const company = searchParams.get('company')?.trim() || '';

    const today = todayKstMs();
    const toDay = toParam ? parseYmd(toParam) : today;
    const fromDay = fromParam
      ? parseYmd(fromParam)
      : toDay !== null
        ? toDay - (DEFAULT_RANGE_DAYS - 1) * DAY_MS
        : null;

    if (fromDay === null || toDay === null) {
      return NextResponse.json(
        { error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    if (fromDay > toDay) {
      return NextResponse.json({ error: '시작일이 종료일보다 늦습니다.' }, { status: 400 });
    }
    const rangeDays = Math.round((toDay - fromDay) / DAY_MS) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` },
        { status: 400 }
      );
    }

    const pFrom = kstMidnightIso(fromDay);
    const pTo = kstMidnightIso(toDay + DAY_MS); // 종료일 다음날 00:00 KST (exclusive)

    const { data, error } = await supabase.rpc('admin_session_stats', {
      p_from: pFrom,
      p_to: pTo,
      p_job: job || null,
      p_company: company || null,
    });

    if (error) {
      logger.error('[Admin Stats Overview] RPC error:', error);
      return NextResponse.json({ error: '통계 조회에 실패했습니다.' }, { status: 500 });
    }

    const result: RpcResult = (data as RpcResult | null) ?? {};
    const tokens = result.totals?.tokens ?? {};
    const chatUsd = estimateCostUsd('gpt-4o', Number(tokens.chat_in) || 0, Number(tokens.chat_out) || 0);
    const analysisUsd = estimateCostUsd('gpt-4o', Number(tokens.ana_in) || 0, Number(tokens.ana_out) || 0);

    return NextResponse.json({
      range: { from: toYmd(fromDay), to: toYmd(toDay) },
      ...result,
      cost: {
        chat_usd: chatUsd,
        analysis_usd: analysisUsd,
        total_usd: chatUsd + analysisUsd,
      },
    });
  } catch (error) {
    logger.error('[Admin Stats Overview] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
