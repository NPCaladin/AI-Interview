/**
 * ERP → 면접앱 students 동기화 코어
 * - 재활성화 절대 자동 반영 금지 (pending_reactivations 큐로만)
 * - is_active true→false 는 즉시 반영 (단, students.sync_exempt=true 면 skip)
 * - 신규 is_active=true 는 students 는 is_active=false 로 저장 + 큐 적재(case1)
 * - 5분 stale 판정으로 좀비 run 강제 인수 (인수 시 방치된 run 은 failed 로 마감)
 * - 시간 예산 초과 시 스스로 루프를 중단하고 partial 로 마감 → 다음 실행이 cursor 로 재개
 * - dry-run 모드: 실제 DB 변경 없이 집계만
 *
 * 참조: docs/ERP_연동_합의서_최종.md §5-1, §6-2
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { fetchErpStudents, ErpFetchError } from '@/lib/erp/client';
import { validateStudentPayload, type ErpStudentPayload } from '@/lib/erp/validation';

// Vercel 함수 maxDuration=60s 이므로 5분이면 정상 실행이 걸릴 수 있는 시간의 충분한 여유값
const STALE_RUN_MS = 5 * 60 * 1000;
const DEFAULT_INITIAL_UPDATED_AFTER = '2020-01-01T00:00:00+09:00';
const BATCH_SIZE = 500;
// 1페이지 500건은 행 단위 update 누적으로 Vercel 60s 를 넘긴다 (2026-09-10 실측 504)
const DEFAULT_PAGE_LIMIT = 100;
// Vercel maxDuration=60s. 여유를 두고 스스로 중단해 finally(잠금 해제·run 마감)를 반드시 실행시킨다
const RUN_TIME_BUDGET_MS = 40_000;

export interface RunErpPullParams {
  dryRun?: boolean;
  maxPages?: number;
  /** ERP 1페이지당 조회 건수(1~500) */
  pageLimit?: number;
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
  // true 면 ERP 의 비활성화 지시를 무시 (면접앱 수동 예외 활성화 유지)
  sync_exempt: boolean;
}

/**
 * stale 강제 인수 시, 마감되지 않고 남은 run 들을 failed 로 정리
 * - finally 블록이 실행되지 못한 회차(status='running' 고착)를 이력상 확정시킨다
 * - 실패해도 잠금 인수는 계속 진행 (throw 하지 않음)
 */
async function abandonStaleRuns(ageMs: number): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('erp_sync_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_code: 'STALE_ABANDONED',
        error_snippet: `이전 run 이 마감되지 않아 강제 인수됨 (age=${Math.round(ageMs / 1000)}s)`,
      })
      .eq('status', 'running')
      .select('id');

    if (error) {
      logger.error('[ERP Sync] abandonStaleRuns error:', error);
      return;
    }
    logger.warn(`[ERP Sync] Abandoned ${(data ?? []).length} stale run(s) as failed`);
  } catch (e) {
    logger.error('[ERP Sync] abandonStaleRuns uncaught:', e);
  }
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
    // 인수 직전 — 마감되지 않은 채 남아있는 run 이력을 failed 로 확정 (stale 경로 전용)
    await abandonStaleRuns(age);
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
      .select('id, code, is_active, sync_exempt')
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
  // 기존 + DB active=true & API active=false 이지만 sync_exempt=true: 비활성화 skip (로깅용)
  existingExemptSkipped: Array<{ payload: ErpStudentPayload; existing: ExistingStudent }>;
}

function emptyBuckets(): PageBuckets {
  return {
    newActive: [],
    newInactive: [],
    existingReactivation: [],
    existingDeactivation: [],
    existingUpdate: [],
    existingExemptSkipped: [],
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
    } else if (existing.sync_exempt) {
      // true → false 이지만 동기화 예외: 비활성화 skip, name/updated_at 만 갱신
      b.existingExemptSkipped.push({ payload: p, existing });
      b.existingUpdate.push({ payload: p, existing });
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
      // 큐 적재 — 개별 insert (batch 는 한 건 conflict 시 전체 롤백되므로 금지)
      const queueRows = buckets.newActive.map(p => ({
        student_code: p.student_code,
        student_id: null,
        source: 'case1_new_code' as const,
        transition_at: p.updated_at,
      }));
      for (const row of queueRows) {
        const { error } = await supabase.from('pending_reactivations').insert(row);
        if (!error) {
          queued += 1;
        } else if (error.code !== '23505') {
          // 23505 (unique violation) = 이미 pending → 무시
          errors.push(`case1 queue ${row.student_code}: ${error.message}`);
        }
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

  // ── 3. existingReactivation: case2 큐 적재 + students name/updated_at 만 갱신
  //    (is_active 는 그대로 false 유지 — admin 승인 전까지 활성화 금지)
  //    개별 insert — batch 는 한 건 conflict 시 전체 롤백되므로 금지
  if (buckets.existingReactivation.length > 0) {
    if (!dryRun) {
      for (const x of buckets.existingReactivation) {
        // 큐 적재
        const row = {
          student_code: x.payload.student_code,
          student_id: x.existing.id,
          source: 'case2_existing_code' as const,
          transition_at: x.payload.updated_at,
        };
        const { error: qErr } = await supabase.from('pending_reactivations').insert(row);
        if (!qErr) {
          queued += 1;
        } else if (qErr.code !== '23505') {
          errors.push(`case2 queue ${row.student_code}: ${qErr.message}`);
        }
        // students name/updated_at 동기화 (is_active 는 건드리지 않음)
        const { error: uErr } = await supabase
          .from('students')
          .update({
            name: x.payload.name,
            updated_at: x.payload.updated_at,
          })
          .eq('id', x.existing.id);
        if (uErr) {
          errors.push(`reactivation update ${x.existing.code}: ${uErr.message}`);
        } else {
          upserted += 1;
        }
      }
    } else {
      queued += buckets.existingReactivation.length;
      upserted += buckets.existingReactivation.length;
    }
  }

  // ── 3-1. sync_exempt 로 비활성화를 skip 한 학생 로깅 (name/updated_at 은 existingUpdate 에서 갱신)
  if (buckets.existingExemptSkipped.length > 0) {
    logger.warn(
      '[ERP Sync] sync_exempt 로 비활성화 skip:',
      buckets.existingExemptSkipped.map((x) => x.existing.code).join(', '),
    );
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
  // 우선순위: params → env → 기본값. client 의 clamp 와 별개로 진입부에서도 1~500 으로 강제
  const rawPageLimit = params.pageLimit ?? parseInt(process.env.ERP_PAGE_LIMIT || `${DEFAULT_PAGE_LIMIT}`);
  const pageLimit = Number.isFinite(rawPageLimit)
    ? Math.min(500, Math.max(1, Math.floor(rawPageLimit)))
    : DEFAULT_PAGE_LIMIT;
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

  // 시간 예산 기준점 — 잠금 획득 직후부터 계산
  const runStartedMs = Date.now();
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

    logger.info(`[ERP Sync] Start (dryRun=${dryRun}, maxPages=${maxPages}, source=${source})`, {
      cursor: cursor ? 'resume' : null,
      updated_after: updatedAfter,
      pageLimit,
    });

    for (let page = 0; page < maxPages; page++) {
      // 시간 예산 검사 — 첫 페이지는 무조건 1회 시도하고, 이후 페이지부터 자체 중단
      const elapsedMs = Date.now() - runStartedMs;
      if (page > 0 && elapsedMs > RUN_TIME_BUDGET_MS) {
        if (finalStatus !== 'failed') finalStatus = 'partial';
        collectedErrors.push('time budget exceeded — 다음 실행에서 cursor 로 재개');
        logger.warn(
          `[ERP Sync] Time budget exceeded (elapsed=${elapsedMs}ms, pagesFetched=${pagesFetched}), stopping early`,
        );
        break;
      }

      let pageRes;
      try {
        pageRes = await fetchErpStudents({
          updatedAfter,
          cursor: cursor ?? undefined,
          limit: pageLimit,
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
    // 3) run 마감 → 잠금 해제 (항상, 각각 독립 try/catch)
    //    기록 보존이 잠금 해제보다 우선이며, 한쪽이 throw 해도 다른 쪽은 반드시 실행된다.
    //    finally 에서 예외가 밖으로 나가면 원래 에러가 가려지므로 절대 재throw 하지 않는다.
    if (runId) {
      try {
        await finalizeRun(runId, {
          status: finalStatus,
          pages_fetched: pagesFetched,
          records_upserted: totalUpserted,
          records_queued: totalQueued,
          error_code: errorCode,
          error_snippet: errorSnippet,
        });
      } catch (e) {
        logger.error('[ERP Sync] finalizeRun threw in finally:', e);
      }
    }
    try {
      await releaseRunLock();
    } catch (e) {
      logger.error('[ERP Sync] releaseRunLock threw in finally:', e);
    }
  }
}
