/**
 * 프롬프트 슬롯 (server-only)
 *
 * 어드민에서 버전 관리하는 프롬프트 조각 3종:
 * - interviewer_persona     : 면접관 페르소나·대화 규칙 (buildSystemPrompt 의 personaAndRulesSection)
 * - analysis_summary_rules  : 종합 분석 점수 구간·평가 항목·합격 예측 기준 (SUMMARY_ANALYSIS_PROMPT)
 * - analysis_detail_rules   : 질문별 상세 분석 단계 구분·점수 척도·STAR 기준 (DETAIL_ANALYSIS_PROMPT)
 *
 * 활성 본문 조회 순서: 5분 인메모리 캐시 → DB(prompt_versions.is_active) → 코드 기본값(lib/promptDefaults.ts).
 * DB 에 버전이 없으면 코드 기본값이 그대로 쓰이므로 리팩토링 전과 동일한 프롬프트가 생성된다.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { SCORE_BANDS, GAME_INTERVIEW_RUBRIC, PASS_PREDICTION_CRITERIA } from '@/lib/constants';
import {
  INTERVIEWER_PERSONA_DEFAULT,
  ANALYSIS_SUMMARY_RULES_DEFAULT,
  ANALYSIS_DETAIL_RULES_DEFAULT,
} from '@/lib/promptDefaults';
import {
  PROMPT_SLOTS,
  PROMPT_SLOT_META,
  SLOT_BODY_MIN,
  SLOT_BODY_MAX,
  isPromptSlot,
  type PromptSlot,
} from '@/lib/promptSlotMeta';

export { PROMPT_SLOTS, PROMPT_SLOT_META, SLOT_BODY_MIN, SLOT_BODY_MAX, isPromptSlot };
export type { PromptSlot };

// ========================================
// 렌더링
// ========================================

/** 평가 기준표(Rubric) → 프롬프트 텍스트 (prompts-stream 에서 이동, 출력 불변) */
export function formatRubric(rubric: typeof GAME_INTERVIEW_RUBRIC): string {
  return Object.entries(rubric).map(([, item]) => {
    const weight = item.weight ? ` (가중치: ${Math.round(item.weight * 100)}%)` : '';
    return `### ${item.name}${weight}
- 90-100점(탁월): ${item.criteria.excellent}
- 80-89점(우수): ${item.criteria.good}
- 70-79점(양호): ${item.criteria.average}
- 60-69점(미흡): ${item.criteria.below}
- 0-59점(부족): ${item.criteria.poor}`;
  }).join('\n\n');
}

function formatScoreBands(): string {
  return [
    `- ${SCORE_BANDS.excellent.min}-${SCORE_BANDS.excellent.max}점: ${SCORE_BANDS.excellent.label}`,
    `- ${SCORE_BANDS.good.min}-${SCORE_BANDS.good.max}점: ${SCORE_BANDS.good.label}`,
    `- ${SCORE_BANDS.average.min}-${SCORE_BANDS.average.max}점: ${SCORE_BANDS.average.label}`,
    `- ${SCORE_BANDS.below.min}-${SCORE_BANDS.below.max}점: ${SCORE_BANDS.below.label}`,
    `- ${SCORE_BANDS.poor.min}-${SCORE_BANDS.poor.max}점: ${SCORE_BANDS.poor.label}`,
  ].join('\n');
}

function formatPassCriteria(): string {
  return [
    `- ${PASS_PREDICTION_CRITERIA.pass.min}점 이상: ${PASS_PREDICTION_CRITERIA.pass.label}`,
    `- ${PASS_PREDICTION_CRITERIA.borderline.min}점 이상: ${PASS_PREDICTION_CRITERIA.borderline.label}`,
    `- ${PASS_PREDICTION_CRITERIA.borderline.min}점 미만: ${PASS_PREDICTION_CRITERIA.fail.label}`,
  ].join('\n');
}

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * {{name}} 플레이스홀더 치환 (1패스 — 치환된 값은 다시 스캔하지 않음).
 * vars 에 없는 이름(미지원·미제공)은 원문 그대로 둔다.
 */
export function renderSlot(body: string, vars: Record<string, string>): string {
  return body.replace(PLACEHOLDER_RE, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
  );
}

/** 슬롯 치환 변수 생성. 제공되지 않은 job/company/question_* 는 키 자체를 넣지 않는다(플레이스홀더 보존). */
export function buildSlotVars(p: {
  job?: string;
  company?: string;
  questionCount?: number;
  questionNumbers?: number[];
}): Record<string, string> {
  const vars: Record<string, string> = {
    score_bands: formatScoreBands(),
    rubric: formatRubric(GAME_INTERVIEW_RUBRIC),
    pass_criteria: formatPassCriteria(),
  };
  if (p.job !== undefined) vars.job = p.job;
  if (p.company !== undefined) vars.company = p.company;
  if (p.questionCount !== undefined) vars.question_count = String(p.questionCount);
  if (p.questionNumbers !== undefined) vars.question_numbers = p.questionNumbers.join(', ');
  return vars;
}

// ========================================
// 검증
// ========================================

/** {{ 와 }} 가 순서대로 짝을 이루는지 (중첩·홀로 남은 괄호 불가) */
function checkBracePairs(body: string): string | null {
  let open = false;
  for (let i = 0; i < body.length - 1; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{') {
      if (open) return `${i + 1}번째 글자 근처: '{{' 가 닫히기 전에 다시 '{{' 가 열렸습니다.`;
      open = true;
      i++;
    } else if (two === '}}') {
      if (!open) return `${i + 1}번째 글자 근처: 짝이 없는 '}}' 가 있습니다.`;
      open = false;
      i++;
    }
  }
  if (open) return "닫히지 않은 '{{' 가 있습니다.";
  return null;
}

export function validateSlotBody(
  slot: PromptSlot,
  body: string
): { ok: true } | { ok: false; error: string } {
  if (typeof body !== 'string') return { ok: false, error: '본문이 문자열이 아닙니다.' };
  if (body.length < SLOT_BODY_MIN || body.length > SLOT_BODY_MAX) {
    return {
      ok: false,
      error: `본문은 ${SLOT_BODY_MIN.toLocaleString('ko-KR')}~${SLOT_BODY_MAX.toLocaleString('ko-KR')}자여야 합니다. (현재 ${body.length.toLocaleString('ko-KR')}자)`,
    };
  }
  const braceError = checkBracePairs(body);
  if (braceError) return { ok: false, error: `플레이스홀더 괄호 오류 — ${braceError}` };
  for (const name of PROMPT_SLOT_META[slot].required) {
    const re = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`);
    if (!re.test(body)) {
      return { ok: false, error: `필수 플레이스홀더 {{${name}}} 가 없습니다.` };
    }
  }
  return { ok: true };
}

// ========================================
// 기본값 / 활성 본문 조회
// ========================================

export function getDefaultSlotBody(slot: PromptSlot): string {
  switch (slot) {
    case 'interviewer_persona':
      return INTERVIEWER_PERSONA_DEFAULT;
    case 'analysis_summary_rules':
      return ANALYSIS_SUMMARY_RULES_DEFAULT;
    case 'analysis_detail_rules':
      return ANALYSIS_DETAIL_RULES_DEFAULT;
  }
}

/** 롤백 시 새 버전 메모: `[ROLLBACK to <id 앞 8자>] <원 메모>` */
export function buildRollbackMemo(targetId: string, originalMemo: string | null | undefined): string {
  return `[ROLLBACK to ${targetId.slice(0, 8)}] ${originalMemo ?? ''}`;
}

export const RESET_MEMO = '[RESET] 코드 기본값 복원';

const SLOT_CACHE_TTL_MS = 5 * 60 * 1000;

interface ActiveSlot {
  body: string;
  fromDb: boolean;
  versionId: string | null;
}

const slotCache = new Map<PromptSlot, { value: ActiveSlot; expiry: number }>();

/**
 * 슬롯의 현재 활성 본문.
 * 5분 캐시 → DB 활성 행 → 코드 기본값. DB 오류 시 기본값 + logger.warn (오류 결과는 캐시하지 않음).
 */
export async function getActiveSlotBody(slot: PromptSlot): Promise<ActiveSlot> {
  const cached = slotCache.get(slot);
  if (cached && Date.now() < cached.expiry) return cached.value;

  const fallback: ActiveSlot = { body: getDefaultSlotBody(slot), fromDb: false, versionId: null };
  try {
    const { data, error } = await supabase
      .from('prompt_versions')
      .select('id, body')
      .eq('slot', slot)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      logger.warn('[promptSlots] 활성 버전 조회 실패, 코드 기본값 사용:', slot, error.message);
      return fallback;
    }
    const row = data as { id: string; body: string } | null;
    const value: ActiveSlot =
      row && typeof row.body === 'string' && row.body.length > 0
        ? { body: row.body, fromDb: true, versionId: row.id }
        : fallback;
    slotCache.set(slot, { value, expiry: Date.now() + SLOT_CACHE_TTL_MS });
    return value;
  } catch (err) {
    logger.warn('[promptSlots] 활성 버전 조회 예외, 코드 기본값 사용:', slot, err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** 어드민 저장/롤백/복원 후 호출 — 이 서버 인스턴스의 캐시만 비운다 */
export function invalidateSlotCache(slot?: PromptSlot): void {
  if (slot) slotCache.delete(slot);
  else slotCache.clear();
}
