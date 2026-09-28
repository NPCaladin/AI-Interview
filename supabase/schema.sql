-- =============================================
-- 수강생 인증 + 주간 사용 제한 스키마
-- Supabase SQL Editor에서 실행
-- =============================================

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

-- 4. 사용량 소진 RPC (atomic, 비관적 잠금) — 2026-09 Phase 1: session_id 연결
--    ⚠️ 인자가 바뀌므로 구 시그니처를 DROP (PostgREST 오버로드 잔존 방지)
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

-- =============================================
-- 어드민 보강 Phase 1 (2026-09 추가)
-- supabase/migrations/admin_expansion_phase1.sql
-- (usage_logs.session_id + consume_usage 2-arg 버전은 위 4번 섹션에 반영)
-- =============================================

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


-- =============================================
-- Phase 2: 어드민 통계 집계 RPC (supabase/migrations/admin_expansion_phase2.sql 와 동일)
-- =============================================
CREATE OR REPLACE FUNCTION admin_session_stats(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_job TEXT DEFAULT NULL,
  p_company TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH scoped AS (
    SELECT s.*,
           (s.status = 'analyzed' AND s.total_score IS NOT NULL) AS is_analyzed
      FROM interview_sessions s
     WHERE s.is_dev = false
       AND s.started_at >= p_from
       AND s.started_at < p_to
       AND (p_job IS NULL OR s.job_name = p_job)
       AND (p_company IS NULL OR s.company_name = p_company)
  ),
  analyzed AS (
    SELECT * FROM scoped WHERE is_analyzed
  ),
  totals AS (
    SELECT COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE is_analyzed)::int AS analyzed,
           COUNT(DISTINCT student_id)::int AS students,
           ROUND((AVG(total_score) FILTER (WHERE is_analyzed))::numeric, 1) AS avg_score,
           COALESCE(SUM(chat_prompt_tokens), 0)::bigint AS chat_in,
           COALESCE(SUM(chat_completion_tokens), 0)::bigint AS chat_out,
           COALESCE(SUM(analysis_prompt_tokens), 0)::bigint AS ana_in,
           COALESCE(SUM(analysis_completion_tokens), 0)::bigint AS ana_out
      FROM scoped
  ),
  pass AS (
    SELECT CASE
             WHEN pass_prediction LIKE '%불합격%' THEN '불합격'
             WHEN pass_prediction LIKE '%보류%' THEN '보류'
             WHEN pass_prediction LIKE '%합격%' THEN '합격'
             ELSE '불합격'
           END AS label,
           COUNT(*)::int AS n
      FROM analyzed
     GROUP BY 1
  ),
  by_job AS (
    SELECT job_name,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE is_analyzed)::int AS analyzed,
           ROUND((AVG(total_score) FILTER (WHERE is_analyzed))::numeric, 1) AS avg_score
      FROM scoped
     GROUP BY job_name
  ),
  by_company AS (
    SELECT COALESCE(company_name, 'N/A') AS company_name,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE is_analyzed)::int AS analyzed,
           ROUND((AVG(total_score) FILTER (WHERE is_analyzed))::numeric, 1) AS avg_score
      FROM scoped
     GROUP BY COALESCE(company_name, 'N/A')
  ),
  comp_values AS (
    SELECT e.key,
           CASE WHEN jsonb_typeof(e.value) = 'number' THEN (e.value #>> '{}')::numeric END AS v
      FROM analyzed a
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(a.scores) = 'object' THEN a.scores ELSE '{}'::jsonb END
      ) AS e(key, value)
     WHERE e.key IN ('job_fit', 'logic', 'game_sense', 'attitude', 'communication')
  ),
  comp AS (
    SELECT key,
           ROUND(AVG(CASE WHEN v <= 10 THEN v * 10 ELSE v END), 1) AS avg_v
      FROM comp_values
     WHERE v IS NOT NULL
     GROUP BY key
  ),
  hist AS (
    SELECT b.i AS bucket_idx,
           CASE WHEN b.i = 9 THEN '90-100'
                ELSE (b.i * 10)::text || '-' || (b.i * 10 + 9)::text END AS bucket,
           (SELECT COUNT(*)::int
              FROM analyzed a
             WHERE LEAST(GREATEST(FLOOR(a.total_score / 10.0), 0), 9) = b.i) AS cnt
      FROM generate_series(0, 9) AS b(i)
  ),
  daily AS (
    SELECT to_char((started_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD') AS d,
           COUNT(*)::int AS sessions,
           COUNT(*) FILTER (WHERE is_analyzed)::int AS analyzed
      FROM scoped
     GROUP BY 1
  ),
  q_values AS (
    SELECT (elem->>'question_number')::int AS question_number,
           (elem->>'score')::numeric AS v
      FROM analyzed a
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(a.report->'detailed_feedback') = 'array'
             THEN a.report->'detailed_feedback' ELSE '[]'::jsonb END
      ) AS elem
     WHERE jsonb_typeof(elem) = 'object'
       AND (elem->>'question_number') ~ '^[0-9]{1,6}$'
       AND (elem->>'score') ~ '^-?[0-9]+(\.[0-9]+)?$'
  ),
  per_q AS (
    SELECT question_number,
           ROUND(AVG(CASE WHEN v <= 10 THEN v * 10 ELSE v END), 1) AS avg_score,
           COUNT(*)::int AS n
      FROM q_values
     GROUP BY question_number
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'sessions', t.sessions,
        'analyzed', t.analyzed,
        'students', t.students,
        'avg_score', t.avg_score,
        'pass', jsonb_build_object(
          '합격', COALESCE((SELECT n FROM pass WHERE label = '합격'), 0),
          '보류', COALESCE((SELECT n FROM pass WHERE label = '보류'), 0),
          '불합격', COALESCE((SELECT n FROM pass WHERE label = '불합격'), 0)
        ),
        'tokens', jsonb_build_object(
          'chat_in', t.chat_in,
          'chat_out', t.chat_out,
          'ana_in', t.ana_in,
          'ana_out', t.ana_out
        )
      ) FROM totals t
    ),
    'by_job', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'job_name', j.job_name, 'sessions', j.sessions,
               'analyzed', j.analyzed, 'avg_score', j.avg_score
             ) ORDER BY j.sessions DESC, j.job_name)
        FROM by_job j
    ), '[]'::jsonb),
    'by_company', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'company_name', c.company_name, 'sessions', c.sessions,
               'analyzed', c.analyzed, 'avg_score', c.avg_score
             ) ORDER BY c.sessions DESC, c.company_name)
        FROM by_company c
    ), '[]'::jsonb),
    'competency_avg', jsonb_build_object(
      'job_fit', (SELECT avg_v FROM comp WHERE key = 'job_fit'),
      'logic', (SELECT avg_v FROM comp WHERE key = 'logic'),
      'game_sense', (SELECT avg_v FROM comp WHERE key = 'game_sense'),
      'attitude', (SELECT avg_v FROM comp WHERE key = 'attitude'),
      'communication', (SELECT avg_v FROM comp WHERE key = 'communication')
    ),
    'score_histogram', (
      SELECT jsonb_agg(jsonb_build_object('bucket', h.bucket, 'count', h.cnt) ORDER BY h.bucket_idx)
        FROM hist h
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'date', dl.d, 'sessions', dl.sessions, 'analyzed', dl.analyzed
             ) ORDER BY dl.d)
        FROM daily dl
    ), '[]'::jsonb),
    'per_question_avg', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'question_number', pq.question_number, 'avg_score', pq.avg_score, 'n', pq.n
             ) ORDER BY pq.question_number)
        FROM per_q pq
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION admin_session_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;
-- 서버(service_role) 전용 — anon/authenticated 키로는 통계 집계 조회 불가
REVOKE EXECUTE ON FUNCTION admin_session_stats(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION bump_session_progress(UUID, UUID, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------
-- 학생 사용량 배치 집계 RPC 2종 (리뷰 WARN 반영)
-- (1) 학생 목록: 학생별 누적·이번 주 사용량을 1회 호출로 집계 (페이지당 ≤100 head-count N+1 대체)
-- (2) 학생 상세: 주별 사용량 집계 (weekly_limit 100 × 12주 = 1,200행 → PostgREST 1000행 캡 회피)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION student_usage_counts(p_ids UUID[], p_week_start DATE DEFAULT NULL)
RETURNS TABLE(student_id UUID, total_count INTEGER, week_count INTEGER) AS $$
  SELECT u.student_id,
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE p_week_start IS NOT NULL AND u.week_start = p_week_start)::int AS week_count
    FROM usage_logs u
   WHERE u.student_id = ANY(p_ids)
   GROUP BY u.student_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION student_weekly_usage(p_student_id UUID, p_since DATE)
RETURNS TABLE(week_start DATE, cnt INTEGER) AS $$
  SELECT u.week_start, COUNT(*)::int AS cnt
    FROM usage_logs u
   WHERE u.student_id = p_student_id AND u.week_start >= p_since
   GROUP BY u.week_start;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION student_usage_counts(UUID[], DATE) TO service_role;
GRANT EXECUTE ON FUNCTION student_weekly_usage(UUID, DATE) TO service_role;
REVOKE EXECUTE ON FUNCTION student_usage_counts(UUID[], DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION student_weekly_usage(UUID, DATE) FROM PUBLIC, anon, authenticated;
