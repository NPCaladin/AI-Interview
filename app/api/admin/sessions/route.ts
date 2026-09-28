import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const ABANDON_MS = 2 * 60 * 60 * 1000; // 마지막 활동 2시간 경과 시 '중단'
const STATUS_FILTERS = ['in_progress', 'ended', 'analyzed', 'abandoned'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// report(jsonb 전체)는 절대 select 하지 않는다 — 목록 응답 경량화
const LIST_COLUMNS =
  'id, student_id, student_code, student_name, job_name, company_name, status, question_count, ' +
  'started_at, last_activity_at, ended_at, analysis_completed_at, total_score, pass_prediction, ' +
  'summary_title, analyzed_questions, report_version, chat_prompt_tokens, chat_completion_tokens, ' +
  'analysis_prompt_tokens, analysis_completion_tokens, model, is_dev';

interface SessionListRow {
  id: string;
  status: 'in_progress' | 'ended' | 'analyzed';
  last_activity_at: string | null;
  [key: string]: unknown;
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

// GET /api/admin/sessions — 면접 세션 목록 (서버 페이지네이션 + 필터)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const search = (searchParams.get('search') || '').trim();
    const job = (searchParams.get('job') || '').trim();
    const company = (searchParams.get('company') || '').trim();
    const statusRaw = (searchParams.get('status') || '').trim();
    const status = (STATUS_FILTERS as readonly string[]).includes(statusRaw)
      ? (statusRaw as StatusFilter)
      : null;
    const minScore = parseScore(searchParams.get('minScore'));
    const maxScore = parseScore(searchParams.get('maxScore'));
    const from = parseDate(searchParams.get('from'));
    const to = parseDate(searchParams.get('to'));
    const includeDev = searchParams.get('includeDev') === '1';
    const offset = (page - 1) * limit;

    const nowMs = Date.now();
    const staleMs = nowMs - ABANDON_MS;
    const staleIso = new Date(staleMs).toISOString();

    let query = supabase.from('interview_sessions').select(LIST_COLUMNS, { count: 'exact' });

    if (!includeDev) query = query.eq('is_dev', false);
    if (job) query = query.eq('job_name', job);
    if (company) query = query.eq('company_name', company);

    if (status === 'abandoned') {
      query = query.eq('status', 'in_progress').lt('last_activity_at', staleIso);
    } else if (status === 'in_progress') {
      query = query.eq('status', 'in_progress').gte('last_activity_at', staleIso);
    } else if (status) {
      query = query.eq('status', status);
    }

    if (minScore !== null) query = query.gte('total_score', minScore);
    if (maxScore !== null) query = query.lte('total_score', maxScore);
    if (from) query = query.gte('started_at', from);
    if (to) query = query.lte('started_at', to);

    // 검색 (student_code 또는 student_name) — PostgREST 특수문자 이스케이프
    if (search) {
      const safe = search.replace(/[%_\\,().*]/g, (c) => `\\${c}`);
      query = query.or(`student_code.ilike.%${safe}%,student_name.ilike.%${safe}%`);
    }

    query = query.order('started_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[Admin Sessions GET] Query error:', error);
      return NextResponse.json({ error: '세션 목록 조회 실패' }, { status: 500 });
    }

    const rows = (data || []) as unknown as SessionListRow[];
    const items = rows.map((r) => {
      const last = r.last_activity_at ? Date.parse(r.last_activity_at) : NaN;
      const abandoned = r.status === 'in_progress' && Number.isFinite(last) && last < staleMs;
      return { ...r, display_status: abandoned ? 'abandoned' : r.status };
    });

    return NextResponse.json({ items, total: count || 0, page, limit });
  } catch (error) {
    logger.error('[Admin Sessions GET] Error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
