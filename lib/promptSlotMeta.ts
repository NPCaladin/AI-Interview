/**
 * 프롬프트 슬롯 메타 (클라이언트·서버 공용 — DB/서버 의존성 없음)
 * lib/promptSlots.ts 가 그대로 re-export 한다. 어드민 페이지(클라이언트)는 이 파일만 import 할 것.
 */

export type PromptSlot = 'interviewer_persona' | 'analysis_summary_rules' | 'analysis_detail_rules';

export const PROMPT_SLOTS: PromptSlot[] = [
  'interviewer_persona',
  'analysis_summary_rules',
  'analysis_detail_rules',
];

export const PROMPT_SLOT_META: Record<
  PromptSlot,
  { label: string; description: string; variables: string[]; required: string[] }
> = {
  interviewer_persona: {
    label: '면접관 페르소나',
    description:
      '면접 대화 중 면접관의 성격·말투·꼬리질문·기출 질문 활용 규칙입니다. 회사/직군/단계 지시·평가 기준·신입 전제 블록은 코드가 앞뒤로 붙입니다.',
    variables: [],
    required: [],
  },
  analysis_summary_rules: {
    label: '종합 분석 기준',
    description:
      '리포트 종합 분석의 점수 구간·평가 항목·합격 예측 기준입니다. 역할 문구·지원 회사/직군·JSON 출력 형식·필수 규칙은 코드가 붙입니다.',
    variables: ['score_bands', 'rubric', 'pass_criteria', 'job', 'company', 'question_count'],
    required: ['score_bands'],
  },
  analysis_detail_rules: {
    label: '질문별 상세 분석 기준',
    description:
      '질문별 상세 분석의 단계 구분·점수 척도·STAR 평가 기준입니다. 역할 문구·분석 대상 질문·JSON 출력 형식·필수 규칙은 코드가 붙입니다.',
    variables: ['score_bands', 'job', 'company', 'question_numbers'],
    required: ['score_bands'],
  },
};

export function isPromptSlot(v: unknown): v is PromptSlot {
  return typeof v === 'string' && (PROMPT_SLOTS as string[]).includes(v);
}

export const SLOT_BODY_MIN = 10;
export const SLOT_BODY_MAX = 30000;
