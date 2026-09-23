-- =============================================
-- 재활성화 승인 큐 4건 approve (2026-09-23)
-- 근거: ERP DB(bvcbvddiedrgiveeqcrn) 읽기 조회 2026-09-23 — 4건 모두 is_deleted=false,
--       활성 enrollment(온보딩대기) 보유, 정규 V 학번. 동명이인 확인:
--       박찬현 E0000214 는 2021-04 수업종료 레거시(전화 없음) — 별개 레코드, 면접앱에서도 이미 비활성
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
--
--  - V2723862 황성욱 (전화 끝 2410) 온보딩대기 32w — 9/16 적재
--  - V504979  지승민 (전화 끝 6682) 온보딩대기 20w — 9/18 적재
--  - V2723824 박찬현 (전화 끝 3957) 온보딩대기 24w — 9/21 적재
--  - V2723848 양예진 (전화 끝 8391) 온보딩대기 5w + 24w — 9/21 적재
-- =============================================

BEGIN;

UPDATE students s
   SET is_active = true
 WHERE s.code IN ('V2723862','V504979','V2723824','V2723848')
   AND EXISTS (SELECT 1 FROM pending_reactivations p
                WHERE p.student_code = s.code AND p.status = 'pending');

UPDATE pending_reactivations
   SET status = 'approved',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-23',
       note = 'ERP 활성(온보딩대기) 확인, 정규 V 학번, 중복 없음 — 2026-09-23 ERP DB 조회'
 WHERE student_code IN ('V2723862','V504979','V2723824','V2723848')
   AND status = 'pending';

COMMIT;

-- 검증
SELECT p.student_code, p.status, s.is_active, s.weekly_limit
  FROM pending_reactivations p
  LEFT JOIN students s ON s.code = p.student_code
 WHERE p.student_code IN ('V2723862','V504979','V2723824','V2723848')
 ORDER BY p.student_code;
