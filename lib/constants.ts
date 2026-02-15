// 면접 설정
export const TOTAL_QUESTION_COUNT = 20; // 총 질문 수

// 회사 목록
export const COMPANY_LIST = [
  '공통(회사선택X)',
  '넥슨',
  '넷마블',
  '엔씨',
  '컴투스',
  '컴투스 홀딩스',
  '크래프톤',
  '스마일게이트',
  '웹젠',
  '조이시티',
  '데브시스터즈',
  '네오위즈',
];

// Daglo API 설정
export const DAGLO_API_BASE_URL = "https://apis.daglo.ai/stt/v1/async/transcripts";
export const DAGLO_MAX_WAIT_TIME = 30; // 최대 대기 시간 (초)
export const DAGLO_INITIAL_POLL_INTERVAL = 1.0; // 초기 폴링 간격 (초)
export const DAGLO_MAX_POLL_INTERVAL = 3.0; // 최대 폴링 간격 (초)
export const DAGLO_BACKOFF_MULTIPLIER = 1.5; // 백오프 배수

// 점수 레이블 매핑
export const SCORE_LABELS: Record<string, string> = {
  job_fit: "직무 적합도",
  logic: "논리성",
  game_sense: "게임 센스",
  attitude: "태도",
  communication: "소통 능력"
};

// 직군 카테고리
export const 사무직군 = [
  "사업PM",
  "해외사업",
  "마케팅",
  "게임기획",
  "게임운영(서비스)",
  "QA",
  "데이터분석",
  "개발PM",
  "서비스기획",
  "전략기획"
];

export const 개발직군 = [
  "프로그래머",
  "엔지니어",
  "UI/UX",
  "애니메이션",
  "사운드"
];

// 기술 질문이 없는 직군
export const 기술질문없는직군 = ["UI/UX", "애니메이션", "사운드"];

// ========================================
// 점수 구간 정의
// ========================================

export const SCORE_BANDS = {
  excellent: { min: 90, max: 100, label: '탁월' },
  good: { min: 80, max: 89, label: '우수' },
  average: { min: 70, max: 79, label: '양호' },
  below: { min: 60, max: 69, label: '미흡' },
  poor: { min: 0, max: 59, label: '부족' },
} as const;

// ========================================
// 게임 면접 평가 기준표 (Rubric)
// ========================================

export const GAME_INTERVIEW_RUBRIC = {
  job_fit: {
    name: '직무 적합도',
    weight: 0.25,
    criteria: {
      excellent: '지원 직군에 필요한 역량과 경험이 완벽히 매칭. 구체적 프로젝트/성과 사례로 입증.',
      good: '직무 이해도가 높고, 관련 경험을 구체적으로 제시함.',
      average: '직무에 대한 기본적 이해는 있으나 경험 연결이 약함.',
      below: '직무 이해가 부족하거나 경험이 추상적임.',
      poor: '직무와 전혀 관련 없는 답변이거나 이해도가 매우 낮음.',
    },
  },
  logic: {
    name: '논리성',
    weight: 0.2,
    criteria: {
      excellent: 'STAR 구조 완벽. 상황-역할-행동-결과가 모두 구체적이고 일관됨.',
      good: '논리적 구조가 있고, 답변이 일관성 있음.',
      average: '논리적 흐름은 있으나 구조화가 부족함.',
      below: '답변이 두서없거나 논리적 연결이 약함.',
      poor: '논리가 전혀 없거나 질문 의도를 벗어남.',
    },
  },
  game_sense: {
    name: '게임 센스',
    weight: 0.25,
    criteria: {
      excellent: '게임 산업 트렌드, BM, 유저 심리 등에 대한 깊은 이해. 구체적 사례와 인사이트 제시.',
      good: '게임 산업에 대한 이해도가 높고, 관련 게임 경험이 풍부함.',
      average: '게임을 좋아하지만 산업적 관점의 이해는 부족함.',
      below: '게임 경험은 있으나 분석적 관점이 부족함.',
      poor: '게임에 대한 이해도가 매우 낮거나 관심이 없어 보임.',
    },
  },
  attitude: {
    name: '태도',
    weight: 0.15,
    criteria: {
      excellent: '열정적이고 적극적인 태도. 회사와 직무에 대한 진심 어린 관심 표현.',
      good: '긍정적인 태도와 성실한 자세가 답변에서 드러남.',
      average: '기본적인 예의와 태도는 갖춤.',
      below: '소극적이거나 자신감이 부족함.',
      poor: '불성실하거나 부정적인 태도.',
    },
  },
  communication: {
    name: '소통 능력',
    weight: 0.15,
    criteria: {
      excellent: '명확하고 간결한 전달. 핵심을 정확히 짚고, 적절한 예시 활용.',
      good: '의사 전달이 명확하고 이해하기 쉬움.',
      average: '설명은 되나 장황하거나 핵심이 불명확함.',
      below: '의사 전달이 어렵거나 답변이 너무 짧음.',
      poor: '의사소통이 거의 안 됨.',
    },
  },
} as const;

// ========================================
// STAR 분석 기준
// ========================================

export const STAR_RUBRIC = {
  situation: {
    name: '상황(S)',
    criteria: {
      excellent: '구체적인 시간, 장소, 배경, 관련 인원 등이 명확. 청자가 상황을 선명히 그릴 수 있음.',
      good: '상황 설명이 있고 배경 이해 가능.',
      average: '상황은 언급했으나 구체성 부족.',
      poor: '상황 설명 없이 바로 행동이나 결과로 넘어감.',
    },
  },
  task: {
    name: '역할(T)',
    criteria: {
      excellent: '본인의 역할, 책임 범위, 목표가 명확히 정의됨.',
      good: '본인의 역할이 언급됨.',
      average: '역할이 모호하거나 팀 전체로 뭉뚱그림.',
      poor: '본인의 역할 언급 없음.',
    },
  },
  action: {
    name: '행동(A)',
    weight: 0.4, // Action이 가장 중요
    criteria: {
      excellent: '본인이 취한 구체적 행동을 단계별로 설명. 방법론, 도구, 직접 인용 포함.',
      good: '본인의 행동이 구체적으로 설명됨.',
      average: '행동은 언급했으나 "열심히 했다" 수준으로 추상적.',
      poor: '본인의 행동 없이 상황이나 결과만 언급.',
    },
  },
  result: {
    name: '결과(R)',
    criteria: {
      excellent: '정량적 성과(수치, %) 또는 정성적 변화가 구체적. 배운 점까지 언급.',
      good: '결과가 명확히 제시됨.',
      average: '결과는 있으나 모호하거나 본인 기여도 불명확.',
      poor: '결과 언급 없이 행동에서 끝남.',
    },
  },
} as const;

// ========================================
// 합격 예측 기준
// ========================================

export const PASS_PREDICTION_CRITERIA = {
  pass: { min: 80, label: '합격', description: '전반적으로 우수하며 게임 센스가 돋보임.' },
  borderline: { min: 65, label: '합격 보류 (B+)', description: '기본기는 갖췄으나 차별화 요소 부족.' },
  fail: { min: 0, label: '불합격', description: '핵심 역량 부족 또는 준비 부족.' },
} as const;


