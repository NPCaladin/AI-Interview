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
  weekly_limit INTEGER NOT NULL DEFAULT 5,
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
