-- =============================================
-- 재활성화 승인 큐 잔여 3건 처리 (2026-09-14)
-- 근거: coordination/threads/reactivation-queue-approval-2026-09.md
--       [ERP → INTERVIEW] 2026-09-12 "보류 2건 답변" + 12:40 추기
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
--
--  - V2722882        approve : 양승범 정규 학번. ERP가 WC38167MRYE3W04 레코드의 번호만 교체
--  - WC38167MRYE3W04 reject  : 정본 V2722882 로 교체됨. ERP는 이 WC 코드를 다시 보내지 않음
--  - WC19746MQ8CI1H2 reject  : 조우철, 백필 부산물(2023-01 9만원 입문상품). 면접앱 대상 아님
-- =============================================

BEGIN;

-- 1) V2722882 활성화 (pending 인 경우에만)
UPDATE students
   SET is_active = true
 WHERE code = 'V2722882'
   AND EXISTS (SELECT 1 FROM pending_reactivations
                WHERE student_code = 'V2722882' AND status = 'pending');

UPDATE pending_reactivations
   SET status = 'approved',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-14',
       note = '양승범 정규 학번 — ERP가 WC38167MRYE3W04 레코드의 번호를 V2722882 로 교체(2026-09-12 08:42 KST). ERP 활성 확인'
 WHERE student_code = 'V2722882' AND status = 'pending';

-- 2) WC38167MRYE3W04 reject
UPDATE pending_reactivations
   SET status = 'rejected',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-14',
       note = 'WC 웹훅 임시코드 — 정본 V2722882 로 교체(같은 레코드 번호 변경). 원인: 영업DB분배 시트 전화번호 010 중복 표기. WC 는 활성화 금지'
 WHERE student_code = 'WC38167MRYE3W04' AND status = 'pending';

-- 3) WC19746MQ8CI1H2 reject
UPDATE pending_reactivations
   SET status = 'rejected',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-14',
       note = '면접앱 대상 아님 — 2023-01-04 9만원 입문 부트캠프 구매자의 2026-06-10 백필 부산물. ERP가 등록 종결 처리(2026-09-12)'
 WHERE student_code = 'WC19746MQ8CI1H2' AND status = 'pending';

COMMIT;

-- 검증
SELECT p.student_code, p.status, s.is_active, s.weekly_limit
  FROM pending_reactivations p
  LEFT JOIN students s ON s.code = p.student_code
 WHERE p.student_code IN ('V2722882','WC38167MRYE3W04','WC19746MQ8CI1H2')
 ORDER BY p.student_code;
