-- =============================================
-- ERP 학생 정보 연동 마이그레이션
-- 생성일: 2026-04-22
-- 참조: docs/ERP_연동_합의서_최종.md
--
-- 실행 방법: Supabase SQL Editor에 전체 붙여넣기 후 RUN
--   - IF NOT EXISTS 패턴으로 재실행 안전
--   - students 테이블 ALTER는 컬럼 존재 여부 체크
-- =============================================

-- ---------------------------------------------
-- 1. students ALTER: source / updated_at 추가
-- ---------------------------------------------
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

-- ---------------------------------------------
-- 2. pending_reactivations: 재활성화 승인 큐
-- ---------------------------------------------
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

-- 중복 pending 적재 방지 (케이스 1/2 혼재 대비, 부분 유니크)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_reactivations_code_pending
  ON pending_reactivations(student_code) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_pending_reactivations_status
  ON pending_reactivations(status);
CREATE INDEX IF NOT EXISTS idx_pending_reactivations_created_at
  ON pending_reactivations(created_at DESC);

-- ---------------------------------------------
-- 3. erp_sync_state: 단일 행 상태 저장
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS erp_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_updated_at TIMESTAMPTZ NULL,
  last_cursor TEXT NULL,
  last_run_at TIMESTAMPTZ NULL,
  last_success_at TIMESTAMPTZ NULL,
  is_running BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NULL
);

INSERT INTO erp_sync_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------
-- 4. erp_sync_runs: 실행 이력
-- ---------------------------------------------
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
