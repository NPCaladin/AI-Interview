/**
 * ERP → 면접앱 students 동기화 코어
 * - 재활성화 절대 자동 반영 금지 (pending_reactivations 큐로만)
 * - is_active true→false 는 즉시 반영
 * - 신규 is_active=true 는 students 는 is_active=false 로 저장 + 큐 적재(case1)
 * - 15분 stale 판정으로 좀비 run 강제 인수
 * - dry-run 모드: 실제 DB 변경 없이 집계만
 *
 * 참조: docs/ERP_연동_합의서_최종.md §5-1, §6-2
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fetchErpStudents, ErpFetchError } from '@/lib/erp/client';
import { validateStudentPayload, type ErpStudentPayload } from '@/lib/erp/validation';

const STALE_RUN_MS = 15 * 60 * 1000;
const DEFAULT_INITIAL_UPDATED_AFTER = '2020-01-01T00:00:00+09:00';
const BATCH_SIZE = 500;

export interface RunErpPullParams {
  dryRun?: boolean;
  maxPages?: number;
  initialUpdatedAfter?: string;
  source?: 'erp_sync' | 'erp_migration'; // 초기 이관은 'erp_migration'
}

export interface RunErpPullResult {
  skipped?: boolean;
  reason?: string;
  runId?: string;
  dryRun: boolean;
  pagesFetched: number;
  upserted: number;
  queued: number;
  deactivated: number;
  errors: string[];
  finalCursor?: string | null;
  finalUpdatedAt?: string | null;
}

interface SyncStateRow {
  id: number;
  last_updated_at: string | null;
  last_cursor: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  is_running: boolean;
  started_at: string | null;
}

interface ExistingStudent {
  id: string;
  code: string;
  is_active: boolean;
}

/**
 * 원자적 run 잠금 획득 (또는 stale 강제 인수)
 */
async function acquireRunLock(): Promise<{ acquired: true } | { acquired: false; reason: string }> {
  const nowIso = new Date().toISOString();

  // 1) 현재 상태 조회
  const { data: current, error: selErr } = await supabase
    .from('erp_sync_state')
    .select('id, last_updated_at, last_cursor, last_run_at, last_success_at, is_running, started_at')
    .eq('id', 1)
    .maybeSingle();

  if (selErr) {
    logger.error('[ERP Sync] state select error:', selErr);
    return { acquired: false, reason: `state select error: ${selErr.message}` };
  }

  if (!current) {
    // 초기 insert (마이그레이션 누락 대비)
    const { error: insErr } = await supabase
      .from('erp_sync_state')
      .insert({ id: 1, is_running: true, started_at: nowIso, last_run_at: nowIso });
    if (insErr) {
      return { acquired: false, reason: `state init error: ${insErr.message}` };
    }
    return { acquired: true };
  }

  const row = current as SyncStateRow;

  if (row.is_running) {
    // stale 판정
    const startedMs = row.started_at ? Date.parse(row.started_at) : 0;
    const age = Date.now() - startedMs;
    if (age < STALE_RUN_MS) {
      return {
        acquired: false,
        reason: `another run in progress (started_at=${row.started_at}, age=${Math.round(age / 1000)}s)`,
      };
    }
    logger.warn(`[ERP Sync] Stale run detected (age=${Math.round(age / 1000)}s), forcing takeover`);
  }

  // 조건부 업데이트 (낙관적 잠금)
  const { error: updErr, data: updated } = await supabase
    .from('erp_sync_state')
    .update({ is_running: true, started_at: nowIso, last_run_at: nowIso })
    .eq('id', 1)
    .eq('is_running', row.is_running)
    .select('id')
    .maybeSingle();

  if (updErr || !updated) {
    return {
      acquired: false,
      reason: `state lock race lost: ${updErr?.message ?? 'no row updated'}`,
    };
  }

  return { acquired: true };
}

async function releaseRunLock(): Promise<void> {
  const { error } = await supabase
    .from('erp_sync_state')
    .update({ is_running: false })
    .eq('id', 1);
  if (error) {
    logger.error('[ERP Sync] Failed to release lock:', error);
  }
}

async function loadSyncState(): Promise<SyncStateRow | null> {
  const { data, error } = await supabase
    .from('erp_sync_state')
    .select('id, last_updated_at, last_cursor, last_run_at, last_success_at, is_running, started_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    logger.error('[ERP Sync] loadSyncState error:', error);
    return null;
  }
  return (data as SyncStateRow) ?? null;
}

async function createRun(dryRun: boolean): Promise<string> {
  const { data, error } = await supabase
    .from('erp_sync_runs')
    .insert({
      started_at: new Date().toISOString(),
      status: 'running',
      dry_run: dryRun,
    })
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`erp_sync_runs insert failed: ${error?.message ?? 'no row'}`);
  }
  return (data as { id: string }).id;
}

async function finalizeRun(
  runId: string,
  patch: {
    status: 'success' | 'failed' | 'partial';
    pages_fetched: number;
    records_upserted: number;
    records_queued: number;
    error_code?: string | null;
    error_snippet?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('erp_sync_runs')
    .update({
      finished_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', runId);
  if (error) {
    logger.error('[ERP Sync] finalizeRun error:', error);
  }
}

/**
 * 현재 페이지의 기존 students 조회 (code → row)
 */
async function loadExistingByCode(codes: string[]): Promise<Map<string, ExistingStudent>> {
  const map = new Map<string, ExistingStudent>();
  if (codes.length === 0) return map;

  // chunked IN query (supabase 기본 1000 제한 여유)
  const CHUNK = 500;
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('students')
      .select('id, code, is_active')
      .in('code', chunk);
    if (error) {
      logger.error('[ERP Sync] loadExistingByCode error:', error);
      throw new Error(`students lookup failed: ${error.message}`);
    }
    (data || []).forEach((row) => {
      const r = row as ExistingStudent;
      map.set(r.code, r);
    });
  }
  return map;
}

interface PageBuckets {
  // 신규 + active=true: students (is_active=false) insert + case1 큐
  newActive: ErpStudentPayload[];
  // 신규 + active=false: students (is_active=false) insert
  newInactive: ErpStudentPayload[];
  // 기존 + DB active=false & API active=true: case2 큐만 (students 변경 없음)
  existingReactivation: Array<{ payload: ErpStudentPayload; existing: ExistingStudent }>;
  // 기존 + DB active=true & API active=false: 즉시 비활성화
  existingDeactivation: Array<{ payload: ErpStudentPayload; existing: ExistingStudent }>;
  // 기존 + is_active 동일: name/updated_at만 업데이트
  existingUpdate: Array<{ payload: ErpStudentPayload; existing: ExistingStudent }>;
}

function emptyBuckets(): PageBuckets {
  return {
    newActive: [],
    newInactive: [],
    existingReactivation: [],
    existingDeactivation: [],
    existingUpdate: [],
  };
}

function bucketPayloads(
  payloads: ErpStudentPayload[],
  existingMap: Map<string, ExistingStudent>,
): PageBuckets {
  const b = emptyBuckets();
  for (const p of payloads) {
    const existing = existingMap.get(p.student_code);
    if (!existing) {
      if (p.is_active) b.newActive.push(p);
      else b.newInactive.push(p);
      continue;
    }
    if (existing.is_active === p.is_active) {
      b.existingUpdate.push({ payload: p, existing });
    } else if (existing.is_active === false && p.is_active === true) {
      // 재활성화: 큐 적재만
      b.existingReactivation.push({ payload: p, existing });
    } else {
      // true → false: 즉시 반영
      b.existingDeactivation.push({ payload: p, existing });
    }
  }
  return b;
}

/**
 * 실제 DB 반영 (dry-run 시 no-op)
 */
async function applyBuckets(
  buckets: PageBuckets,
  opts: { dryRun: boolean; source: 'erp_sync' | 'erp_migration' },
): Promise<{ upserted: number; queued: number; deactivated: number; errors: string[] }> {
  const errors: string[] = [];
  let upserted = 0;
  let queued = 0;
  let deactivated = 0;

  const { dryRun, source } = opts;

  // ── 1. newActive: students insert (is_active=false) + case1 큐
  if (buckets.newActive.length > 0) {
    if (!dryRun) {
      const rows = buckets.newActive.map(p => ({
        code: p.student_code,
        name: p.name,
        is_active: false, // 재활성화 승인 대기
        weekly_limit: 5,
        source,
        updated_at: p.updated_at,
      }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('students')
          .upsert(chunk, { onConflict: 'code', ignoreDuplicates: false });
        if (error) {
          errors.push(`newActive upsert chunk ${i / BATCH_SIZE}: ${error.message}`);
        } else {
          upserted += chunk.length;
        }
      }
      // 큐 적재 (중복은 부분 유니크 인덱스가 차단 → onConflict 무시)
      const queueRows = buckets.newActive.map(p => ({
        student_code: p.student_code,
        student_id: null,
        source: 'case1_new_code' as const,
        transition_at: p.updated_at,
      }));
      for (let i = 0; i < queueRows.length; i += BATCH_SIZE) {
        const chunk = queueRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('pending_reactivations').insert(chunk);
        if (error) {
          // 23505 (unique violation) 은 이미 pending 인 경우 → 무시
          if (error.code !== '23505') {
            errors.push(`case1 queue chunk ${i / BATCH_SIZE}: ${error.message}`);
          }
        }
        queued += chunk.length;
      }
    } else {
      upserted += buckets.newActive.length;
      queued += buckets.newActive.length;
    }
  }

  // ── 2. newInactive: students insert (is_active=false)
  if (buckets.newInactive.length > 0) {
    if (!dryRun) {
      const rows = buckets.newInactive.map(p => ({
        code: p.student_code,
        name: p.name,
        is_active: false,
        weekly_limit: 5,
        source,
        updated_at: p.updated_at,
      }));
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('students')
          .upsert(chunk, { onConflict: 'code', ignoreDuplicates: false });
        if (error) {
          errors.push(`newInactive upsert chunk ${i / BATCH_SIZE}: ${error.message}`);
        } else {
          upserted += chunk.length;
        }
      }
    } else {
      upserted += buckets.newInactive.length;
    }
  }

  // ── 3. existingReactivation: case2 큐만 적재 (students 변경 금지)
  if (buckets.existingReactivation.length > 0) {
    if (!dryRun) {
      const queueRows = buckets.existingReactivation.map(x => ({
        student_code: x.payload.student_code,
        student_id: x.existing.id,
        source: 'case2_existing_code' as const,
        transition_at: x.payload.updated_at,
      }));
      for (let i = 0; i < queueRows.length; i += BATCH_SIZE) {
        const chunk = queueRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('pending_reactivations').insert(chunk);
        if (error && error.code !== '23505') {
          errors.push(`case2 queue chunk ${i / BATCH_SIZE}: ${error.message}`);
        }
        queued += chunk.length;
      }
    } else {
      queued += buckets.existingReactivation.length;
    }
  }

  // ── 4. existingDeactivation: 즉시 is_active=false (개별 update — updated_at/name 개별 반영)
  if (buckets.existingDeactivation.length > 0) {
    if (!dryRun) {
      for (const x of buckets.existingDeactivation) {
        const { error } = await supabase
          .from('students')
          .update({
            is_active: false,
            updated_at: x.payload.updated_at,
            name: x.payload.name,
          })
          .eq('id', x.existing.id);
        if (error) {
          errors.push(`deactivate ${x.existing.code}: ${error.message}`);
        } else {
          deactivated += 1;
        }
      }
    } else {
      deactivated += buckets.existingDeactivation.length;
    }
  }

  // ── 5. existingUpdate: name / updated_at 갱신
  if (buckets.existingUpdate.length > 0) {
    if (!dryRun) {
      for (const x of buckets.existingUpdate) {
        const { error } = await supabase
          .from('students')
          .update({
            name: x.payload.name,
            updated_at: x.payload.updated_at,
          })
          .eq('id', x.existing.id);
        if (error) {
          errors.push(`update ${x.existing.code}: ${error.message}`);
        } else {
          upserted += 1;
        }
      }
    } else {
      upserted += buckets.existingUpdate.length;
    }
  }

  return { upserted, queued, deactivated, errors };
}

/**
 * 엔트리 — ERP pull 전체 실행
 */
export async function runErpPull(params: RunErpPullParams = {}): Promise<RunErpPullResult> {
  const dryRun = params.dryRun === true;
  const maxPages = Math.max(1, params.maxPages ?? parseInt(process.env.ERP_MAX_PAGES_PER_RUN || '10'));
  const source: 'erp_sync' | 'erp_migration' = params.source ?? 'erp_sync';
  const initialUpdatedAfter =
    params.initialUpdatedAfter
    ?? process.env.ERP_INITIAL_UPDATED_AFTER
    ?? DEFAULT_INITIAL_UPDATED_AFTER;

  // 1) 잠금 획득
  const lock = await acquireRunLock();
  if (!lock.acquired) {
    logger.warn(`[ERP Sync] Skip: ${lock.reason}`);
    return {
      skipped: true,
      reason: lock.reason,
      dryRun,
      pagesFetched: 0,
      upserted: 0,
      queued: 0,
      deactivated: 0,
      errors: [],
    };
  }

  let runId: string | null = null;
  let pagesFetched = 0;
  let totalUpserted = 0;
  let totalQueued = 0;
  let totalDeactivated = 0;
  const collectedErrors: string[] = [];
  let finalCursor: string | null = null;
  let finalUpdatedAt: string | null = null;
  let finalStatus: 'success' | 'failed' | 'partial' = 'success';
  let errorCode: string | null = null;
  let errorSnippet: string | null = null;

  try {
    runId = await createRun(dryRun);

    const state = await loadSyncState();
    const startCursor = state?.last_cursor ?? null;
    const startUpdatedAfter = state?.last_updated_at ?? initialUpdatedAfter;

    let cursor: string | null = startCursor;
    // cursor 가 있으면 updated_after 무시, 없으면 updated_after 사용
    let updatedAfter: string | undefined = cursor ? undefined : startUpdatedAfter;

    // [DEBUG 2026-04-22] Codex 제안 진단 RPC 호출 — Vercel 실제 DB role 확인
    try {
      const { data: ctx, error: ctxErr } = await supabase.rpc('debug_request_context');
      logger.warn(`[ERP Sync][DEBUG] request context:`, {
        rpc_result: ctx,
        rpc_error: ctxErr,
      });
    } catch (e) {
      logger.warn(`[ERP Sync][DEBUG] rpc exception:`, (e as Error).message);
    }

    // [DEBUG 2026-04-22] env 지문 + 테이블 카운트 — Vercel이 같은 DB/같은 행 보는지 증명
    try {
      const url = process.env.SUPABASE_URL || '';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const urlHost = url.replace(/^https?:\/\//, '').split('.')[0];
      const keyHint = key.length > 10
        ? `${key.slice(0, 14)}...${key.slice(-4)} (len=${key.length})`
        : `short (len=${key.length})`;
      const { count: stateCount } = await supabase
        .from('erp_sync_state')
        .select('*', { count: 'exact', head: true });
      const { count: runsCount } = await supabase
        .from('erp_sync_runs')
        .select('*', { count: 'exact', head: true });
      const { count: studentsCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });
      logger.warn(`[ERP Sync][DEBUG] env + table counts:`, {
        url_host_prefix: urlHost,
        service_key_hint: keyHint,
        erp_sync_state_rows: stateCount,
        erp_sync_runs_rows: runsCount,
        students_rows: studentsCount,
      });
    } catch (e) {
      logger.warn(`[ERP Sync][DEBUG] env exception:`, (e as Error).message);
    }

    // [DEBUG 2026-04-22] delta 동작 이상 진단용 — state/URL 실제 값 노출
    logger.warn(`[ERP Sync][DEBUG] state raw:`, {
      state_last_updated_at: state?.last_updated_at,
      state_last_cursor: state?.last_cursor,
      state_type_last_updated_at: typeof state?.last_updated_at,
      state_full: JSON.stringify(state),
      initialUpdatedAfter,
      computed_startUpdatedAfter: startUpdatedAfter,
      computed_updatedAfter: updatedAfter,
      computed_cursor: cursor,
    });

    logger.info(`[ERP Sync] Start (dryRun=${dryRun}, maxPages=${maxPages}, source=${source})`, {
      cursor: cursor ? 'resume' : null,
      updated_after: updatedAfter,
    });

    for (let page = 0; page < maxPages; page++) {
      let pageRes;
      try {
        pageRes = await fetchErpStudents({
          updatedAfter,
          cursor: cursor ?? undefined,
          limit: 500,
        });
      } catch (e) {
        if (e instanceof ErpFetchError) {
          errorCode = e.code;
          errorSnippet = (e.bodySnippet ?? e.message).slice(0, 200);
        } else {
          errorCode = 'UNKNOWN';
          errorSnippet = ((e as Error).message ?? 'unknown').slice(0, 200);
        }
        collectedErrors.push(`page ${page}: ${errorSnippet}`);
        finalStatus = 'failed';
        break;
      }

      pagesFetched += 1;
      updatedAfter = undefined; // 이후 페이지는 cursor 만 사용

      // validation
      const validPayloads: ErpStudentPayload[] = [];
      for (const raw of pageRes.students) {
        const v = validateStudentPayload(raw);
        if (v.valid) {
          validPayloads.push(v.value);
        } else {
          collectedErrors.push(`validation: ${v.errors.join('; ')}`);
          finalStatus = 'partial';
        }
      }

      if (validPayloads.length > 0) {
        const codes = validPayloads.map(p => p.student_code);
        let existingMap: Map<string, ExistingStudent>;
        try {
          existingMap = await loadExistingByCode(codes);
        } catch (e) {
          collectedErrors.push(`existing lookup: ${(e as Error).message}`);
          finalStatus = 'failed';
          errorCode = errorCode ?? 'DB_LOOKUP';
          errorSnippet = errorSnippet ?? (e as Error).message.slice(0, 200);
          break;
        }

        const buckets = bucketPayloads(validPayloads, existingMap);
        const applied = await applyBuckets(buckets, { dryRun, source });
        totalUpserted += applied.upserted;
        totalQueued += applied.queued;
        totalDeactivated += applied.deactivated;
        if (applied.errors.length > 0) {
          collectedErrors.push(...applied.errors);
          finalStatus = finalStatus === 'failed' ? 'failed' : 'partial';
        }

        // 마지막 레코드 updated_at 추적 (정렬: updated_at ASC)
        const lastPayload = validPayloads[validPayloads.length - 1];
        if (lastPayload) {
          finalUpdatedAt = lastPayload.updated_at;
        }
      }

      // 페이지네이션
      finalCursor = pageRes.next_cursor;
      cursor = pageRes.next_cursor;
      if (!cursor) {
        logger.info(`[ERP Sync] next_cursor=null, finished at page ${page + 1}`);
        break;
      }
    }

    // 2) 상태 업데이트 (성공 / partial 시)
    if (!dryRun && (finalStatus === 'success' || finalStatus === 'partial')) {
      const statePatch: Record<string, unknown> = {
        last_success_at: new Date().toISOString(),
      };
      // cursor 가 남아있으면 이어받기 위해 저장, null 이면 초기화하고 last_updated_at 전진
      if (finalCursor) {
        statePatch.last_cursor = finalCursor;
      } else {
        statePatch.last_cursor = null;
        if (finalUpdatedAt) {
          statePatch.last_updated_at = finalUpdatedAt;
        }
      }
      const { error } = await supabase.from('erp_sync_state').update(statePatch).eq('id', 1);
      if (error) {
        logger.error('[ERP Sync] state update error:', error);
        collectedErrors.push(`state update: ${error.message}`);
      }
    }

    return {
      runId,
      dryRun,
      pagesFetched,
      upserted: totalUpserted,
      queued: totalQueued,
      deactivated: totalDeactivated,
      errors: collectedErrors,
      finalCursor,
      finalUpdatedAt,
    };
  } catch (e) {
    finalStatus = 'failed';
    errorCode = errorCode ?? 'UNCAUGHT';
    errorSnippet = errorSnippet ?? ((e as Error).message ?? 'unknown').slice(0, 200);
    collectedErrors.push(`uncaught: ${errorSnippet}`);
    logger.error('[ERP Sync] Uncaught error:', e);
    return {
      runId: runId ?? undefined,
      dryRun,
      pagesFetched,
      upserted: totalUpserted,
      queued: totalQueued,
      deactivated: totalDeactivated,
      errors: collectedErrors,
      finalCursor,
      finalUpdatedAt,
    };
  } finally {
    // 3) 잠금 해제 + run 마감 (항상)
    await releaseRunLock();
    if (runId) {
      await finalizeRun(runId, {
        status: finalStatus,
        pages_fetched: pagesFetched,
        records_upserted: totalUpserted,
        records_queued: totalQueued,
        error_code: errorCode,
        error_snippet: errorSnippet,
      });
    }
  }
}
