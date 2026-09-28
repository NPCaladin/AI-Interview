/**
 * 어드민 목록 쿼리 공용 헬퍼 (서버 전용)
 * - 감사 로그 목록(/api/admin/audit)과 CSV 내보내기(/api/admin/export)가 같은 필터 로직을 쓴다.
 * - sessions / students 필터는 각 목록 API(app/api/admin/sessions, app/api/admin/students)의
 *   GET 필터를 그대로 미러링한다(해당 라우트는 수정하지 않음 — 변경 시 함께 맞출 것).
 */
import { supabase } from '@/lib/supabase';
import type { AdminAction } from '@/lib/adminAudit';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Record 로 선언해 AdminAction 추가 시 여기 누락이 컴파일 에러로 드러나게 한다
const ADMIN_ACTION_MAP: Record<AdminAction, true> = {
  ADMIN_LOGIN: true,
  STUDENT_CREATE: true,
  STUDENT_UPDATE: true,
  STUDENT_TOGGLE: true,
  STUDENT_DELETE: true,
  STUDENT_RESET_USAGE: true,
  STUDENT_EXEMPT_SET: true,
  STUDENT_NOTE_UPDATE: true,
  QUEUE_APPROVE: true,
  QUEUE_REJECT: true,
  QUEUE_MERGE: true,
  QUEUE_BULK_APPROVE: true,
  QUEUE_ELIGIBILITY_CHECK: true,
  SYNC_TRIGGER: true,
  QUESTION_CREATE: true,
  QUESTION_UPDATE: true,
  QUESTION_DELETE: true,
  QUESTION_RESTORE: true,
  QUESTION_BULK_CREATE: true,
  JOB_KEYWORDS_UPDATE: true,
  CRITERIA_UPDATE: true,
  PROMPT_UPDATE: true,
  PROMPT_ROLLBACK: true,
  PROMPT_RESET_DEFAULT: true,
};

export const ADMIN_ACTIONS = Object.keys(ADMIN_ACTION_MAP) as AdminAction[];

export function isAdminAction(v: string): v is AdminAction {
  return Object.prototype.hasOwnProperty.call(ADMIN_ACTION_MAP, v);
}

export function escapeIlike(s: string): string {
  return s.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
}

/** 'YYYY-MM-DD' (KST 달력 날짜) → 달력 연산용 UTC 00:00 ms. 잘못된 날짜면 null */
export function parseYmd(s: string): number | null {
  if (!DATE_RE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  if (new Date(ms).toISOString().slice(0, 10) !== s) return null;
  return ms;
}

/** KST 달력 날짜의 00:00 KST → ISO 타임스탬프 */
export function kstMidnightIso(dayMs: number): string {
  return new Date(dayMs - KST_OFFSET_MS).toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO → 'YYYY-MM-DD HH:mm:ss' (KST). null/잘못된 값 → '' */
export function formatKstForCsv(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms + KST_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/** 현재 KST 날짜 'yyyyMMdd' (파일명용) */
export function kstYmdCompact(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ─────────────────────────────────────────────
// 감사 로그
// ─────────────────────────────────────────────

export const AUDIT_COLUMNS =
  'id, actor, action, resource_type, resource_id, old_values, new_values, details, ip_address, created_at';

export interface AuditFilters {
  action: AdminAction | null;
  actor: string;
  resourceType: string;
  resourceId: string;
  fromIso: string | null; // inclusive (시작일 00:00 KST)
  toIso: string | null; // exclusive (종료일 다음날 00:00 KST)
}

export function parseAuditFilters(sp: URLSearchParams): ParseResult<AuditFilters> {
  const actionRaw = (sp.get('action') || '').trim();
  let action: AdminAction | null = null;
  if (actionRaw) {
    if (!isAdminAction(actionRaw)) return { ok: false, error: '지원하지 않는 action 값입니다.' };
    action = actionRaw;
  }

  const actor = (sp.get('actor') || '').trim();
  if (actor.length > 50) return { ok: false, error: 'actor 는 50자 이내여야 합니다.' };

  const resourceType = (sp.get('resource_type') || '').trim();
  if (resourceType && !/^[a-z_]{1,30}$/.test(resourceType)) {
    return { ok: false, error: '잘못된 resource_type 값입니다.' };
  }

  const resourceId = (sp.get('resource_id') || '').trim();
  if (resourceId.length > 100) return { ok: false, error: 'resource_id 는 100자 이내여야 합니다.' };

  const fromRaw = (sp.get('from') || '').trim();
  const toRaw = (sp.get('to') || '').trim();
  const fromDay = fromRaw ? parseYmd(fromRaw) : null;
  const toDay = toRaw ? parseYmd(toRaw) : null;
  if ((fromRaw && fromDay === null) || (toRaw && toDay === null)) {
    return { ok: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }
  if (fromDay !== null && toDay !== null && fromDay > toDay) {
    return { ok: false, error: '시작일이 종료일보다 늦습니다.' };
  }

  return {
    ok: true,
    value: {
      action,
      actor,
      resourceType,
      resourceId,
      fromIso: fromDay !== null ? kstMidnightIso(fromDay) : null,
      toIso: toDay !== null ? kstMidnightIso(toDay + DAY_MS) : null,
    },
  };
}

export function buildAuditQuery(f: AuditFilters, withCount: boolean) {
  let q = supabase
    .from('admin_audit_log')
    .select(AUDIT_COLUMNS, withCount ? { count: 'exact' } : undefined);
  if (f.action) q = q.eq('action', f.action);
  if (f.actor) q = q.ilike('actor', `%${escapeIlike(f.actor)}%`);
  if (f.resourceType) q = q.eq('resource_type', f.resourceType);
  if (f.resourceId) q = q.eq('resource_id', f.resourceId);
  if (f.fromIso) q = q.gte('created_at', f.fromIso);
  if (f.toIso) q = q.lt('created_at', f.toIso);
  return q.order('created_at', { ascending: false });
}

// ─────────────────────────────────────────────
// 학생 (app/api/admin/students GET 미러)
// ─────────────────────────────────────────────

export const STUDENT_EXPORT_COLUMNS =
  'id, code, name, is_active, weekly_limit, sync_exempt, sync_exempt_until, source, created_at';

const STUDENT_FILTERS = ['all', 'active', 'inactive', 'exempt'] as const;
type StudentFilter = (typeof STUDENT_FILTERS)[number];

export interface StudentFilters {
  search: string;
  filter: StudentFilter;
}

export function parseStudentFilters(sp: URLSearchParams): ParseResult<StudentFilters> {
  const rawFilter = sp.get('filter') || 'all';
  if (!(STUDENT_FILTERS as readonly string[]).includes(rawFilter)) {
    return { ok: false, error: '지원하지 않는 filter 값입니다.' };
  }
  return {
    ok: true,
    value: { search: (sp.get('search') || '').trim(), filter: rawFilter as StudentFilter },
  };
}

export function buildStudentExportQuery(f: StudentFilters, withCount: boolean) {
  let q = supabase
    .from('students')
    .select(STUDENT_EXPORT_COLUMNS, withCount ? { count: 'exact' } : undefined);
  if (f.filter === 'active') q = q.eq('is_active', true);
  else if (f.filter === 'inactive') q = q.eq('is_active', false);
  else if (f.filter === 'exempt') q = q.eq('sync_exempt', true);
  if (f.search) {
    const safe = escapeIlike(f.search);
    q = q.or(`code.ilike.%${safe}%,name.ilike.%${safe}%`);
  }
  return q.order('created_at', { ascending: false });
}

// ─────────────────────────────────────────────
// 세션 (app/api/admin/sessions GET 미러)
// ─────────────────────────────────────────────

const ABANDON_MS = 2 * 60 * 60 * 1000;
const SESSION_STATUS_FILTERS = ['in_progress', 'ended', 'analyzed', 'abandoned'] as const;
type SessionStatusFilter = (typeof SESSION_STATUS_FILTERS)[number];

export const SESSION_EXPORT_COLUMNS =
  'id, started_at, student_code, student_name, job_name, company_name, status, last_activity_at, ' +
  'question_count, total_score, pass_prediction, chat_prompt_tokens, chat_completion_tokens, ' +
  'analysis_prompt_tokens, analysis_completion_tokens, model, is_dev';

export interface SessionFilters {
  search: string;
  job: string;
  company: string;
  status: SessionStatusFilter | null;
  minScore: number | null;
  maxScore: number | null;
  fromIso: string | null;
  toIso: string | null;
  includeDev: boolean;
}

function parseScore(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function parseDate(v: string | null): string | null {
  if (!v || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseSessionFilters(sp: URLSearchParams): ParseResult<SessionFilters> {
  const statusRaw = (sp.get('status') || '').trim();
  return {
    ok: true,
    value: {
      search: (sp.get('search') || '').trim(),
      job: (sp.get('job') || '').trim(),
      company: (sp.get('company') || '').trim(),
      status: (SESSION_STATUS_FILTERS as readonly string[]).includes(statusRaw)
        ? (statusRaw as SessionStatusFilter)
        : null,
      minScore: parseScore(sp.get('minScore')),
      maxScore: parseScore(sp.get('maxScore')),
      fromIso: parseDate(sp.get('from')),
      toIso: parseDate(sp.get('to')),
      includeDev: sp.get('includeDev') === '1',
    },
  };
}

/** '중단' 경계 시각 — 페이지 반복 동안 같은 값을 써야 결과가 흔들리지 않는다 */
export function sessionStaleIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - ABANDON_MS).toISOString();
}

export function buildSessionExportQuery(f: SessionFilters, staleIso: string, withCount: boolean) {
  let q = supabase
    .from('interview_sessions')
    .select(SESSION_EXPORT_COLUMNS, withCount ? { count: 'exact' } : undefined);
  if (!f.includeDev) q = q.eq('is_dev', false);
  if (f.job) q = q.eq('job_name', f.job);
  if (f.company) q = q.eq('company_name', f.company);
  if (f.status === 'abandoned') {
    q = q.eq('status', 'in_progress').lt('last_activity_at', staleIso);
  } else if (f.status === 'in_progress') {
    q = q.eq('status', 'in_progress').gte('last_activity_at', staleIso);
  } else if (f.status) {
    q = q.eq('status', f.status);
  }
  if (f.minScore !== null) q = q.gte('total_score', f.minScore);
  if (f.maxScore !== null) q = q.lte('total_score', f.maxScore);
  if (f.fromIso) q = q.gte('started_at', f.fromIso);
  if (f.toIso) q = q.lte('started_at', f.toIso);
  if (f.search) {
    const safe = escapeIlike(f.search);
    q = q.or(`student_code.ilike.%${safe}%,student_name.ilike.%${safe}%`);
  }
  return q.order('started_at', { ascending: false });
}
