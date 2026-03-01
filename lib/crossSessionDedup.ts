/**
 * 크로스 세션 중복 방지
 * - 최근 3개 세션의 질문 이력 조회
 * - 세션별 질문 기록
 */

import { supabase } from './supabase';
import { logger } from './logger';
import { extractQuestionCore } from './questionDedup';

const MAX_RECENT_SESSIONS = 3;

/**
 * 학생의 최근 3개 세션에서 사용된 질문 텍스트 목록 반환
 * DB 에러 시 빈 배열 (graceful degradation)
 */
export async function getRecentlyAskedQuestions(
  studentId: string,
  jobName: string
): Promise<string[]> {
  try {
    // 최근 질문 이력 조회 (충분한 행을 가져와 고유 세션 ID 추출)
    const { data: rows, error } = await supabase
      .from('session_questions')
      .select('session_id, question_text, asked_at')
      .eq('student_id', studentId)
      .eq('job_name', jobName)
      .order('asked_at', { ascending: false })
      .limit(MAX_RECENT_SESSIONS * 30);

    if (error || !rows || rows.length === 0) return [];

    // 고유 세션 ID 최대 3개 추출 (최신 순)
    const seen = new Set<string>();
    const recentSessionIds: string[] = [];
    for (const row of rows) {
      if (!seen.has(row.session_id)) {
        seen.add(row.session_id);
        recentSessionIds.push(row.session_id);
        if (recentSessionIds.length >= MAX_RECENT_SESSIONS) break;
      }
    }

    if (recentSessionIds.length === 0) return [];

    // 해당 세션들의 질문 텍스트만 수집
    const questions = rows
      .filter((r) => recentSessionIds.includes(r.session_id))
      .map((r) => r.question_text);

    return questions;
  } catch {
    logger.error('[CrossSessionDedup] getRecentlyAskedQuestions 오류 — 빈 배열 반환');
    return [];
  }
}

/**
 * AI 응답에서 질문을 추출하여 session_questions 테이블에 기록
 * fire-and-forget: await 하지 않아도 됨
 */
export async function recordSessionQuestion(
  studentId: string,
  sessionId: string,
  jobName: string,
  aiResponse: string,
  questionType: 'job' | 'personality',
  questionNumber: number
): Promise<void> {
  try {
    const questions = extractQuestionCore(aiResponse);
    if (questions.length === 0) return;

    // 첫 번째 추출 질문을 대표 텍스트로 저장
    const questionText = questions[0];

    const { error } = await supabase.from('session_questions').insert({
      student_id: studentId,
      session_id: sessionId,
      job_name: jobName,
      question_text: questionText,
      question_type: questionType,
      question_number: questionNumber,
    });

    if (error) {
      logger.error('[CrossSessionDedup] recordSessionQuestion insert 오류');
    }
  } catch {
    logger.error('[CrossSessionDedup] recordSessionQuestion 예외 — 무시');
  }
}
