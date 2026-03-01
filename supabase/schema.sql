-- =============================================
-- 수강생 인증 + 주간 사용 제한 스키마
-- Supabase SQL Editor에서 실행
-- =============================================
-- =============================================
-- 면접 데이터 + 크로스 세션 중복 방지 스키마
-- (schema.sql 하단에 추가 실행)
-- =============================================

-- 직군 메타데이터 (20행)
CREATE TABLE IF NOT EXISTS interview_jobs (
  job_name TEXT PRIMARY KEY,
  keywords TEXT[] NOT NULL DEFAULT '{}'
);

-- 기출 질문 (~4,300행)
-- raw_text = "[넥슨] 질문내용" 원본, question = 태그 제거 텍스트
CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL REFERENCES interview_jobs(job_name) ON DELETE CASCADE,
  question TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interview_questions_job ON interview_questions(job_name);

-- 인성 질문 (24행)
CREATE TABLE IF NOT EXISTS interview_personality_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personality_category ON interview_personality_questions(category);

-- 평가 기준 (4행)
CREATE TABLE IF NOT EXISTS interview_eval_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 세션 질문 이력 (크로스 세션 중복 방지)
CREATE TABLE IF NOT EXISTS session_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  job_name TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'job',  -- 'job' | 'personality'
  question_number INTEGER NOT NULL DEFAULT 0,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_session_questions_student_job ON session_questions(student_id, job_name);
CREATE INDEX IF NOT EXISTS idx_session_questions_student_session ON session_questions(student_id, session_id);

-- 1. 테이블 생성
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  weekly_limit INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_code ON students(code);

CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_logs_student_week ON usage_logs(student_id, week_start);

-- 2. 주간 시작일 계산 헬퍼 (월요일 기준)
CREATE OR REPLACE FUNCTION current_week_start()
RETURNS DATE AS $$
  SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date;
$$ LANGUAGE sql STABLE;

-- 3. 사용량 조회 RPC
CREATE OR REPLACE FUNCTION get_weekly_remaining(p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  SELECT weekly_limit INTO v_limit
  FROM students
  WHERE id = p_student_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND');
  END IF;

  SELECT COUNT(*)::integer INTO v_used
  FROM usage_logs
  WHERE student_id = p_student_id
    AND week_start = current_week_start();

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_limit - v_used,
    'limit', v_limit,
    'used', v_used
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. 사용량 소진 RPC (atomic, 비관적 잠금)
CREATE OR REPLACE FUNCTION consume_usage(p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_limit INTEGER;
  v_active BOOLEAN;
  v_used INTEGER;
  v_week DATE;
BEGIN
  v_week := current_week_start();

  -- 비관적 잠금 (FOR UPDATE)
  SELECT weekly_limit, is_active INTO v_limit, v_active
  FROM students
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND');
  END IF;

  IF NOT v_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'INACTIVE');
  END IF;

  SELECT COUNT(*)::integer INTO v_used
  FROM usage_logs
  WHERE student_id = p_student_id
    AND week_start = v_week;

  IF v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'WEEKLY_LIMIT_REACHED',
      'remaining', 0,
      'limit', v_limit,
      'used', v_used
    );
  END IF;

  -- 사용량 기록
  INSERT INTO usage_logs (student_id, week_start)
  VALUES (p_student_id, v_week);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_limit - v_used - 1,
    'limit', v_limit,
    'used', v_used + 1
  );
END;
$$ LANGUAGE plpgsql;
