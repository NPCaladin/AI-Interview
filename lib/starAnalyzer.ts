/**
 * STAR 구조화 답변 분석 엔진
 * 게임 면접 맥락에 맞게 조정
 */

import { STAR_RUBRIC } from './constants';
import type { STARScore, ActionDetail, STARAnalysis } from './types';

// ========================================
// 패턴 정의 (정규식 기반)
// ========================================

/** Situation 패턴 - 상황/배경 설명 */
const SITUATION_PATTERNS = [
  /당시[에는]?\s*[가-힣]+/,
  /그때[는]?\s*[가-힣]+/,
  /상황[이었는데|에서|은]/,
  /배경[은|을]\s*설명/,
  /문제[가|는]\s*[가-힣]+/,
  /[0-9]{4}년/,  // 연도 언급
  /[0-9]+월/,    // 월 언급
  /프로젝트[에서|를|가]/,
  /업무[를|중|에서]/,
  /팀[에서|원|장]/,
  /회사[에서|가]/,
  /학교[에서|가]/,
  /동아리[에서|가]/,
];

/** Task 패턴 - 역할/책임 */
const TASK_PATTERNS = [
  /제가\s*맡[았은]/,
  /저[는의]\s*역할/,
  /담당[했하]/,
  /책임[졌지]/,
  /목표[는가를]/,
  /~해야\s*[했했]/,
  /임무[는가]/,
  /팀장|팀원|리더|파트장/,
  /기획자|PM|디자이너|프로그래머/,
];

/** Action 패턴 - 구체적 행동 */
const ACTION_PATTERNS = {
  // 일반 행동
  general: [
    /제가\s*직접\s*[가-힣]+했/,
    /[가-힣]+을\s*진행했/,
    /[가-힣]+을\s*실행했/,
    /[가-힣]+을\s*추진했/,
    /[가-힣]+을\s*기획했/,
    /[가-힣]+을\s*분석했/,
  ],
  // Method - 방법론 (게임 업계 맥락 추가)
  method: [
    /SWOT/i, /PEST/i, /5Why/i, /KPI/i, /OKR/i,
    /파레토/, /브레인스토밍/, /벤치마킹/,
    /분석[을를]?\s*(통해|하여|해서)/,
    /방법[으로론]/,
    /A\/B\s*테스트/i,
    /유저\s*리서치/,
    /데이터\s*분석/,
    /플레이\s*테스트/,
    /QA\s*테스트/,
  ],
  // Tool - 도구 (게임 업계 맥락 추가)
  tool: [
    /Excel/i, /Python/i, /SQL/i, /PowerPoint/i,
    /Unity/i, /Unreal/i, /Figma/i, /Photoshop/i,
    /Jira/i, /Confluence/i, /Notion/i, /Slack/i,
    /시스템[을를]?\s*활용/,
    /프로그램[을를]?\s*사용/,
    /도구[를]?\s*(활용|사용)/,
    /엔진[을를]?\s*사용/,
  ],
  // Phrase - 직접 인용
  phrase: [
    /['"][가-힣\s]+['"]라고\s*(말|전달|설득|제안)/,
    /~라고\s*(말했|전달했|설득했)/,
    /["'][^"']+["']/,  // 따옴표 안 내용
  ],
  // Step - 순서
  step: [
    /먼저[,\s]/,
    /첫째[,로\s]/,
    /그\s*다음[에으로]/,
    /둘째[,로\s]/,
    /셋째[,로\s]/,
    /마지막으로/,
    /최종적으로/,
    /1\)\s*[가-힣]/,
    /2\)\s*[가-힣]/,
  ]
};

/** Result 패턴 - 결과/성과 */
const RESULT_PATTERNS = {
  quantitative: [
    /[0-9]+%/,           // 퍼센트
    /[0-9]+배/,          // 배수
    /[0-9,]+원/,         // 금액
    /[0-9,]+건/,         // 건수
    /[0-9,]+명/,         // 인원
    /[0-9]+시간/,        // 시간
    /[0-9]+일/,          // 일수
    /→\s*[0-9]/,         // 변화량
    /에서\s*[0-9]+[가-힣]*\s*(으로|로)/,  // X에서 Y로
    /DAU|MAU|ARPU|ARPPU/i,  // 게임 지표
    /리텐션|retention/i,
  ],
  qualitative: [
    /결과[적으로는]/,
    /성과[로는를]/,
    /달성[했하]/,
    /개선[됐되]/,
    /향상[됐되]/,
    /인정[받을]/,
    /칭찬[을를]/,
    /수상/,
    /선정/,
    /런칭/,
    /출시/,
  ]
};

// ========================================
// 분석 함수
// ========================================

/**
 * 패턴 매칭 점수 계산
 */
function calculatePatternScore(text: string, patterns: RegExp[]): number {
  let matchCount = 0;
  patterns.forEach(pattern => {
    if (pattern.test(text)) matchCount++;
  });

  // 패턴 매칭 비율을 0-100으로 변환
  const ratio = matchCount / patterns.length;
  return Math.min(100, Math.round(ratio * 120)); // 약간의 보너스
}

/**
 * Action 4요소 상세 분석
 */
function analyzeActionDetail(text: string): ActionDetail {
  return {
    method: ACTION_PATTERNS.method.some(p => p.test(text)),
    tool: ACTION_PATTERNS.tool.some(p => p.test(text)),
    phrase: ACTION_PATTERNS.phrase.some(p => p.test(text)),
    step: ACTION_PATTERNS.step.some(p => p.test(text))
  };
}

/**
 * Action 점수 계산 (4요소 가중)
 */
function calculateActionScore(text: string, actionDetail: ActionDetail): number {
  // 기본 행동 패턴 점수
  const generalScore = calculatePatternScore(text, ACTION_PATTERNS.general);

  // 4요소 보너스
  let bonus = 0;
  if (actionDetail.method) bonus += 15;
  if (actionDetail.tool) bonus += 15;
  if (actionDetail.phrase) bonus += 20;  // 직접 인용은 더 높은 점수
  if (actionDetail.step) bonus += 10;

  // "했습니다" 류의 일반적인 서술 체크
  const actionVerbs = text.match(/[가-힣]+했습니다/g) || [];
  const verbBonus = Math.min(30, actionVerbs.length * 5);

  return Math.min(100, generalScore + bonus + verbBonus);
}

/**
 * Result 점수 계산 (정량적 > 정성적)
 */
function calculateResultScore(text: string): number {
  const quantScore = calculatePatternScore(text, RESULT_PATTERNS.quantitative);
  const qualScore = calculatePatternScore(text, RESULT_PATTERNS.qualitative);

  // 정량적 결과가 있으면 가산점
  if (quantScore > 30) {
    return Math.min(100, quantScore * 0.7 + qualScore * 0.3 + 20);
  }

  return Math.round(quantScore * 0.5 + qualScore * 0.5);
}

/**
 * 답변 텍스트에서 STAR 구조 분석
 */
export function analyzeSTAR(answer: string): STARAnalysis {
  if (!answer || answer.trim().length < 20) {
    return {
      hasStructure: false,
      missingElements: ['S', 'T', 'A', 'R'],
      score: {
        situation: 0, task: 0, action: 0, result: 0, overall: 0,
        warnings: ['답변이 너무 짧습니다. 최소 2-3문장 이상으로 답변하세요.'],
        strengths: []
      },
      actionDetail: { method: false, tool: false, phrase: false, step: false },
      recommendation: STAR_RUBRIC.action.criteria.poor,
      grade: 'D'
    };
  }

  // 각 요소별 점수 계산
  const situationScore = calculatePatternScore(answer, SITUATION_PATTERNS);
  const taskScore = calculatePatternScore(answer, TASK_PATTERNS);
  const actionDetail = analyzeActionDetail(answer);
  const actionScore = calculateActionScore(answer, actionDetail);
  const resultScore = calculateResultScore(answer);

  // 가중 평균 (Action 40%, 나머지 20%씩)
  const overall = Math.round(
    situationScore * 0.2 +
    taskScore * 0.2 +
    actionScore * 0.4 +
    resultScore * 0.2
  );

  // 부족한 요소 파악 (30점 미만)
  const missingElements: ('S' | 'T' | 'A' | 'R')[] = [];
  if (situationScore < 30) missingElements.push('S');
  if (taskScore < 30) missingElements.push('T');
  if (actionScore < 30) missingElements.push('A');
  if (resultScore < 30) missingElements.push('R');

  // 경고 및 강점 생성
  const warnings: string[] = [];
  const strengths: string[] = [];

  // Action 상세 분석 기반 피드백
  if (actionScore < 40) {
    const missingAction: string[] = [];
    if (!actionDetail.method) missingAction.push('방법론');
    if (!actionDetail.tool) missingAction.push('도구');
    if (!actionDetail.phrase) missingAction.push('직접 인용');
    if (!actionDetail.step) missingAction.push('순서');

    if (missingAction.length > 0) {
      warnings.push(`Action 부족: ${missingAction.join(', ')}이 없습니다.`);
    }
  }

  if (resultScore < 30) {
    warnings.push('Result: 정량적 수치(%, 건, 원 등)로 결과를 표현하세요.');
  }
  if (situationScore < 30) {
    warnings.push('Situation: 언제, 어디서, 어떤 상황이었는지 구체적으로 설명하세요.');
  }
  if (taskScore < 30) {
    warnings.push('Task: "제가 맡은 역할은..."으로 본인의 책임을 명시하세요.');
  }

  // 강점
  if (actionScore >= 70) {
    strengths.push('Action이 구체적으로 잘 표현되었습니다.');
  }
  if (resultScore >= 60) {
    strengths.push('Result가 명확하게 제시되었습니다.');
  }
  if (actionDetail.phrase) {
    strengths.push('직접 인용이 포함되어 생동감이 있습니다.');
  }
  if (actionDetail.step) {
    strengths.push('순서가 명확하여 논리적입니다.');
  }

  // 추천 사항 생성
  const recommendation = generateRecommendation(missingElements, actionScore, actionDetail);
  const grade = getSTARGrade(overall);

  return {
    hasStructure: missingElements.length <= 1 && actionScore >= 40,
    missingElements,
    score: {
      situation: situationScore,
      task: taskScore,
      action: actionScore,
      result: resultScore,
      overall,
      warnings,
      strengths
    },
    actionDetail,
    recommendation,
    grade
  };
}

/**
 * 개선 추천 사항 생성
 */
function generateRecommendation(
  missingElements: ('S' | 'T' | 'A' | 'R')[],
  actionScore: number,
  actionDetail: ActionDetail
): string {
  if (missingElements.length === 0 && actionScore >= 70) {
    return '우수한 STAR 구조입니다. 현재 수준을 유지하세요.';
  }

  const recommendations: string[] = [];

  // Action이 가장 중요하므로 먼저 처리
  if (actionScore < 50) {
    const actionTips: string[] = [];
    if (!actionDetail.method) actionTips.push('어떤 분석 방법을 썼나요? (예: 유저 리서치, A/B 테스트)');
    if (!actionDetail.tool) actionTips.push('어떤 도구를 활용했나요? (예: Unity, Excel, Jira)');
    if (!actionDetail.phrase) actionTips.push('팀원/유저에게 한 말을 직접 인용하세요');
    if (!actionDetail.step) actionTips.push('"먼저...그 다음...마지막으로" 순서로 설명하세요');

    recommendations.push(`[Action 보강] ${actionTips.join(' / ')}`);
  }

  if (missingElements.includes('S')) {
    recommendations.push('[Situation] "당시 상황은 ~이었고, ~라는 문제가 있었습니다."');
  }
  if (missingElements.includes('T')) {
    recommendations.push('[Task] "제가 맡은 역할은 ~이었고, ~를 해결해야 했습니다."');
  }
  if (missingElements.includes('R')) {
    recommendations.push('[Result] "그 결과 ~%/~건의 성과를 달성했습니다."');
  }

  return recommendations.join('\n');
}

/**
 * 여러 답변의 STAR 분석 종합
 */
export function analyzeMultipleAnswers(answers: string[]): {
  averageScore: STARScore;
  bestAnswer: { index: number; score: number };
  worstAnswer: { index: number; score: number };
  overallRecommendation: string;
  actionDetailSummary: { total: number; withMethod: number; withTool: number; withPhrase: number; withStep: number };
} {
  if (answers.length === 0) {
    throw new Error('분석할 답변이 없습니다.');
  }

  const analyses = answers.map(answer => analyzeSTAR(answer));

  // 평균 점수 계산
  const avgSituation = analyses.reduce((sum, a) => sum + a.score.situation, 0) / analyses.length;
  const avgTask = analyses.reduce((sum, a) => sum + a.score.task, 0) / analyses.length;
  const avgAction = analyses.reduce((sum, a) => sum + a.score.action, 0) / analyses.length;
  const avgResult = analyses.reduce((sum, a) => sum + a.score.result, 0) / analyses.length;
  const avgOverall = Math.round(avgSituation * 0.2 + avgTask * 0.2 + avgAction * 0.4 + avgResult * 0.2);

  // Action 4요소 통계
  const actionDetailSummary = {
    total: analyses.length,
    withMethod: analyses.filter(a => a.actionDetail.method).length,
    withTool: analyses.filter(a => a.actionDetail.tool).length,
    withPhrase: analyses.filter(a => a.actionDetail.phrase).length,
    withStep: analyses.filter(a => a.actionDetail.step).length
  };

  // 최고/최저 답변 찾기
  const scores = analyses.map(a => a.score.overall);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const bestIndex = scores.indexOf(maxScore);
  const worstIndex = scores.indexOf(minScore);

  // 종합 경고 수집
  const allWarnings = analyses.flatMap(a => a.score.warnings);
  const uniqueWarnings = Array.from(new Set(allWarnings));

  const overallRecommendation = generateOverallRecommendation(avgAction, actionDetailSummary, uniqueWarnings);

  return {
    averageScore: {
      situation: Math.round(avgSituation),
      task: Math.round(avgTask),
      action: Math.round(avgAction),
      result: Math.round(avgResult),
      overall: avgOverall,
      warnings: uniqueWarnings,
      strengths: []
    },
    bestAnswer: { index: bestIndex, score: maxScore },
    worstAnswer: { index: worstIndex, score: minScore },
    overallRecommendation,
    actionDetailSummary
  };
}

/**
 * 전체 답변에 대한 종합 추천
 */
function generateOverallRecommendation(
  avgAction: number,
  actionSummary: { total: number; withMethod: number; withTool: number; withPhrase: number; withStep: number },
  warnings: string[]
): string {
  const recommendations: string[] = [];

  if (avgAction < 40) {
    recommendations.push('**Action이 전반적으로 부족합니다.** 모든 답변에서 "제가 구체적으로 ~했습니다"를 3가지 이상 포함하세요.');
  }

  // Action 4요소 부족 분석
  const methodRate = actionSummary.withMethod / actionSummary.total;
  const toolRate = actionSummary.withTool / actionSummary.total;
  const phraseRate = actionSummary.withPhrase / actionSummary.total;
  const stepRate = actionSummary.withStep / actionSummary.total;

  if (phraseRate < 0.3) {
    recommendations.push('**직접 인용 부족**: 팀원/유저에게 한 말을 "~라고 말했습니다" 형태로 포함하세요.');
  }
  if (stepRate < 0.3) {
    recommendations.push('**순서 표현 부족**: "먼저, 그 다음, 마지막으로" 등 순서를 명시하세요.');
  }
  if (methodRate < 0.2) {
    recommendations.push('**방법론 언급 부족**: 유저 리서치, A/B 테스트 등 사용한 방법을 언급하세요.');
  }

  if (recommendations.length === 0) {
    return 'STAR 구조가 전반적으로 우수합니다. 현재 수준을 유지하세요.';
  }

  return recommendations.join('\n\n');
}

/**
 * STAR 점수를 등급으로 변환
 */
export function getSTARGrade(score: number): string {
  if (score >= 85) return 'S (탁월)';
  if (score >= 70) return 'A (우수)';
  if (score >= 55) return 'B (양호)';
  if (score >= 40) return 'C (미흡)';
  return 'D (부족)';
}

/**
 * 질문 유형 판별 (경험형 vs 상황형)
 */
export function isExperienceQuestion(question: string): boolean {
  const experiencePatterns = [
    /경험[이을를]?\s*(말|설명|알려)/,
    /사례[를을]?\s*(말|설명|알려)/,
    /~한\s*적[이]?\s*있/,
    /~했던\s*경험/,
    /과거[에]?\s*/,
    /이전[에]?\s*/
  ];

  return experiencePatterns.some(p => p.test(question));
}
