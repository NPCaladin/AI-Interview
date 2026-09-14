-- =============================================
-- 재활성화 승인 큐 134건 일괄 판정 적용 (2026-09-12)
-- 근거: coordination/threads/reactivation-queue-approval-2026-09.md
--       ERP 회신 3건(1차 + 2차 정정 + 3차 보완) 기준
-- 대상 ref: falbyilzmryyrabnrctz (게임면접앱)
--
-- 처리: approve 115 / reject 17 / 보류 2 (= pending 유지)
--  - approve      : ERP 활성 확인분 → students.is_active=true + 큐 approved
--  - reject(테스트): V90000xx 8건, ERP is_deleted=true & enrollment 0
--  - reject(종료)  : V2721865 V2721958, ERP 수강 종료
--  - reject(중복)  : WC 임시코드 7건. 정본은 별도로 approve 되어 활성화됨
--                    (이 앱의 merge 액션은 pending 코드를 활성화하므로 사용 불가)
--  - 보류          : WC19746MQ8CI1H2 WC38167MRYE3W04 — ERP 정규 코드 발급 진행 중
-- =============================================

BEGIN;

-- 제외 대상(reject 17 + 보류 2) 정의
CREATE TEMP TABLE _excl(code varchar) ON COMMIT DROP;
INSERT INTO _excl(code) VALUES
  ('V9000001'),('V9000003'),('V9000004'),('V9000005'),
  ('V9000006'),('V9000007'),('V9000008'),('V9000009'),
  ('V2721865'),('V2721958'),
  ('WC37967MPUMMMGJ'),('WC37978MPV7UIN5'),('WC37998MPZ8SCAX'),('WC38017MQ5Y20O2'),
  ('WC38026MQ7K2IP8'),('WC38031MQ905BR0'),('WC38032MQ8K43RU'),
  ('WC19746MQ8CI1H2'),('WC38167MRYE3W04');

-- ── 1) approve: 학생 활성화 (큐 상태 변경보다 먼저)
UPDATE students s
   SET is_active = true
 WHERE s.code IN (
   SELECT p.student_code FROM pending_reactivations p
    WHERE p.status = 'pending'
      AND p.student_code NOT IN (SELECT code FROM _excl)
 );

-- ── 2) approve: 큐 상태
UPDATE pending_reactivations
   SET status = 'approved',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-12',
       note = 'ERP 활성 확인 (2026-09-12)'
 WHERE status = 'pending'
   AND student_code NOT IN (SELECT code FROM _excl);

-- ── 3) reject: 테스트 계정 8건
UPDATE pending_reactivations
   SET status = 'rejected',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-12',
       note = '테스트 계정 — ERP 확인: is_deleted=true, enrollment 0건, 전화 0100000000X (2026-04-23 통합테스트 잔재)'
 WHERE status = 'pending'
   AND student_code IN ('V9000001','V9000003','V9000004','V9000005',
                        'V9000006','V9000007','V9000008','V9000009');

-- ── 4) reject: ERP 수강 종료 2건
UPDATE pending_reactivations
   SET status = 'rejected',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-12',
       note = 'ERP 수강 종료 확인 (2026-09-12)'
 WHERE status = 'pending'
   AND student_code IN ('V2721865','V2721958');

-- ── 5) reject: WC 임시코드 중복 7건 (정본 코드를 note 에 기록)
UPDATE pending_reactivations p
   SET status = 'rejected',
       reviewed_at = now(),
       reviewed_by = 'claude-code 2026-09-12',
       note = 'WC 웹훅 임시코드 중복 — 정본 ' || m.canonical
              || ' (ERP 전화/이메일 일치 확인 2026-09-12). 정본 코드를 활성화함. WC 는 활성화 금지'
  FROM (VALUES
    ('WC37967MPUMMMGJ','V2711551'),
    ('WC37978MPV7UIN5','E0000871'),
    ('WC37998MPZ8SCAX','V2101072'),
    ('WC38017MQ5Y20O2','V503135'),
    ('WC38026MQ7K2IP8','V2161510'),
    ('WC38031MQ905BR0','V1901548'),
    ('WC38032MQ8K43RU','V2710476')
  ) AS m(wc, canonical)
 WHERE p.status = 'pending' AND p.student_code = m.wc;

COMMIT;

-- ── 검증
SELECT status, count(*) AS cnt FROM pending_reactivations GROUP BY status ORDER BY status;
SELECT count(*) FILTER (WHERE is_active) AS active_students,
       count(*) AS total_students
  FROM students;
SELECT code, is_active FROM students
 WHERE code IN ('V2711551','E0000871','V2101072','V503135','V2161510','V1901548','V2710476',
                'V504910','V2203232','V2709749','V1401196','V2180038')
 ORDER BY code;
SELECT student_code, status FROM pending_reactivations
 WHERE student_code IN ('WC19746MQ8CI1H2','WC38167MRYE3W04');
