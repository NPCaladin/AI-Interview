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


