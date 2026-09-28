import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getAdminActor } from '@/lib/adminAuth';
import { logAdminAction, type AdminAction } from '@/lib/adminAudit';
import { isUuid } from '@/lib/sessionStore';

export const dynamic = 'force-dynamic';

const STUDENT_COLUMNS =
  'id, code, name, is_active, weekly_limit, source, sync_exempt, sync_exempt_reason, sync_exempt_until, admin_note, created_at, updated_at';

const SESSION_COLUMNS =
  'id, job_name, company_name, status, question_count, started_at, analysis_completed_at, total_score, pass_prediction, summary_title, report_version, is_dev';

const WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

interface StudentRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  weekly_limit: number;
  source: string | null;
  sync_exempt: boolean;
  sync_exempt_reason: string | null;
  sync_exempt_until: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
}

interface SessionRow {
  id: string;
  status: string;
  started_at: string | null;
  total_score: number | null;
  [key: string]: unknown;
}

/** Asia/Seoul 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** YYYY-MM-DD 를 UTC 자정 Date 로 (날짜 산술 전용 — 시간대 영향 없음) */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 최근 12주 KST 월요일 목록 (오래된 → 최신) */
function lastWeekStarts(today: string): string[] {
  const t = parseYmd(today);
  const dow = t.getUTCDay(); // 0=일
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = t.getTime() - daysFromMonday * DAY_MS;
  const weeks: string[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    weeks.push(formatYmd(new Date(monday - i * 7 * DAY_MS)));
  }
  return weeks;
}

type RouteContext = { params: { id: string } };

// GET /api/admin/students/[id] — 학생 상세 (프로필·사용량·세션·큐·감사 로그)
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) {
      return NextResponse.json({ error: '학생 ID(UUID)가 필요합니다.' }, { status: 400 });
    }

    const { data: studentData, error: studentErr } = await supabase
      .from('students')
      .select(STUDENT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (studentErr) {
      logger.error('[Admin Student GET] Lookup error:', studentErr);
      return NextResponse.json({ error: '학생 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!studentData) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const student = studentData as unknown as StudentRow;

    const today = todayKst();
    const weekStarts = lastWeekStarts(today);
    const since = formatYmd(new Date(parseYmd(today).getTime() - 84 * DAY_MS));

    const [remainingRes, usageRes, sessionsRes, queueRes, auditRes] = await Promise.all([
      supabase.rpc('get_weekly_remaining', { p_student_id: id }),
      // 주별 집계 RPC (weekly_limit 최대 100 × 12주 → 1000행 캡 회피)
      supabase.rpc('student_weekly_usage', { p_student_id: id, p_since: since }),
      supabase
        .from('interview_sessions')
        .select(SESSION_COLUMNS)
        .eq('student_id', id)
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('pending_reactivations')
        .select('*')
        .eq('student_code', student.code)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('admin_audit_log')
        .select('id, actor, action, old_values, new_values, details, created_at')
        .eq('resource_type', 'student')
        .eq('resource_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (remainingRes.error) logger.error('[Admin Student GET] Remaining RPC error:', remainingRes.error);
    if (usageRes.error) logger.error('[Admin Student GET] Usage query error:', usageRes.error);
    if (sessionsRes.error) logger.error('[Admin Student GET] Sessions query error:', sessionsRes.error);
    if (queueRes.error) logger.error('[Admin Student GET] Queue query error:', queueRes.error);
    if (auditRes.error) logger.error('[Admin Student GET] Audit query error:', auditRes.error);

    // 사용량 — 12주 집계 (없는 주는 0)
    const weekCount = new Map<string, number>();
    weekStarts.forEach((w) => weekCount.set(w, 0));
    const usageRows = (usageRes.data || []) as Array<{ week_start: string | null; cnt: number | null }>;
    for (let i = 0; i < usageRows.length; i++) {
      const ws = (usageRows[i].week_start || '').slice(0, 10);
      if (weekCount.has(ws)) weekCount.set(ws, usageRows[i].cnt ?? 0);
    }
    const weeks = weekStarts.map((w) => ({ week_start: w, count: weekCount.get(w) || 0 }));

    const rem = (remainingRes.data || {}) as { remaining?: number; limit?: number; used?: number };
    const usage = {
      remaining: typeof rem.remaining === 'number' ? rem.remaining : null,
      limit: typeof rem.limit === 'number' ? rem.limit : student.weekly_limit,
      used: typeof rem.used === 'number' ? rem.used : null,
      weeks,
    };

    // 세션 통계
    const sessions = (sessionsRes.data || []) as unknown as SessionRow[];
    const scores = sessions
      .filter((s) => s.status === 'analyzed' && typeof s.total_score === 'number' && Number.isFinite(s.total_score))
      .map((s) => s.total_score as number);
    const stats = {
      count: sessions.length,
      analyzed: sessions.filter((s) => s.status === 'analyzed').length,
      avg_score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      best: scores.length > 0 ? Math.max(...scores) : null,
      last_at: sessions.length > 0 ? sessions[0].started_at : null,
    };

    return NextResponse.json({
      student,
      usage,
      sessions,
      queue: queueRes.data || [],
      audit: auditRes.data || [],
      stats,
    });
  } catch (error) {
    logger.error('[Admin Student GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(v: string): boolean {
  if (!YMD_RE.test(v)) return false;
  const d = parseYmd(v);
  return !Number.isNaN(d.getTime()) && formatYmd(d) === v;
}

const EXEMPT_KEYS: readonly string[] = ['sync_exempt', 'sync_exempt_reason', 'sync_exempt_until'];

// PATCH /api/admin/students/[id] — 학생 필드 수정 (화이트리스트, 알 수 없는 키는 무시)
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const id = params.id;
    if (!isUuid(id)) {
      return NextResponse.json({ error: '학생 ID(UUID)가 필요합니다.' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 50) {
        return NextResponse.json({ error: '이름은 1~50자여야 합니다.' }, { status: 400 });
      }
      patch.name = body.name.trim();
    }

    if (body.weekly_limit !== undefined) {
      const v = body.weekly_limit;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100) {
        return NextResponse.json({ error: '주간 제한은 1~100 사이 정수여야 합니다.' }, { status: 400 });
      }
      patch.weekly_limit = v;
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active는 boolean이어야 합니다.' }, { status: 400 });
      }
      patch.is_active = body.is_active;
    }

    if (body.sync_exempt !== undefined) {
      if (typeof body.sync_exempt !== 'boolean') {
        return NextResponse.json({ error: 'sync_exempt는 boolean이어야 합니다.' }, { status: 400 });
      }
      patch.sync_exempt = body.sync_exempt;
    }

    if (body.sync_exempt_reason !== undefined) {
      const v = body.sync_exempt_reason;
      if (v !== null && (typeof v !== 'string' || v.length > 200)) {
        return NextResponse.json({ error: '예외 사유는 200자 이하 문자열 또는 null이어야 합니다.' }, { status: 400 });
      }
      patch.sync_exempt_reason = v;
    }

    if (body.sync_exempt_until !== undefined) {
      const v = body.sync_exempt_until;
      if (v !== null && (typeof v !== 'string' || !isValidYmd(v))) {
        return NextResponse.json({ error: '해제일은 YYYY-MM-DD 형식 또는 null이어야 합니다.' }, { status: 400 });
      }
      patch.sync_exempt_until = v;
    }

    if (body.admin_note !== undefined) {
      const v = body.admin_note;
      if (v !== null && (typeof v !== 'string' || v.length > 2000)) {
        return NextResponse.json({ error: '관리자 메모는 2000자 이하 문자열 또는 null이어야 합니다.' }, { status: 400 });
      }
      patch.admin_note = v;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
    }

    const { data: beforeData, error: beforeErr } = await supabase
      .from('students')
      .select(STUDENT_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (beforeErr) {
      logger.error('[Admin Student PATCH] Lookup error:', beforeErr);
      return NextResponse.json({ error: '학생 조회에 실패했습니다.' }, { status: 500 });
    }
    if (!beforeData) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }
    const beforeRec = beforeData as unknown as Record<string, unknown>;

    const { data: updated, error: updateErr } = await supabase
      .from('students')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(STUDENT_COLUMNS)
      .single();

    if (updateErr) {
      logger.error('[Admin Student PATCH] Update error:', updateErr);
      return NextResponse.json({ error: '학생 수정에 실패했습니다.' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 변경된 키만 감사 로그에 기록
    const changedKeys = Object.keys(patch).filter((k) => {
      const prev = beforeRec[k];
      const prevNorm = k === 'sync_exempt_until' && typeof prev === 'string' ? prev.slice(0, 10) : prev;
      return prevNorm !== patch[k];
    });

    if (changedKeys.length > 0) {
      const oldValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      changedKeys.forEach((k) => {
        oldValues[k] = beforeRec[k];
        newValues[k] = patch[k];
      });

      let action: AdminAction;
      if (changedKeys.includes('is_active')) action = 'STUDENT_TOGGLE';
      else if (changedKeys.some((k) => EXEMPT_KEYS.includes(k))) action = 'STUDENT_EXEMPT_SET';
      else if (changedKeys.length === 1 && changedKeys[0] === 'admin_note') action = 'STUDENT_NOTE_UPDATE';
      else action = 'STUDENT_UPDATE';

      await logAdminAction({
        actor: getAdminActor(request),
        action,
        resource_type: 'student',
        resource_id: id,
        old_values: oldValues,
        new_values: newValues,
        request,
      });
    }

    return NextResponse.json({ student: updated });
  } catch (error) {
    logger.error('[Admin Student PATCH] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
