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
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_student_id ON usage_logs(student_id);

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

-- =============================================
-- ERP 학생 정보 연동 (2026-04-22 추가)
-- docs/ERP_연동_합의서_최종.md / supabase/migrations/erp_sync.sql
-- =============================================

-- students ALTER: ERP 소스 표시 + ERP updated_at 미러링
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='students' AND column_name='source'
  ) THEN
    ALTER TABLE students ADD COLUMN source TEXT
      CHECK (source IN ('legacy','manual','erp_migration','erp_sync'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='students' AND column_name='updated_at'
  ) THEN
    ALTER TABLE students ADD COLUMN updated_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- 재활성화 승인 큐
CREATE TABLE IF NOT EXISTS pending_reactivations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code VARCHAR(20) NOT NULL,
  student_id UUID NULL REFERENCES students(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('case1_new_code','case2_existing_code')),
  transition_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','merged')),
  linked_student_code VARCHAR(20) NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_reactivations_code_pending
  ON pending_reactivations(student_code) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_pending_reactivations_status
  ON pending_reactivations(status);
CREATE INDEX IF NOT EXISTS idx_pending_reactivations_created_at
  ON pending_reactivations(created_at DESC);

-- ERP sync 상태 (단일 행)
CREATE TABLE IF NOT EXISTS erp_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_updated_at TIMESTAMPTZ NULL,
  last_cursor TEXT NULL,
  last_run_at TIMESTAMPTZ NULL,
  last_success_at TIMESTAMPTZ NULL,
  is_running BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NULL
);
INSERT INTO erp_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ERP sync 실행 이력
CREATE TABLE IF NOT EXISTS erp_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  status TEXT NULL CHECK (status IN ('running','success','failed','partial')),
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  records_queued INTEGER NOT NULL DEFAULT 0,
  error_code TEXT NULL,
  error_snippet TEXT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_erp_sync_runs_started_at
  ON erp_sync_runs(started_at DESC);
