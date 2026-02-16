/**
 * 대화 상태 추적 시스템
 * - 꼬리질문 카운트
 * - 주제 유사성 판별
 * - 답변 구체성 분석
 */

import type { ConversationState } from './types';
import { extractKeywords, extractCoreNouns } from './questionDedup';

// 성의 없는 답변 패턴
const LOW_EFFORT_PATTERNS = [
  /^(네|예|아니요|아니오|글쎄요|음|잘\s*모르겠)/,
  /모르겠습니다/,
  /모르겠어요/,
  /잘\s*모르/,
  /생각해\s*본\s*적\s*(없|이\s*없)/,
  /경험이?\s*(없|이\s*없)/,
  /특별히\s*(없|이\s*없)/,
  /딱히\s*(없|이\s*없)/,
  /그런\s*건\s*(없|이\s*없)/,
  /패스/,
  /넘어가/,
];

// 면접 무관 발언 패턴
const OFF_TOPIC_PATTERNS = [
  /연봉|급여|월급|시급/,
  /화장실|점심|식사|쉬는/,
  /네\s*(당신|너)\s*(는|가)\s*(AI|인공지능|챗봇|GPT)/,
  /AI\s*(아니|맞|인가|야|이지|입니까)/,
  /지하철|버스|교통|출퇴근/,
];

// 게임업계 행동 동사 (구체성 판별용)
const ACTION_VERBS = [
  '개발했', '기획했', '분석했', '운영했', '설계했', '구현했',
  '테스트했', '출시했', '론칭했', '배포했', '최적화했',
  '개선했', '리드했', '관리했', '조율했', '협업했',
  '달성했', '증가시', '감소시', '해결했', '도입했',
  '제안했', '실행했', '모니터링', '평가했', '검증했',
];

// 수치 패턴
const NUMERIC_PATTERNS = [
  /\d+%/, // 퍼센트
  /\d+명/, // 인원
  /\d+개월/, // 기간
  /\d+년/, // 연도
  /\d+만/, // 금액
  /\d+억/, // 금액
  /\d+건/, // 건수
  /DAU\s*\d+/, /MAU\s*\d+/, /ARPU/, /ARPPU/,
];

/**
 * 두 텍스트의 주제 유사성 판별 (키워드 기반)
 */
export function isSimilarTopic(text1: string, text2: string): boolean {
  const kw1 = extractKeywords(text1);
  const kw2 = extractKeywords(text2);

  if (kw1.length === 0 || kw2.length === 0) return false;

  const overlap = kw1.filter((k) => kw2.includes(k));
  const overlapRatio = overlap.length / Math.min(kw1.length, kw2.length);

  // 키워드 40% 이상 겹치면 유사 주제
  if (overlapRatio >= 0.4) return true;

  // 핵심 명사 2개 이상 겹치면 유사 주제
  const nouns1 = extractCoreNouns(text1);
  const nouns2 = extractCoreNouns(text2);
  const nounOverlap = nouns1.filter((n) => nouns2.includes(n));

  return nounOverlap.length >= 2;
}

/**
 * 성의 없는 답변 감지
 */
export function isLowEffortAnswer(answer: string): boolean {
  const trimmed = answer.trim();

  // 20자 미만
  if (trimmed.length < 20) return true;

  // 성의 없는 패턴 매칭
  for (const pattern of LOW_EFFORT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // 면접 무관 발언
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/**
 * 답변 구체성 점수 (0-100)
 */
export function analyzeAnswerSpecificity(answer: string): number {
  let score = 50; // 기본점수

  const trimmed = answer.trim();

  // 길이 점수 (최대 +20)
  if (trimmed.length >= 200) score += 20;
  else if (trimmed.length >= 100) score += 10;
  else if (trimmed.length < 30) score -= 20;

  // 행동 동사 사용 (+5 per verb, max +15)
  let verbCount = 0;
  for (const verb of ACTION_VERBS) {
    if (trimmed.includes(verb)) verbCount++;
  }
  score += Math.min(verbCount * 5, 15);

  // 수치 사용 (+8 per numeric, max +15)
  let numericCount = 0;
  for (const pattern of NUMERIC_PATTERNS) {
    if (pattern.test(trimmed)) numericCount++;
  }
  score += Math.min(numericCount * 8, 15);

  // 구체적 경험 언급 (+10)
  if (/프로젝트|포트폴리오|경험|사례|했을\s*때|했던/.test(trimmed)) {
    score += 10;
  }

  // STAR 구조 요소 (+5 per element)
  if (/상황|배경|당시/.test(trimmed)) score += 5;
  if (/역할|담당|맡/.test(trimmed)) score += 5;
  if (/행동|조치|실행|시도/.test(trimmed)) score += 5;
  if (/결과|성과|달성|효과/.test(trimmed)) score += 5;

  // 성의 없는 답변이면 큰 감점
  if (isLowEffortAnswer(trimmed)) score -= 30;

  return Math.max(0, Math.min(100, score));
}

/**
 * 대화 상태 추출
 * 전체 메시지를 분석하여 현재 꼬리질문 상태, 주제, 저품질 답변 연속 횟수 등을 반환
 */
export function extractConversationState(
  messages: Array<{ role: string; content: string }>
): ConversationState {
  const state: ConversationState = {
    followupCount: 0,
    lastQuestionTopic: '',
    lowEffortStreak: 0,
    mainQuestionIndex: 0,
  };

  if (messages.length === 0) return state;

  // 역순으로 탐색하며 연속 꼬리질문 수와 주제 추적
  let lastAssistantMsg = '';
  let consecutiveSameTopic = 0;
  let lowEffortStreak = 0;

  // 최근 메시지 쌍(assistant→user)을 역순으로 분석
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === 'assistant' && !lastAssistantMsg) {
      lastAssistantMsg = msg.content;
      state.lastQuestionTopic = msg.content;
    }

    if (msg.role === 'user') {
      if (isLowEffortAnswer(msg.content)) {
        lowEffortStreak++;
      } else {
        break; // 성의 있는 답변이 나오면 streak 종료
      }
    }
  }

  state.lowEffortStreak = lowEffortStreak;

  // 연속 같은 주제 꼬리질문 수 계산
  if (messages.length >= 2) {
    const assistantMessages = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content);

    if (assistantMessages.length >= 2) {
      const latest = assistantMessages[assistantMessages.length - 1];

      for (let i = assistantMessages.length - 2; i >= 0; i--) {
        if (isSimilarTopic(latest, assistantMessages[i])) {
          consecutiveSameTopic++;
        } else {
          break;
        }
      }
    }
  }

  state.followupCount = consecutiveSameTopic;

  // 메인 질문 인덱스 (assistant 메시지 수 기반)
  state.mainQuestionIndex = messages.filter((m) => m.role === 'assistant').length;

  return state;
}
