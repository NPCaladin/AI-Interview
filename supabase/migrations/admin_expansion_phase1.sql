-- =============================================
-- 어드민 보강 Phase 1 — 세션·메시지 저장, 감사 로그, students 보강
-- 실행: supabase-exec.ps1 -Ref falbyilzmryyrabnrctz -File supabase/migrations/admin_expansion_phase1.sql
-- 순서: 이 SQL 을 먼저 적용한 뒤 코드 배포 (consume_usage 새 인자는 DEFAULT NULL 이라 구코드도 동작)
-- 재실행 안전: IF NOT EXISTS / OR REPLACE 사용
-- 스펙: C:\Users\master\.claude\plans\structured-herding-tarjan.md §1-A
-- =============================================

BEGIN;

-- ---------------------------------------------
-- 1) 면접 세션 (id = 클라이언트 생성 UUID, useInterview sessionIdRef)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY,
  student_id UUID NULL REFERENCES students(id) ON DELETE SET NULL,
  student_code VARCHAR(20) NOT NULL,              -- 비정규화: 학생 삭제 후에도 이력 유지
  student_name VARCHAR(100) NULL,
  job_name TEXT NOT NULL,
  company_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','ended','analyzed')),
  question_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  analysis_completed_at TIMESTAMPTZ NULL,
  total_score INTEGER NULL,
  scores JSONB NULL,
  pass_prediction TEXT NULL,
  summary_title TEXT NULL,
  analyzed_questions INTEGER NULL,
  missing_questions INTEGER[] NULL,
  report JSONB NULL,                              -- GameInterviewReport 전체 (PDF 재발급용)
  report_version INTEGER NOT NULL DEFAULT 0,
  chat_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  chat_completion_tokens INTEGER NOT NULL DEFAULT 0,
  analysis_prompt_tokens INTEGER NULL,
  analysis_completion_tokens INTEGER NULL,
  model TEXT NULL,
  is_dev BOOLEAN NOT NULL DEFAULT false,          -- DEV-ADMIN / dev config 실행 → 통계 제외
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_student_started ON interview_sessions(student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_started ON interview_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_job_started ON interview_sessions(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_total_score ON interview_sessions(total_score) WHERE total_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interview_sessions_student_code ON interview_sessions(student_code);

-- ---------------------------------------------
-- 2) 면접 대화 (멱등 upsert 근거: UNIQUE(session_id, turn_index))
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS interview_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_index)
);

-- ---------------------------------------------
-- 3) usage_logs ↔ session 연결 + consume_usage 재정의
--    ⚠️ 인자가 바뀌므로 구 시그니처를 DROP (PostgREST 오버로드 잔존 방지)
-- ---------------------------------------------
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS session_id UUID NULL;
CREATE INDEX IF NOT EXISTS idx_usage_logs_session ON usage_logs(session_id) WHERE session_id IS NOT NULL;

DROP FUNCTION IF EXISTS consume_usage(uuid);

CREATE OR REPLACE FUNCTION consume_usage(p_student_id UUID, p_session_id UUID DEFAULT NULL)
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

  -- 사용량 기록 (세션 연결)
  INSERT INTO usage_logs (student_id, week_start, session_id)
  VALUES (p_student_id, v_week, p_session_id);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_limit - v_used - 1,
    'limit', v_limit,
    'used', v_used + 1
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 4) 세션 진행 갱신 RPC (chat 라우트 fire-and-forget, 소유권 검증)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION bump_session_progress(
  p_session_id UUID,
  p_student_id UUID,
  p_question_count INTEGER,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_ended BOOLEAN
) RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE interview_sessions
     SET question_count = GREATEST(question_count, COALESCE(p_question_count, 0)),
         chat_prompt_tokens = chat_prompt_tokens + COALESCE(p_prompt_tokens, 0),
         chat_completion_tokens = chat_completion_tokens + COALESCE(p_completion_tokens, 0),
         last_activity_at = now(),
         status = CASE WHEN p_ended AND status = 'in_progress' THEN 'ended' ELSE status END,
         ended_at = COALESCE(ended_at, CASE WHEN p_ended THEN now() ELSE NULL END)
   WHERE id = p_session_id
     AND student_id = p_student_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;  -- 0 이면 세션 행 없음(createSession 실패 등) → 호출부가 warn
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 5) 관리자 감사 로그 (actor 필수)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor VARCHAR(50) NOT NULL,
  action VARCHAR(40) NOT NULL,
  resource_type VARCHAR(30) NULL,
  resource_id TEXT NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  details JSONB NULL,
  ip_address INET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created ON admin_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_resource ON admin_audit_log(resource_type, resource_id, created_at DESC) WHERE resource_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created ON admin_audit_log(actor, created_at DESC);

-- ---------------------------------------------
-- 6) students 보강 (sync_exempt 는 운영 DB 에 이미 존재 — IF NOT EXISTS 로 무해)
-- ---------------------------------------------
ALTER TABLE students ADD COLUMN IF NOT EXISTS sync_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS sync_exempt_reason TEXT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS sync_exempt_until DATE NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_note TEXT NULL;

COMMIT;

-- 검증 쿼리 (실행 후 확인)
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('interview_sessions','interview_messages','admin_audit_log');
-- SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname IN ('consume_usage','bump_session_progress');
-- SELECT column_name FROM information_schema.columns WHERE table_name='students' AND column_name LIKE 'sync_exempt%' OR column_name='admin_note';
