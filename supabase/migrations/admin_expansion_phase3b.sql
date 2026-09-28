-- =============================================
-- 어드민 보강 Phase 3b — 리뷰 반영 RPC 2종
-- 실행: supabase-exec.ps1 -Ref falbyilzmryyrabnrctz -File supabase/migrations/admin_expansion_phase3b.sql
-- (1) replace_eval_criteria: 평가 기준 전체 교체를 한 트랜잭션으로 (delete→update→insert 비원자 FAIL 해소)
-- (2) job_question_counts: 직군별 문항 수 집계 1회 (직군×2 head-count 병렬 호출 대체)
-- 재실행 안전: CREATE OR REPLACE
-- =============================================

-- p_items: [{ "id"?: uuid, "criterion": text }, ...] 원하는 순서대로 1~20개
-- 반환: 교체 후 전체 목록 [{id, criterion, sort_order}] (sort_order 오름차순)
CREATE OR REPLACE FUNCTION replace_eval_criteria(p_items JSONB) RETURNS JSONB AS $$
DECLARE
  v_count INT;
  v_i     INT;
  v_item  JSONB;
  v_id    UUID;
  v_text  TEXT;
  v_ids   UUID[] := ARRAY[]::UUID[];
  v_out   JSONB;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 20 THEN
    RAISE EXCEPTION 'items count out of range (1..20): %', v_count;
  END IF;

  -- 기존 행 전체 잠금 (동시 교체 직렬화)
  PERFORM 1 FROM interview_eval_criteria FOR UPDATE;

  FOR v_i IN 0 .. v_count - 1 LOOP
    v_item := p_items -> v_i;
    v_text := btrim(v_item ->> 'criterion');
    IF v_text IS NULL OR length(v_text) < 1 OR length(v_text) > 200 THEN
      RAISE EXCEPTION 'criterion length out of range (1..200) at index %', v_i;
    END IF;
    v_id := NULLIF(v_item ->> 'id', '')::UUID;
    IF v_id IS NOT NULL AND v_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'duplicate id at index %', v_i;
    END IF;

    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM interview_eval_criteria WHERE id = v_id) THEN
      UPDATE interview_eval_criteria SET criterion = v_text, sort_order = v_i WHERE id = v_id;
    ELSE
      INSERT INTO interview_eval_criteria (criterion, sort_order) VALUES (v_text, v_i) RETURNING id INTO v_id;
    END IF;
    v_ids := v_ids || v_id;
  END LOOP;

  DELETE FROM interview_eval_criteria WHERE NOT (id = ANY(v_ids));

  SELECT jsonb_agg(jsonb_build_object('id', id, 'criterion', criterion, 'sort_order', sort_order) ORDER BY sort_order)
    INTO v_out
    FROM interview_eval_criteria;
  RETURN COALESCE(v_out, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION job_question_counts()
RETURNS TABLE(job_name TEXT, question_count INTEGER, active_question_count INTEGER) AS $$
  SELECT q.job_name,
         COUNT(*)::int AS question_count,
         COUNT(*) FILTER (WHERE q.is_active)::int AS active_question_count
    FROM interview_questions q
   GROUP BY q.job_name;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION replace_eval_criteria(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION job_question_counts() TO service_role;
REVOKE EXECUTE ON FUNCTION replace_eval_criteria(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION job_question_counts() FROM PUBLIC, anon, authenticated;
