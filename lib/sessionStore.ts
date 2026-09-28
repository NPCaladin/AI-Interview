/**
 * 면접 세션 저장 (server-only)
 * - interview_sessions / interview_messages 영속화
 * - 모든 함수는 에러를 삼키고 logger.warn 만 남긴다 (저장 실패가 면접을 막으면 안 됨)
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { GameInterviewReport } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGE_CHUNK_SIZE = 100;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(err);
}

async function lookupStudentName(studentId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('name')
      .eq('id', studentId)
      .maybeSingle();
    if (error) {
      logger.warn('[sessionStore] 학생 이름 조회 실패:', error.message);
      return null;
    }
    const name = (data as { name?: unknown } | null)?.name;
    return typeof name === 'string' ? name : null;
  } catch (err) {
    logger.warn('[sessionStore] 학생 이름 조회 예외:', errMsg(err));
    return null;
  }
}

export async function createSession(p: {
  id: string;
  studentId: string;
  studentCode: string;
  jobName: string;
  companyName: string;
  isDev: boolean;
}): Promise<void> {
  try {
    const studentName = await lookupStudentName(p.studentId);
    const { error } = await supabase.from('interview_sessions').insert({
      id: p.id,
      student_id: p.studentId,
      student_code: p.studentCode,
      student_name: studentName,
      job_name: p.jobName,
      company_name: p.companyName,
      is_dev: p.isDev,
      status: 'in_progress',
    });
    if (error && error.code !== '23505') {
      logger.warn('[sessionStore] 세션 생성 실패:', error.message);
    }
  } catch (err) {
    logger.warn('[sessionStore] 세션 생성 예외:', errMsg(err));
  }
}

export async function bumpSession(p: {
  id: string;
  studentId: string;
  questionCount: number;
  promptTokens: number;
  completionTokens: number;
  ended: boolean;
}): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('bump_session_progress', {
      p_session_id: p.id,
      p_student_id: p.studentId,
      p_question_count: p.questionCount,
      p_prompt_tokens: p.promptTokens,
      p_completion_tokens: p.completionTokens,
      p_ended: p.ended,
    });
    if (error) {
      logger.warn('[sessionStore] 세션 진행 갱신 실패:', error.message);
    } else if (typeof data === 'number' && data === 0) {
      // 세션 행이 없음(createSession 실패 또는 소유자 불일치) — 진행 기록이 조용히 사라지는 것을 가시화
      logger.warn('[sessionStore] 세션 진행 갱신 대상 없음:', p.id);
    }
  } catch (err) {
    logger.warn('[sessionStore] 세션 진행 갱신 예외:', errMsg(err));
  }
}

type ReportMeta = {
  total_questions?: number;
  analyzed_questions?: number;
  missing_questions?: number[];
};

export async function saveSessionAnalysis(p: {
  sessionId: string | null;
  studentId: string;
  studentCode: string;
  jobName: string;
  companyName: string;
  report: GameInterviewReport & { _meta?: ReportMeta };
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  promptTokens: number;
  completionTokens: number;
  model: string;
  isDev: boolean;
}): Promise<{ saved: boolean; sessionId: string | null }> {
  try {
    const { _meta, ...reportWithoutMeta } = p.report;
    const now = new Date().toISOString();

    const payload = {
      total_score: Math.round(Number(p.report.total_score) || 0),
      scores: p.report.scores ?? null,
      pass_prediction: p.report.pass_prediction ?? null,
      summary_title: p.report.summary_title ?? null,
      analyzed_questions: _meta?.analyzed_questions ?? p.report.detailed_feedback?.length ?? null,
      missing_questions: _meta?.missing_questions ?? null,
      report: reportWithoutMeta,
      analysis_prompt_tokens: p.promptTokens,
      analysis_completion_tokens: p.completionTokens,
      model: p.model,
      status: 'analyzed' as const,
      analysis_completed_at: now,
    };

    let sessionId: string | null = null;

    if (isUuid(p.sessionId)) {
      const { data: found, error: selError } = await supabase
        .from('interview_sessions')
        .select('id, report_version, ended_at')
        .eq('id', p.sessionId)
        .eq('student_id', p.studentId)
        .maybeSingle();
      if (selError) {
        logger.warn('[sessionStore] 세션 조회 실패:', selError.message);
        return { saved: false, sessionId: null };
      }
      const row = found as { id: string; report_version: number | null; ended_at: string | null } | null;
      if (row) {
        // 낙관적 락: 같은 세션에 동시 재분석이 들어와도 report_version 이 소실되지 않도록
        // 읽은 버전과 일치하는 행만 갱신하고, 0건이면 재조회 후 1회 재시도
        let expected = row.report_version ?? 0;
        let endedAt = row.ended_at;
        for (let attempt = 0; attempt < 2 && !sessionId; attempt++) {
          const { data: updated, error: updError } = await supabase
            .from('interview_sessions')
            .update({
              ...payload,
              report_version: expected + 1,
              ...(endedAt === null && { ended_at: now }),
            })
            .eq('id', row.id)
            .eq('student_id', p.studentId)
            .eq('report_version', expected)
            .select('id');
          if (updError) {
            logger.warn('[sessionStore] 세션 분석 결과 갱신 실패:', updError.message);
            return { saved: false, sessionId: null };
          }
          if (updated && updated.length > 0) {
            sessionId = row.id;
            break;
          }
          // 버전 충돌 → 최신 버전 재조회
          const { data: latest } = await supabase
            .from('interview_sessions')
            .select('report_version, ended_at')
            .eq('id', row.id)
            .maybeSingle();
          const l = latest as { report_version: number | null; ended_at: string | null } | null;
          if (!l) break;
          expected = l.report_version ?? 0;
          endedAt = l.ended_at;
          logger.warn('[sessionStore] report_version 충돌, 재시도:', row.id, expected);
        }
        if (!sessionId) {
          logger.warn('[sessionStore] 세션 분석 결과 갱신 재시도 실패:', row.id);
          return { saved: false, sessionId: null };
        }
      } else {
        logger.warn('[sessionStore] 원본 세션 미발견(소유자 불일치 또는 생성 실패) — 신규 세션으로 대체 저장:', p.sessionId);
      }
    }

    if (!sessionId) {
      const newId = crypto.randomUUID();
      const studentName = await lookupStudentName(p.studentId);
      const { error: insError } = await supabase.from('interview_sessions').insert({
        id: newId,
        student_id: p.studentId,
        student_code: p.studentCode,
        student_name: studentName,
        job_name: p.jobName,
        company_name: p.companyName,
        is_dev: p.isDev,
        started_at: now,
        ended_at: now,
        question_count: _meta?.total_questions ?? p.messages.filter(m => m.role === 'assistant').length,
        report_version: 1,
        ...payload,
      });
      if (insError) {
        logger.warn('[sessionStore] 세션 분석 결과 삽입 실패:', insError.message);
        return { saved: false, sessionId: null };
      }
      sessionId = newId;
    }

    // 대화 저장 (실패해도 saved:true 유지)
    try {
      const rows = p.messages
        .filter(m => typeof m.content === 'string' && m.content.length > 0)
        .map((m, i) => ({
          session_id: sessionId as string,
          turn_index: i,
          role: m.role,
          content: m.content,
        }));
      for (let i = 0; i < rows.length; i += MESSAGE_CHUNK_SIZE) {
        const chunk = rows.slice(i, i + MESSAGE_CHUNK_SIZE);
        const { error: msgError } = await supabase
          .from('interview_messages')
          .upsert(chunk, { onConflict: 'session_id,turn_index', ignoreDuplicates: true });
        if (msgError) {
          logger.warn('[sessionStore] 대화 저장 실패:', msgError.message);
          break;
        }
      }
    } catch (err) {
      logger.warn('[sessionStore] 대화 저장 예외:', errMsg(err));
    }

    return { saved: true, sessionId };
  } catch (err) {
    logger.warn('[sessionStore] 분석 결과 저장 예외:', errMsg(err));
    return { saved: false, sessionId: null };
  }
}
