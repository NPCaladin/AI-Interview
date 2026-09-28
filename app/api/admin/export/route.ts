/**
 * CSV 내보내기 API
 * GET /api/admin/export?type=students|sessions|audit&<해당 목록 필터 파라미터>
 *  - students: search, filter (= /api/admin/students)
 *  - sessions: search, job, company, status, minScore, maxScore, from, to, includeDev (= /api/admin/sessions)
 *  - audit:    action, actor, resource_type, resource_id, from, to (= /api/admin/audit)
 *  - 최대 5,000행. 초과 시 400. PostgREST 1000행 캡 회피를 위해 1000 단위 .range() 반복
 *  - 읽기 전용 → 감사 로그 남기지 않음
 * 권한: middleware 의 /api/admin/* 보호 (쿠키 인증 → 브라우저 이동으로 다운로드)
 */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { toCsv, type CsvColumn } from '@/lib/csv';
import {
  buildAuditQuery,
  buildSessionExportQuery,
  buildStudentExportQuery,
  formatKstForCsv,
  kstYmdCompact,
  parseAuditFilters,
  parseSessionFilters,
  parseStudentFilters,
  sessionStaleIso,
} from '@/lib/adminListQueries';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 5000;
const CHUNK = 1000;
const TOO_MANY = '5,000행을 초과합니다. 기간/필터를 좁혀 주세요.';

type ExportType = 'students' | 'sessions' | 'audit';
const EXPORT_TYPES: readonly ExportType[] = ['students', 'sessions', 'audit'];

interface ChunkResult {
  data: unknown[] | null;
  error: { message: string } | null;
  count: number | null;
}

type FetchChunk = (from: number, to: number, withCount: boolean) => PromiseLike<ChunkResult>;

class TooManyRowsError extends Error {}

/** 첫 청크에서 count 를 확인해 5,000 초과면 즉시 중단, 아니면 1000 단위로 끝까지 읽는다 */
async function fetchAll(fetchChunk: FetchChunk): Promise<unknown[]> {
  const first = await fetchChunk(0, CHUNK - 1, true);
  if (first.error) throw new Error(first.error.message);
  const total = first.count ?? 0;
  if (total > MAX_ROWS) throw new TooManyRowsError(TOO_MANY);

  const rows: unknown[] = [...(first.data ?? [])];
  let offset = rows.length;
  while (offset < total && offset < MAX_ROWS) {
    const next = await fetchChunk(offset, Math.min(offset + CHUNK, MAX_ROWS) - 1, false);
    if (next.error) throw new Error(next.error.message);
    const chunk = next.data ?? [];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    offset += chunk.length;
  }
  return rows.slice(0, MAX_ROWS);
}

interface StudentExportRow {
  code: string;
  name: string;
  is_active: boolean;
  weekly_limit: number;
  sync_exempt: boolean | null;
  sync_exempt_until: string | null;
  source: string | null;
  created_at: string;
}

interface SessionExportRow {
  started_at: string;
  student_code: string;
  student_name: string | null;
  job_name: string;
  company_name: string | null;
  status: string;
  question_count: number | null;
  total_score: number | null;
  pass_prediction: string | null;
  chat_prompt_tokens: number | null;
  chat_completion_tokens: number | null;
  analysis_prompt_tokens: number | null;
  analysis_completion_tokens: number | null;
  model: string | null;
  is_dev: boolean;
}

interface AuditExportRow {
  created_at: string;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: unknown;
}

const STUDENT_COLUMNS: CsvColumn<StudentExportRow>[] = [
  { key: 'code', header: 'code' },
  { key: 'name', header: 'name' },
  { key: 'is_active', header: 'is_active' },
  { key: 'weekly_limit', header: 'weekly_limit' },
  { key: 'sync_exempt', header: 'sync_exempt' },
  { key: 'sync_exempt_until', header: 'sync_exempt_until' },
  { key: 'source', header: 'source' },
  { key: 'created_at', header: 'created_at (KST)', format: (r) => formatKstForCsv(r.created_at) },
];

const SESSION_COLUMNS: CsvColumn<SessionExportRow>[] = [
  { key: 'started_at', header: 'started_at (KST)', format: (r) => formatKstForCsv(r.started_at) },
  { key: 'student_code', header: 'student_code' },
  { key: 'student_name', header: 'student_name' },
  { key: 'job_name', header: 'job_name' },
  { key: 'company_name', header: 'company_name' },
  { key: 'status', header: 'status' },
  { key: 'question_count', header: 'question_count' },
  { key: 'total_score', header: 'total_score' },
  { key: 'pass_prediction', header: 'pass_prediction' },
  {
    key: 'tokens',
    header: 'tokens',
    format: (r) =>
      (r.chat_prompt_tokens ?? 0) +
      (r.chat_completion_tokens ?? 0) +
      (r.analysis_prompt_tokens ?? 0) +
      (r.analysis_completion_tokens ?? 0),
  },
  { key: 'model', header: 'model' },
  { key: 'is_dev', header: 'is_dev' },
];

const AUDIT_COLUMNS: CsvColumn<AuditExportRow>[] = [
  { key: 'created_at', header: 'created_at (KST)', format: (r) => formatKstForCsv(r.created_at) },
  { key: 'actor', header: 'actor' },
  { key: 'action', header: 'action' },
  { key: 'resource_type', header: 'resource_type' },
  { key: 'resource_id', header: 'resource_id' },
  {
    key: 'details',
    header: 'details',
    format: (r) => (r.details === null || r.details === undefined ? null : JSON.stringify(r.details)),
  },
];

function csvResponse(type: ExportType, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}_${kstYmdCompact()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const typeRaw = (searchParams.get('type') || '').trim();
    if (!(EXPORT_TYPES as readonly string[]).includes(typeRaw)) {
      return NextResponse.json({ error: 'type 은 students|sessions|audit 중 하나여야 합니다.' }, { status: 400 });
    }
    const type = typeRaw as ExportType;

    if (type === 'students') {
      const parsed = parseStudentFilters(searchParams);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const rows = await fetchAll((from, to, withCount) =>
        buildStudentExportQuery(parsed.value, withCount).range(from, to),
      );
      return csvResponse(type, toCsv(rows as StudentExportRow[], STUDENT_COLUMNS));
    }

    if (type === 'sessions') {
      const parsed = parseSessionFilters(searchParams);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const staleIso = sessionStaleIso();
      const rows = await fetchAll((from, to, withCount) =>
        buildSessionExportQuery(parsed.value, staleIso, withCount).range(from, to),
      );
      return csvResponse(type, toCsv(rows as SessionExportRow[], SESSION_COLUMNS));
    }

    const parsed = parseAuditFilters(searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const rows = await fetchAll((from, to, withCount) => buildAuditQuery(parsed.value, withCount).range(from, to));
    return csvResponse(type, toCsv(rows as AuditExportRow[], AUDIT_COLUMNS));
  } catch (e) {
    if (e instanceof TooManyRowsError) {
      return NextResponse.json({ error: TOO_MANY }, { status: 400 });
    }
    logger.error('[Admin Export GET] Error:', e);
    return NextResponse.json({ error: 'CSV 내보내기에 실패했습니다.' }, { status: 500 });
  }
}
