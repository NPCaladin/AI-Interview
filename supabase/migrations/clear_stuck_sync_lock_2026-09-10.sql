-- 2026-09-10 검증 중 FUNCTION_INVOCATION_TIMEOUT 으로 새로 고착된 잠금 정리
-- (다음 실행의 stale 인수(5분)로도 자동 해소되지만, 결정적으로 즉시 해제한다)
UPDATE erp_sync_runs
   SET status = 'failed',
       finished_at = now(),
       error_code = 'FUNCTION_TIMEOUT',
       error_snippet = 'Vercel 60s maxDuration 초과로 강제 종료 — finally 미실행'
 WHERE status = 'running';

UPDATE erp_sync_state SET is_running = false WHERE id = 1;

SELECT (SELECT count(*) FROM erp_sync_runs WHERE status='running') AS still_running,
       (SELECT is_running FROM erp_sync_state WHERE id=1) AS is_running;
