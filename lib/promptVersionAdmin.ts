/**
 * 프롬프트 버전 어드민 공용 DB 헬퍼 (server-only, /api/admin/prompts/* 전용)
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getDefaultSlotBody, type PromptSlot } from '@/lib/promptSlots';

export interface PromptVersionRow {
  id: string;
  slot: PromptSlot;
  body: string;
  char_count: number;
  is_active: boolean;
  version_memo: string;
  created_by: string;
  created_at: string;
}

export const PROMPT_VERSION_COLUMNS = 'id, slot, body, char_count, is_active, version_memo, created_by, created_at';
export const PROMPT_HISTORY_COLUMNS = 'id, slot, char_count, is_active, version_memo, created_by, created_at';
export const PROMPT_HISTORY_LIMIT = 20;
export const VERSION_MEMO_MAX = 200;

/** 슬롯의 활성 행 (없으면 data=null) */
export async function fetchActiveVersion(
  slot: PromptSlot
): Promise<{ data: PromptVersionRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('prompt_versions')
    .select(PROMPT_VERSION_COLUMNS)
    .eq('slot', slot)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as PromptVersionRow | null) ?? null, error: null };
}

/** 감사 로그 old_values 용 — 현재 활성 본문, 없거나 조회 실패면 코드 기본값 */
export async function currentActiveBodyForAudit(slot: PromptSlot): Promise<string> {
  const { data, error } = await fetchActiveVersion(slot);
  if (error) {
    logger.warn('[promptVersionAdmin] 이전 활성 본문 조회 실패(감사용), 기본값으로 기록:', slot, error);
  }
  return data?.body ?? getDefaultSlotBody(slot);
}

/** RPC activate_prompt_version — 기존 활성 해제 + 새 활성 행 insert (한 트랜잭션). 반환 = 새 행 id */
export async function activatePromptVersion(p: {
  slot: PromptSlot;
  body: string;
  memo: string;
  actor: string;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('activate_prompt_version', {
    p_slot: p.slot,
    p_body: p.body,
    p_memo: p.memo,
    p_actor: p.actor.slice(0, 50),
  });
  if (error) return { id: null, error: error.message };
  if (typeof data !== 'string') return { id: null, error: 'RPC 가 새 버전 id 를 반환하지 않았습니다.' };
  return { id: data, error: null };
}
