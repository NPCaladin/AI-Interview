-- =============================================
-- 어드민 보강 Phase 2 — 통계 대시보드 집계 RPC
-- 실행: supabase-exec.ps1 -Ref falbyilzmryyrabnrctz -File supabase/migrations/admin_expansion_phase2.sql
-- 순서: 이 SQL 을 먼저 적용한 뒤 코드 배포 (/api/admin/stats/overview 가 이 RPC 를 호출)
-- 재실행 안전: CREATE OR REPLACE 사용
-- 집계 범위: is_dev = false, started_at ∈ [p_from, p_to), 직군/회사 필터(NULL = 전체)
-- "분석 완료" = status = 'analyzed' AND total_score IS NOT NULL
-- 역량/문항 점수는 10 이하 값을 ×10 해서 0~100 척도로 정규화
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
