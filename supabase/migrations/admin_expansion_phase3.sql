-- =============================================
-- 어드민 보강 Phase 3 — 문항 관리 · 프롬프트 슬롯 버전 · 큐 자격 판정
-- 실행: supabase-exec.ps1 -Ref falbyilzmryyrabnrctz -File supabase/migrations/admin_expansion_phase3.sql
-- 순서: 이 SQL 을 먼저 적용한 뒤 코드 배포
-- 재실행 안전: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / IF NOT EXISTS
-- 기존 동작 영향: 없음 — 새 컬럼은 전부 기본값(is_active=true, source='seed'), 데이터 갱신은
--   company_tag 를 raw_text 의 "[태그]" 접두에서 추출해 채우는 것뿐(태그 없는 312행은 NULL 유지)
-- =============================================

-- ---------------------------------------------
-- 3-A 문항 관리: 활성 플래그 · 회사 태그 · 출처 · 수정 시각
-- ---------------------------------------------
ALTER TABLE interview_questions
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS company_tag TEXT,
  ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;

-- 기존 "[넥슨] 질문" 관례에서 회사 태그 추출 (이미 채워진 행·태그 없는 행은 건드리지 않음)
UPDATE interview_questions
   SET company_tag = substring(raw_text from '^\[([^\]]+)\]')
 WHERE company_tag IS NULL
   AND raw_text ~ '^\[[^\]]+\]';

CREATE INDEX IF NOT EXISTS idx_interview_questions_job_active
  ON interview_questions(job_name) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_interview_questions_company_tag
  ON interview_questions(company_tag);

ALTER TABLE interview_personality_questions
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE interview_jobs
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ---------------------------------------------
-- 3-B 프롬프트 슬롯 버전 관리
-- 슬롯 3종: 면접관 페르소나·규칙 / 종합분석 평가지침 / 상세분석 평가지침
-- 모든 활성화는 새 행 INSERT → 테이블 자체가 이력. 슬롯당 활성 1건은 부분 유니크 인덱스로 보장
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS prompt_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot         TEXT NOT NULL
               CHECK (slot IN ('interviewer_persona', 'analysis_summary_rules', 'analysis_detail_rules')),
  body         TEXT NOT NULL,
  char_count   INTEGER NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  version_memo TEXT NOT NULL,
  created_by   VARCHAR(50) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_one_active
  ON prompt_versions(slot) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_prompt_versions_slot_created
  ON prompt_versions(slot, created_at DESC);

-- 한 트랜잭션: 기존 활성 해제 → 새 활성 행 INSERT. 반환 = 새 행 id
CREATE OR REPLACE FUNCTION activate_prompt_version(
  p_slot  TEXT,
  p_body  TEXT,
  p_memo  TEXT,
  p_actor TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_slot NOT IN ('interviewer_persona', 'analysis_summary_rules', 'analysis_detail_rules') THEN
    RAISE EXCEPTION 'invalid slot: %', p_slot;
  END IF;
  IF p_body IS NULL OR length(p_body) < 10 OR length(p_body) > 30000 THEN
    RAISE EXCEPTION 'body length out of range (10..30000)';
  END IF;

  UPDATE prompt_versions SET is_active = false WHERE slot = p_slot AND is_active;

  INSERT INTO prompt_versions (slot, body, char_count, is_active, version_memo, created_by)
  VALUES (p_slot, p_body, length(p_body), true, COALESCE(NULLIF(p_memo, ''), '(메모 없음)'), COALESCE(NULLIF(p_actor, ''), 'admin'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 3-C 재활성화 큐: 자격 판정 캐시 + 승인 RPC
-- eligibility: ERP 자격 조회 결과(JSONB, lib/erp/eligibility.ts Eligibility 형태)
-- ---------------------------------------------
ALTER TABLE pending_reactivations
  ADD COLUMN IF NOT EXISTS eligibility            JSONB,
  ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ;

-- 승인 한 트랜잭션: pending 검증(행 잠금) → students.is_active=true → 큐 approved/reviewed_by/reviewed_at/note/student_id
-- 기존 PATCH approve 로직과 동일한 효과. 이미 처리된 건은 {ok:false, code:'NOT_PENDING'}
CREATE OR REPLACE FUNCTION approve_reactivation(
  p_id    UUID,
  p_actor TEXT,
  p_note  TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_row        pending_reactivations%ROWTYPE;
  v_student_id UUID;
BEGIN
  SELECT * INTO v_row FROM pending_reactivations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', v_row.status);
  END IF;

  -- case2 는 student_id 보유, case1 은 코드로 조회
  v_student_id := v_row.student_id;
  IF v_student_id IS NULL THEN
    SELECT id INTO v_student_id FROM students WHERE code = v_row.student_code;
  END IF;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STUDENT_NOT_FOUND', 'student_code', v_row.student_code);
  END IF;

  UPDATE students SET is_active = true WHERE id = v_student_id;

  UPDATE pending_reactivations
     SET status      = 'approved',
         reviewed_by = COALESCE(NULLIF(p_actor, ''), 'admin'),
         reviewed_at = now(),
         note        = p_note,
         student_id  = v_student_id
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'student_id', v_student_id, 'student_code', v_row.student_code);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------
-- 권한: 서버(service_role) 전용
-- ---------------------------------------------
GRANT EXECUTE ON FUNCTION activate_prompt_version(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION approve_reactivation(UUID, TEXT, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION activate_prompt_version(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION approve_reactivation(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
