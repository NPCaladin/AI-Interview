-- =============================================
-- ERP 동기화 예외 플래그 (2026-09-07)
-- 배경: 수강 종료된 학생을 면접 임박 등 사유로 면접앱만 예외 활성화하는 경우,
--       매일 03:00 KST ERP Pull 의 existingDeactivation 경로가 is_active 를 false 로 되돌림.
--       ERP 원장은 사실대로 두고(퍼널·매출 집계 오염 방지), 면접앱에서만 예외를 관리한다.
-- 참조: coordination/threads/student-activation-override-2026-09.md
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
-- =============================================

-- 1) 동기화 예외 컬럼 추가
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS sync_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN students.sync_exempt IS
  'true 이면 ERP Pull 의 자동 비활성화(existingDeactivation)에서 제외. 예외 사유 종료 시 false 로 원복할 것.';

-- 2) V2180038 이종윤1 예외 지정 + 활성 상태 재확인 (면접 임박 특별 케이스)
UPDATE students
   SET sync_exempt  = true,
       is_active    = true,
       weekly_limit = 10
 WHERE code = 'V2180038';

-- 3) 결과 확인
SELECT code, name, is_active, weekly_limit, sync_exempt
  FROM students
 WHERE code = 'V2180038';
