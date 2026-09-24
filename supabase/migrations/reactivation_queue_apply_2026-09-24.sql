-- =============================================
-- 재활성화 승인 큐 2건 approve (2026-09-24)
-- 근거: 2026-09-23 ERP 합의 자체 판정 4조건 — ERP DB(bvcbvddiedrgiveeqcrn) 읽기 조회 2026-09-24
--   V2724009 전혜린 (전화 끝 8790): 정규 V, is_deleted=false, 온보딩대기 24w, 전화 중복 0, 동명 0
--   V2723836 심인보 (전화 끝 3372): 정규 V, is_deleted=false, 온보딩대기 32w, 전화 중복 0, 동명 0
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
-- =============================================

BEGIN;

UPDATE students s
   SET is_active = true
 WHERE s.code IN ('V2724009','V2723836')
   AND EXISTS (SELECT 1 FROM pending_reactivations p
                WHERE p.student_code = s.code AND p.status = 'pending');

UPDATE pending_reactivations
   SET status = 'approved',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-24',
       note = 'ERP 활성(온보딩대기) 확인, 정규 V 학번, 전화번호 중복·동명 없음 — 합의 4조건 충족'
 WHERE student_code IN ('V2724009','V2723836')
   AND status = 'pending';

COMMIT;

SELECT p.student_code, p.status, s.is_active, s.weekly_limit
  FROM pending_reactivations p
  LEFT JOIN students s ON s.code = p.student_code
 WHERE p.student_code IN ('V2724009','V2723836')
 ORDER BY p.student_code;
