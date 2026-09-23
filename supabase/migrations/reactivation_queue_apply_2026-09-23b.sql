-- =============================================
-- 재활성화 승인 큐 1건 approve (2026-09-23, 2차)
-- 근거: 2026-09-23 ERP 합의(자체 판정 4조건) — coordination/threads/reactivation-queue-approval-2026-09.md
--   V2723918 박소영 (전화 끝 9807): 정규 V 학번, is_deleted=false, 온보딩대기 24w,
--   정규화 전화번호 중복 다른 학번 0건. 동명 E0001098(전화 끝 1395, 미개시환불 레거시)은 별개
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
-- =============================================

BEGIN;

UPDATE students s
   SET is_active = true
 WHERE s.code = 'V2723918'
   AND EXISTS (SELECT 1 FROM pending_reactivations p
                WHERE p.student_code = s.code AND p.status = 'pending');

UPDATE pending_reactivations
   SET status = 'approved',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-23',
       note = 'ERP 활성(온보딩대기 24w) 확인, 정규 V 학번, 전화번호 중복 없음 — 2026-09-23 합의 4조건 충족'
 WHERE student_code = 'V2723918'
   AND status = 'pending';

COMMIT;

SELECT p.student_code, p.status, s.is_active, s.weekly_limit
  FROM pending_reactivations p
  LEFT JOIN students s ON s.code = p.student_code
 WHERE p.student_code = 'V2723918';
