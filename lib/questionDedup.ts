/**
 * 질문 중복 방지 유틸리티
 * - AI 응답에서 질문 추출
 * - 키워드/명사 기반 유사도 비교
 * - 블랙리스트 생성
 */
import { MAX_BLOCKLIST_QUESTIONS } from './constants';

// 불용어 목록 (한국어)
const STOP_WORDS = new Set([
  '그', '이', '저', '것', '수', '등', '및', '또', '에', '의', '를', '을',
  '은', '는', '이', '가', '와', '과', '로', '으로', '에서', '까지', '부터',
  '보다', '처럼', '만큼', '대해', '위해', '통해', '대한', '관한', '따른',
  '있는', '없는', '하는', '되는', '있다', '없다', '한다', '된다', '했다',
  '합니다', '합니까', '하세요', '해주세요', '말씀', '생각', '경우',
  '어떤', '어떻게', '무엇', '왜', '어디', '언제', '얼마나',
  '그럼', '그렇다면', '그런데', '하지만', '그래서', '따라서',
  '좀', '더', '매우', '정말', '아주', '다시', '바로', '잘',
  '면접', '질문', '답변', '말씀해', '설명해', '이야기해',
]);

// 게임업계 핵심 명사 패턴
const CORE_NOUN_PATTERNS = [
  '게임', '유저', '매출', 'BM', 'KPI', '패치', '개발', '마케팅',
  '기획', '운영', '서비스', '론칭', '라이브', '업데이트', '밸런스',
  '콘텐츠', 'DAU', 'MAU', 'ARPU', 'ARPPU', '리텐션', '이탈',
  '과금', '가챠', '시즌', '이벤트', 'PvP', 'PvE', 'MMORPG', 'RPG',
  'FPS', '모바일', 'PC', '콘솔', '크로스플랫폼', '글로벌',
  '프로젝트', '팀', '협업', '갈등', '리더', '소통', '커뮤니케이션',
  '포트폴리오', '경험', '성과', '목표', '전략', '분석', '데이터',
  '프로그래밍', '엔진', 'Unity', 'Unreal', 'QA', '버그', '테스트',
  '지원동기', '직무', '역량', '강점', '약점', '성장', '비전',
  '문제해결', '의사결정', '우선순위', '일정', '마감',
  '해외', '시장', '경쟁', '트렌드', '벤치마킹',
  '넥슨', '넷마블', '크래프톤', '스마일게이트', '엔씨',
];

/**
 * AI 응답에서 핵심 질문문 추출
 * 물음표로 끝나는 문장 또는 "~해주세요" 같은 요청문 패턴 매칭
 */
export function extractQuestionCore(text: string): string[] {
  const questions: string[] = [];

  // 물음표로 끝나는 문장 추출
  const questionMatches = text.match(/[^.!?\n]*\?/g);
  if (questionMatches) {
    for (const q of questionMatches) {
      const trimmed = q.trim();
      if (trimmed.length > 5) {
        questions.push(trimmed);
      }
    }
  }

  // "~해주세요", "~부탁드립니다" 같은 요청문 추출
  const requestMatches = text.match(/[^.!?\n]*(?:해주세요|부탁드립니다|말씀해\s*주세요|설명해\s*주세요|이야기해\s*주세요)[.!]?/g);
  if (requestMatches) {
    for (const r of requestMatches) {
      const trimmed = r.trim();
      if (trimmed.length > 5) {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}

/**
 * 전체 assistant 메시지에서 질문 목록 추출
 */
export function extractUsedQuestions(
  messages: Array<{ role: string; content: string }>
): string[] {
  const allQuestions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const questions = extractQuestionCore(msg.content);
      allQuestions.push(...questions);
    }
  }

  return allQuestions;
}

/**
 * 불용어 제거 후 키워드 추출
 */
export function extractKeywords(text: string): string[] {
  // 한국어 + 영어 단어 추출 (2글자 이상)
  const words = text.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) || [];
  return words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
}

/**
 * 게임업계 핵심 명사 추출
 */
export function extractCoreNouns(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const noun of CORE_NOUN_PATTERNS) {
    if (lowerText.includes(noun.toLowerCase())) {
      found.push(noun);
    }
  }

  return Array.from(new Set(found));
}

/**
 * 4단계 유사도 검사
 * 1. 정확 일치
 * 2. 포함 관계
 * 3. 키워드 2개+ 일치
 * 4. 핵심 명사 2개+ 일치
 */
export function isSimilarQuestion(q1: string, q2: string): boolean {
  const norm1 = q1.replace(/\s+/g, ' ').trim().toLowerCase();
  const norm2 = q2.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1단계: 정확 일치
  if (norm1 === norm2) return true;

  // 2단계: 한쪽이 다른 쪽에 70% 이상 포함
  const shorter = norm1.length < norm2.length ? norm1 : norm2;
  const longer = norm1.length < norm2.length ? norm2 : norm1;
  if (longer.includes(shorter) && shorter.length / longer.length > 0.5) {
    return true;
  }

  // 3단계: 키워드 2개 이상 일치
  const kw1 = extractKeywords(q1);
  const kw2 = extractKeywords(q2);
  const kwOverlap = kw1.filter((k) => kw2.includes(k));
  if (kwOverlap.length >= 2 && kwOverlap.length >= Math.min(kw1.length, kw2.length) * 0.5) {
    return true;
  }

  // 4단계: 핵심 명사 2개 이상 일치
  const nouns1 = extractCoreNouns(q1);
  const nouns2 = extractCoreNouns(q2);
  const nounOverlap = nouns1.filter((n) => nouns2.includes(n));
  if (nounOverlap.length >= 2) {
    return true;
  }

  return false;
}

/**
 * 이전 질문들을 블랙리스트 형태로 변환 (시스템 프롬프트에 삽입)
 */
export function buildUsedQuestionsBlocklist(
  messages: Array<{ role: string; content: string }>
): string {
  const usedQuestions = extractUsedQuestions(messages);

  if (usedQuestions.length === 0) return '';

  // 최대 N개까지만 표시 (프롬프트 길이 제한)
  const displayQuestions = usedQuestions.slice(-MAX_BLOCKLIST_QUESTIONS);

  const blocklist = displayQuestions
    .map((q, i) => `  ${i + 1}. "${q}"`)
    .join('\n');

  return `
## [질문 중복 방지 - 최우선 규칙] 🚫

**아래 질문들은 이미 사용된 질문입니다. 절대 동일하거나 유사한 질문을 다시 하지 마세요.**

${blocklist}

⚠️ 위 질문과 같은 의미의 질문, 같은 키워드를 사용한 질문, 같은 주제를 다른 표현으로 바꾼 질문 모두 금지합니다.
⚠️ 반드시 이전에 다루지 않은 새로운 주제와 새로운 관점의 질문을 하세요.
`;
}

/**
 * 새 AI 응답이 기존 질문과 중복되는지 검사
 * @returns 중복된 질문이 있으면 해당 질문 반환, 없으면 null
 */
export function checkDuplicateQuestion(
  newResponse: string,
  previousMessages: Array<{ role: string; content: string }>
): string | null {
  const newQuestions = extractQuestionCore(newResponse);
  const usedQuestions = extractUsedQuestions(previousMessages);

  for (const newQ of newQuestions) {
    for (const usedQ of usedQuestions) {
      if (isSimilarQuestion(newQ, usedQ)) {
        return usedQ;
      }
    }
  }

  return null;
}
