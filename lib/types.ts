/**
 * 게임 면접 앱 타입 정의
 */

// ========================================
// 공통 메시지 타입
// ========================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// ========================================
// 면접 데이터 타입
// ========================================

export interface InterviewData {
  공통_평가_기준?: string[];
  직군별_데이터?: Record<string, {
    필수_키워드?: string[];
    기출_질문?: string[];
  }>;
  공통_인성_질문?: {
    조직적합도?: string[];
    직무로열티?: string[];
    문제해결?: string[];
    자기관리?: string[];
    가치관?: string[];
    상황대처?: string[];
  };
}

// ========================================
// 스트리밍 관련 타입
// ========================================

export type SSEEventType =
  | 'start'              // 분석 시작
  | 'star_check'         // STAR 분석 완료
  | 'summary_progress'   // 종합 분석 진행 중
  | 'summary_streaming'  // 종합 분석 GPT 스트리밍
  | 'summary'            // 종합 분석 완료
  | 'detail_streaming'   // 상세 분석 GPT 스트리밍
  | 'detail_progress'    // 상세 분석 진행 중
  | 'detail'             // 질문별 상세 분석
  | 'complete'           // 전체 완료
  | 'error';             // 에러

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  progress?: number;  // 0-100 진행률
}

// StreamingReportState는 GameInterviewReport 아래에 정의됨

// ========================================
// 리포트 관련 타입
// ========================================

export interface ScoreDetailItem {
  score: number;
  reason: string;
  key_answer: string;
  improvement_priority: 'high' | 'medium' | 'low';
}

export interface StarAnalysisDetail {
  score: number;
  found: string;
  feedback: string;
}

export interface EvaluationDetail {
  strengths: string[];
  weaknesses: string[];
}

export interface ImprovementDetail {
  specific_tips: string[];
  model_answer_example: string;
}

export interface PremiumFeedbackItem {
  question_number: number;
  question: string;
  question_type?: '경험형' | '상황형';
  answer_summary: string;
  score: number;

  // STAR 분석 (경험형 질문)
  star_analysis?: {
    situation: StarAnalysisDetail;
    task: StarAnalysisDetail;
    action: StarAnalysisDetail;
    result: StarAnalysisDetail;
  };

  // 평가 및 개선
  evaluation: EvaluationDetail;
  improvement: ImprovementDetail;
}

export interface OverallSummary {
  total_evaluation: string;
  core_strength: string;
  critical_improvement: string;
  interview_style_analysis: string;
  next_step_checklist: string[];
  expected_followup_questions: string[];
}

export interface BestWorstAnalysis {
  question_number: number;
  question: string;
  answer: string;
  score: number;
  why_best?: string[];
  rewrite_example?: string;
}

export interface GameInterviewReport {
  total_score: number;
  pass_prediction: string;
  summary_title: string;

  scores: {
    job_fit: number;
    logic: number;
    game_sense: number;
    attitude: number;
    communication: number;
  };

  scores_detail?: Record<string, ScoreDetailItem>;

  feedback: {
    good_points: string[];
    bad_points: string[];
    improvement_guide: string;
  };

  // STAR 분석 요약
  star_analysis?: {
    situation: number;
    task: number;
    action: number;
    result: number;
  };

  // 상세 분석
  detailed_feedback: PremiumFeedbackItem[];
  overall_summary?: OverallSummary;
  best_answer_analysis?: BestWorstAnalysis;
  worst_answer_analysis?: BestWorstAnalysis;

  // 레거시 호환
  detailed_feedback_markdown?: string;

}

export interface StreamingReportState {
  isStreaming: boolean;
  progress: number;
  currentStep: string;
  partialReport: GameInterviewReport | null;
  error?: string;
  missingQuestions?: number[];  // 분석되지 않은 질문 번호
  totalQuestions?: number;      // 전체 질문 수
}

// ========================================
// STAR 분석기 타입
// ========================================

export interface STARScore {
  situation: number;
  task: number;
  action: number;
  result: number;
  overall: number;
  warnings: string[];
  strengths: string[];
}

export interface ActionDetail {
  method: boolean;   // 방법론 언급 여부
  tool: boolean;     // 도구 언급 여부
  phrase: boolean;   // 직접 인용 ("~라고 말했습니다")
  step: boolean;     // 순서 표현 (먼저, 그 다음)
}

export interface STARAnalysis {
  hasStructure: boolean;
  missingElements: ('S' | 'T' | 'A' | 'R')[];
  score: STARScore;
  actionDetail: ActionDetail;
  recommendation: string;
  grade: string;
}

// ========================================
// 대화 상태 추적 타입
// ========================================

export interface ConversationState {
  followupCount: number;       // 같은 주제 연속 꼬리질문 수
  lastQuestionTopic: string;   // 마지막 질문 주제
  lowEffortStreak: number;     // 성의 없는 답변 연속 횟수
  mainQuestionIndex: number;   // 현재 메인 질문 인덱스
}
