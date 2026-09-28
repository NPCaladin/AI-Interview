/**
 * 어드민 감사 로그 헬퍼 (서버 전용)
 * - admin_audit_log 테이블에 작업자·액션·전후 값을 기록한다.
 * - 감사 로그 실패가 본 작업을 막지 않도록 절대 throw 하지 않는다 (logger.warn 만).
 * - IP: Vercel request.ip → x-real-ip → null. x-forwarded-for 는 스푸핑 가능하므로 신뢰하지 않는다.
 */
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type AdminAction =
  | 'ADMIN_LOGIN'
  | 'STUDENT_CREATE'
  | 'STUDENT_UPDATE'
  | 'STUDENT_TOGGLE'
  | 'STUDENT_DELETE'
  | 'STUDENT_RESET_USAGE'
  | 'STUDENT_EXEMPT_SET'
  | 'STUDENT_NOTE_UPDATE'
  | 'QUEUE_APPROVE'
  | 'QUEUE_REJECT'
  | 'QUEUE_MERGE'
  | 'QUEUE_BULK_APPROVE'
  | 'QUEUE_ELIGIBILITY_CHECK'
  | 'SYNC_TRIGGER'
  | 'QUESTION_CREATE'
  | 'QUESTION_UPDATE'
  | 'QUESTION_DELETE'
  | 'QUESTION_RESTORE'
  | 'QUESTION_BULK_CREATE'
  | 'JOB_KEYWORDS_UPDATE'
  | 'CRITERIA_UPDATE'
  | 'PROMPT_UPDATE'
  | 'PROMPT_ROLLBACK'
  | 'PROMPT_RESET_DEFAULT';

export interface AuditParams {
  actor: string;
  action: AdminAction;
  resource_type?: string;
  resource_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  request?: NextRequest;
}

function resolveIp(request?: NextRequest): string | null {
  if (!request) return null;
  const vercelIp = request.ip;
  if (vercelIp && vercelIp.trim()) return vercelIp.trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

/** 감사 로그 insert 최대 대기 시간 — 본 응답을 이 이상 지연시키지 않는다 */
const AUDIT_TIMEOUT_MS = 2000;

export async function logAdminAction(p: AuditParams): Promise<void> {
  try {
    const actor = (p.actor || 'admin').slice(0, 50);
    const insert = supabase.from('admin_audit_log').insert({
      actor,
      action: p.action,
      resource_type: p.resource_type ?? null,
      resource_id: p.resource_id ?? null,
      old_values: p.old_values ?? null,
      new_values: p.new_values ?? null,
      details: p.details ?? null,
      ip_address: resolveIp(p.request),
    });
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), AUDIT_TIMEOUT_MS));
    const result = await Promise.race([insert, timeout]);
    if (result === 'timeout') {
      logger.warn('[AdminAudit] insert timed out (>2s), continuing:', p.action);
      return;
    }
    if (result.error) {
      logger.warn('[AdminAudit] insert failed:', p.action, result.error.message);
    }
  } catch (e) {
    logger.warn('[AdminAudit] unexpected error:', p.action, e);
  }
}
