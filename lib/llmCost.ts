/**
 * LLM 토큰 → 예상 비용(USD) 계산 (순수 함수)
 * 단가: 1M 토큰당 USD. 모르는 모델은 gpt-4o 단가로 추정.
 */

export const LLM_PRICES_USD_PER_M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

const DEFAULT_MODEL = 'gpt-4o';

export function estimateCostUsd(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number {
  const price =
    (model && LLM_PRICES_USD_PER_M[model]) || LLM_PRICES_USD_PER_M[DEFAULT_MODEL];
  const inTok = Number.isFinite(promptTokens) ? Math.max(0, promptTokens) : 0;
  const outTok = Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : 0;
  return (inTok * price.input + outTok * price.output) / 1_000_000;
}

/** 예: 0.4213 → "$0.42" */
export function formatUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}
