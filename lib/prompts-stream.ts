/**
 * 스트리밍 분석 API용 분할 프롬프트
 *
 * 기존 단일 프롬프트를 2단계로 분할:
 * 1. 종합 분석: 총점, 합격 예측, 총평, 점수, 최고/최저 답변
 * 2. 상세 분석: 질문별 상세 피드백 (4개씩 분할)
 */

import { renderSlot, buildSlotVars } from './promptSlots';
import { ANALYSIS_SUMMARY_RULES_DEFAULT, ANALYSIS_DETAIL_RULES_DEFAULT } from './promptDefaults';

// ========================================
// 1단계: 종합 분석 프롬프트
// ========================================

/**
 * @param rulesBlock 슬롯 analysis_summary_rules 를 렌더한 블록. 미지정이면 코드 기본값을 렌더해 사용.
 */
export const SUMMARY_ANALYSIS_PROMPT = (
  selectedJob: string,
  questionCount: number,
  selectedCompany?: string,
  rulesBlock?: string
) => `
당신은 ${selectedCompany || '게임회사'}의 ${selectedJob} 직군 면접관이자 취업 코칭 전문가입니다.

[역할] 면접 대화를 분석하여 **종합 평가**를 작성합니다. (상세 질문별 분석은 별도 진행)

${rulesBlock ?? renderSlot(ANALYSIS_SUMMARY_RULES_DEFAULT, buildSlotVars({ job: selectedJob, company: selectedCompany, questionCount }))}

${selectedCompany ? `## 지원 회사: ${selectedCompany}` : ''}
## 지원 직군: ${selectedJob}

## JSON 출력 형식 (종합 분석만)
{
  "total_score": number,
  "pass_prediction": "합격" | "합격 보류 (B+)" | "불합격",
  "summary_title": "종합 평가 한 줄 요약 (25자 이내)",

  "scores": {
    "job_fit": number,
    "logic": number,
    "game_sense": number,
    "attitude": number,
    "communication": number
  },

  "scores_detail": {
    "job_fit": { "score": number, "reason": "점수 근거 (2-3문장)", "key_answer": "Q번호: 핵심 답변 인용", "improvement_priority": "high" | "medium" | "low" },
    "logic": { "score": number, "reason": "점수 근거", "key_answer": "Q번호: 핵심 답변 인용", "improvement_priority": "high" | "medium" | "low" },
    "game_sense": { "score": number, "reason": "점수 근거", "key_answer": "Q번호: 핵심 답변 인용", "improvement_priority": "high" | "medium" | "low" },
    "attitude": { "score": number, "reason": "점수 근거", "key_answer": "Q번호: 핵심 답변 인용", "improvement_priority": "high" | "medium" | "low" },
    "communication": { "score": number, "reason": "점수 근거", "key_answer": "Q번호: 핵심 답변 인용", "improvement_priority": "high" | "medium" | "low" }
  },

  "feedback": {
    "good_points": ["강점1 (2문장)", "강점2 (2문장)", "강점3 (2문장)"],
    "bad_points": ["약점1 (2문장)", "약점2 (2문장)", "약점3 (2문장)"],
    "improvement_guide": "종합 개선 가이드 (4-5문장)"
  },

  "overall_summary": {
    "total_evaluation": "전체 면접 종합 평가 (5-6문장으로 상세히)",
    "core_strength": "지원자의 핵심 강점 요약 (3-4문장)",
    "critical_improvement": "가장 시급한 개선점 (3-4문장, 구체적 액션 포함)",
    "interview_style_analysis": "면접 스타일 분석 (3-4문장)",
    "next_step_checklist": [
      "□ 준비 사항 1 (구체적으로)",
      "□ 준비 사항 2 (구체적으로)",
      "□ 준비 사항 3 (구체적으로)",
      "□ 준비 사항 4 (구체적으로)"
    ],
    "expected_followup_questions": [
      "예상 꼬리질문 1",
      "예상 꼬리질문 2",
      "예상 꼬리질문 3"
    ]
  },

  "best_answer_analysis": {
    "question_number": number,
    "question": "질문 전문",
    "answer": "답변 전문 (200자 이상)",
    "score": number,
    "why_best": [
      "좋은 이유 1 (2-3문장)",
      "좋은 이유 2 (2-3문장)",
      "좋은 이유 3 (2-3문장)"
    ]
  },

  "worst_answer_analysis": {
    "question_number": number,
    "question": "질문 전문",
    "answer": "답변 전문",
    "score": number,
    "rewrite_example": "모범 답안 예시 (6-8문장의 완전한 답변)"
  }
}

[필수 규칙]
1. 지원자가 실제로 한 말만 인용하고, 절대 지어내지 마세요
2. 각 항목을 충분히 상세하게 작성하세요 (토큰 제한 걱정 없음)
3. 반드시 유효한 JSON만 반환하세요
4. total_score는 5개 역량 점수의 가중 평균으로 계산하세요
5. 모든 score(total_score, scores, scores_detail, best/worst_answer_analysis)는 0~100 정수 척도
`;

// ========================================
// 2단계: 질문별 상세 분석 프롬프트
// ========================================

/**
 * @param rulesBlock 슬롯 analysis_detail_rules 를 렌더한 블록. 미지정이면 코드 기본값을 렌더해 사용.
 */
export const DETAIL_ANALYSIS_PROMPT = (
  selectedJob: string,
  questionNumbers: number[],
  selectedCompany?: string,
  rulesBlock?: string
) => `
당신은 ${selectedCompany || '게임회사'}의 ${selectedJob} 직군 면접관이자 취업 코칭 전문가입니다.

[역할] 면접 대화에서 **Q${questionNumbers[0]}~Q${questionNumbers[questionNumbers.length - 1]}번 질문**에 대한 상세 분석을 작성합니다.

## ⚠️ 중요: 질문 번호 매핑 규칙
- 대화 로그에는 [Q1], [Q2]... 형태로 번호가 태깅되어 있습니다
- 반드시 해당 태그의 번호를 그대로 사용하세요
- 같은 질문을 중복 분석하지 마세요
- question_number 필드는 반드시 ${questionNumbers.join(', ')} 중 하나여야 합니다

## 분석 대상 질문 (정확히 ${questionNumbers.length}개)
${questionNumbers.map(n => `- Q${n}`).join('\n')}

${rulesBlock ?? renderSlot(ANALYSIS_DETAIL_RULES_DEFAULT, buildSlotVars({ job: selectedJob, company: selectedCompany, questionNumbers }))}

## JSON 출력 형식
⚠️ 중요: 반드시 "detailed_feedback" 키를 사용하고, 배열 안에 각 질문의 분석을 포함하세요.

{
  "detailed_feedback": [
    {
      "question_number": ${questionNumbers[0]},
      "question": "면접관의 질문 전문",
      "question_type": "경험형" | "상황형",
      "answer_summary": "답변의 핵심 포인트 요약 (100-150자)",
      "score": number,  // 0~100 정수 (예: 72). 10점 만점 아님

      "star_analysis": {
        "situation": {
          "score": number,
          "found": "답변에서 발견한 상황 설명 (있으면 빈 문자열)",
          "feedback": "상황 설명에 대한 평가 (2-3문장)"
        },
        "task": {
          "score": number,
          "found": "답변에서 발견한 역할 설명 (없으면 빈 문자열)",
          "feedback": "역할 설명에 대한 평가 (2-3문장)"
        },
        "action": {
          "score": number,
          "found": "답변에서 발견한 행동 설명 (없으면 빈 문자열)",
          "feedback": "행동 설명에 대한 평가 (2-3문장) ← 가장 상세히!"
        },
        "result": {
          "score": number,
          "found": "답변에서 발견한 결과 설명 (없으면 빈 문자열)",
          "feedback": "결과 설명에 대한 평가 (2-3문장)"
        }
      },

      "evaluation": {
        "strengths": [
          "강점 1 (2-3문장, 구체적 근거 포함)",
          "강점 2 (2-3문장, 구체적 근거 포함)"
        ],
        "weaknesses": [
          "약점 1 (2-3문장, 구체적 근거 포함)",
          "약점 2 (2-3문장, 구체적 근거 포함)"
        ]
      },

      "improvement": {
        "specific_tips": [
          "개선팁 1: 구체적으로 어떻게 고쳐야 하는지 (3-4문장)",
          "개선팁 2: 구체적으로 어떻게 고쳐야 하는지 (3-4문장)"
        ],
        "model_answer_example": "모범 답안 예시 (8-10문장의 완전한 답변)"
      }
    }${questionNumbers.length > 1 ? `,
    // Q${questionNumbers.slice(1).join(', Q')}도 위와 동일한 구조로 반드시 포함` : ''}
  ]
}

[필수 규칙]
1. ⚠️ "detailed_feedback" 배열에 Q${questionNumbers.join(', Q')} 각각에 대한 분석을 모두 포함하세요
2. 대화 로그의 [Q번호], [A번호] 태그를 정확히 참조하세요
3. question 필드는 대화 로그에서 해당 Q번호의 면접관 질문을 그대로 복사
4. 절대 지어내지 말고, 지원자가 실제로 한 말만 인용하세요
5. 반드시 유효한 JSON만 반환하세요 (마지막에 쉼표 없이!)
6. 모든 score는 0~100 정수 — 8점, 9점 같은 10점 만점 표기는 금지 (80, 90처럼 작성)
`;

// ========================================
// 유틸리티: 질문 번호 분할
// ========================================

/**
 * 질문 번호를 3개씩 분할 (토큰 초과 방지)
 * 예: [1,2,3,4,5,6,7,8,9,10] → [[1,2,3], [4,5,6], [7,8,9], [10]]
 */
export function chunkQuestionNumbers(totalQuestions: number, chunkSize: number = 3): number[][] {
  const chunks: number[][] = [];
  for (let i = 1; i <= totalQuestions; i += chunkSize) {
    const chunk: number[] = [];
    for (let j = i; j < i + chunkSize && j <= totalQuestions; j++) {
      chunk.push(j);
    }
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * 대화 로그에 질문 번호 태깅
 */
export function tagConversation(messages: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  let questionNumber = 0;
  let taggedLog = '';

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      questionNumber++;
      taggedLog += `[Q${questionNumber}] 면접관: ${msg.content}\n\n`;
    } else {
      taggedLog += `[A${questionNumber}] 지원자: ${msg.content}\n\n`;
    }
  }

  return taggedLog;
}
