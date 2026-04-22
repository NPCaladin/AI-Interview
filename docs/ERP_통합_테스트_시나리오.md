# ERP 통합 테스트 시나리오

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-04-22 |
| 기반 합의서 | `docs/ERP_연동_합의서_최종.md` v1.0 |
| 대상 | 이브니 면접앱 ↔ ERP pull 연동 (방식 B) |
| 공유 대상 | ERP팀 / 면접앱팀 |

---

## 1. 사전 준비

### 1-1. 환경 변수 체크리스트 (면접앱 Vercel)

| 변수 | 필수 | 설명 |
|---|---|---|
| `ERP_BASE_URL` | Y | 현재 `https://erp-lilac-three.vercel.app` (stable alias). 향후 `erp.evenigame.com` 복구 시 교체 |
| `ERP_API_KEY` | Y | ERP가 발급한 Bearer 토큰 (테스트→운영 전환 예정) |
| `ERP_VERCEL_BYPASS_TOKEN` | Y* | Vercel Deployment Protection 우회 헤더 (`x-vercel-protection-bypass`). ERP 공식 도메인 + Protection 해제 시 제거 가능 |
| `ERP_DRY_RUN` | Y | 초기 검증 시 `true`, 운영 전환 시 `false` |
| `CRON_SECRET` | Y | Vercel Cron 진입 인증 (32자+ 권장) |
| `ERP_INITIAL_UPDATED_AFTER` | N | 기본 `2020-01-01T00:00:00+09:00` |
| `ERP_MAX_PAGES_PER_RUN` | N | 기본 10 (Cron 런당 최대 페이지 수) |
| `SUPABASE_URL` | Y | 기존 |
| `SUPABASE_SERVICE_ROLE_KEY` | Y | 기존 |

### 1-2. 테스트 데이터 제안 (ERP 측 임시 레코드 10건)

| 코드 | 이름 | 상태 | 용도 |
|---|---|---|---|
| `V9000001` | 테스트A | is_active=true | TC-01 신규 삽입 |
| `V9000002` | 테스트B | is_active=false | TC-11 비활성 채로 pull |
| `V9000003` | 테스트C | true→false | TC-03 비활성화 즉시 반영 |
| `V9000004` | 테스트D | false→true | TC-02 케이스 2 큐 적재 |
| `V9000005` | 테스트E→테스트E2 | true | TC-04 이름 변경 |
| `V9000006~08` | 테스트F~H | true | TC-05 cursor 페이지네이션 |
| `V9000009` | 테스트I | false→true | TC-13 케이스 2 승인 |
| `V9000010` | 테스트J (동명 테스트A) | true | TC-12 케이스 1 동일인 판별 |

### 1-3. DB 초기 상태 스냅샷

```sql
-- 면접앱 Supabase
SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active) AS active FROM students;
SELECT COUNT(*) FROM pending_reactivations WHERE status='pending';
SELECT last_updated_at, last_cursor, last_success_at FROM erp_sync_state WHERE id=1;
SELECT started_at, status, dry_run FROM erp_sync_runs ORDER BY started_at DESC LIMIT 5;
```

---

## 2. 테스트 시나리오 (TC-01 ~ TC-13)

### TC-01. 신규 student_code pull → students 삽입 (비활성 + 큐 적재)

**Given**
- `students` 테이블에 `V9000001` 미존재
- `ERP_DRY_RUN=false`
- ERP 응답: `V9000001, name=테스트A, is_active=true`

**When**
- Cron 트리거 또는 admin SyncStatusPanel "지금 동기화" 클릭

**Then**
- `students`에 `code=V9000001, name=테스트A, is_active=false, source='erp_sync'` 레코드 생성
  - **첫 등장도 `is_active=false`로 강제 저장** — 합의서 §5-1에 따라 admin 승인 전까지 비활성
- `pending_reactivations`에 `(student_code=V9000001, source='case1_new_code', status='pending')` 1건 적재
- `erp_sync_runs`에 성공 로그 (`records_upserted=1, records_queued=1`)
- `erp_sync_state.last_updated_at` 전진

**응답 페이로드 샘플**
```json
{
  "students": [
    {"student_code":"V9000001","name":"테스트A","is_active":true,"updated_at":"2026-04-22T10:00:00+09:00"}
  ],
  "next_cursor": null
}
```

**검증 쿼리**
```sql
SELECT code, name, is_active, source FROM students WHERE code='V9000001';
-- is_active=false, source='erp_sync' 기대

SELECT source, status FROM pending_reactivations WHERE student_code='V9000001';
-- source='case1_new_code', status='pending' 기대
```

**엣지**: 동일 pull 재실행 시 upsert 멱등, 큐는 UNIQUE 부분 인덱스로 중복 적재 방지 (TC-E2).

---

### TC-02. 기존 학생 is_active false→true 전환 → 큐 적재 (케이스 2)

**Given**
- `students`: `V9000004, is_active=false` 존재
- `pending_reactivations`에 해당 code의 pending 미존재
- ERP 응답: `V9000004, is_active=true`

**When**
- pull 실행

**Then**
- `students.is_active`는 **여전히 `false`** (직접 활성화 금지)
- `students.updated_at`만 ERP 응답 값으로 미러링
- `pending_reactivations`에 `(student_code=V9000004, source='case2_existing_code', student_id=기존 id)` 1건 적재

**검증 쿼리**
```sql
SELECT is_active, updated_at FROM students WHERE code='V9000004';  -- is_active=false
SELECT source, student_id, status FROM pending_reactivations WHERE student_code='V9000004' AND status='pending';
```

---

### TC-03. is_active true→false → 즉시 반영, 로그인 차단

**Given**
- `students`: `V9000003, is_active=true` 존재
- 해당 학생 JWT 보유 중
- ERP 응답: `V9000003, is_active=false`

**When**
- pull 실행 후 학생이 `/api/auth/verify` 호출

**Then**
- `students.is_active=false` 즉시 반영 (큐 경유 없음)
- `/api/auth/verify` → 403 "비활성화된 계정입니다"
- `consume_usage` RPC는 `INACTIVE` 반환 → 면접 차단

**검증**
```sql
SELECT is_active FROM students WHERE code='V9000003';
```
```bash
curl -X POST $APP/api/auth/verify -H 'Content-Type: application/json' -d '{"code":"V9000003"}'
```

---

### TC-04. 학생 이름 변경 반영

**Given**
- `students`: `V9000005, name=테스트E, is_active=true`
- ERP 응답: `V9000005, name=테스트E2, is_active=true, updated_at` 갱신

**When**: pull 실행

**Then**
- `students.name='테스트E2'` 업데이트
- `is_active` 변화 없으므로 큐 적재 없음
- `updated_at` 미러링

---

### TC-05. next_cursor 이어받기

**Given**
- ERP에 3건 (`V9000006~V9000008`), `limit=2`

**When**: 첫 pull 후 `next_cursor=X`가 응답되면 동일 런에서 2차 pull 수행

**Then**
- 1차: V9000006, V9000007 처리
- 2차 요청은 `?cursor=X` 사용 (`updated_after` 미사용)
- 최종 3건 모두 처리, 마지막 응답 `next_cursor=null`
- `erp_sync_state.last_cursor=null` 정리, `last_updated_at` 전진

**검증**
```sql
SELECT code FROM students WHERE code BETWEEN 'V9000006' AND 'V9000008' ORDER BY code;
SELECT last_cursor, last_updated_at FROM erp_sync_state WHERE id=1;
```

---

### TC-06. updated_after 경계 동시각 레코드 — 중복·누락 없음

**Given**
- ERP 정렬: `(updated_at ASC, id ASC)` tiebreaker
- 1차 pull 마지막 레코드 updated_at = `10:00:00`
- ERP에 `10:00:00` 동시각 레코드가 id 기준 더 있음

**When**: 2차 pull이 `cursor` 재사용 (next_cursor이 null이 아닐 때)

**Then**
- cursor는 `(updated_at, id)` 인코딩이라 동일 timestamp에서도 id tiebreaker로 정확히 다음 레코드부터 응답
- 중복 upsert 0건, 누락 0건

---

### TC-07. 인증 실패 (401) — Bearer / Bypass 둘 다

**Given**
- (a) `ERP_API_KEY`가 잘못 설정, 또는
- (b) `ERP_VERCEL_BYPASS_TOKEN` 누락 (Vercel SSO 벽에 막힘)

**When**: pull 실행

**Then**
- (a): ERP 애플리케이션이 401 응답, error_snippet에 ERP 에러 JSON
- (b): Vercel 프록시가 401 응답, error_snippet에 Vercel HTML 로그인 페이지 fragment
- 두 경우 모두 **재시도 없이 즉시 실패**
- `erp_sync_runs`에 `status='failed', error_code='401'`
- `erp_sync_state.is_running=false`로 해제
- admin SyncStatusPanel에 실패 표시

**검증 방법**: 로그 `error_snippet`의 첫 200자로 (a)와 (b) 구분 가능

---

### TC-08. gzip 압축 응답 정상 해제

**Given**: ERP `Content-Encoding: gzip` 자동 (Vercel CDN)

**When**: fetch 시 `Accept-Encoding: gzip` 전송 (Node 18+ fetch 기본)

**Then**
- 자동 해제, JSON 파싱 성공
- limit=500 기준 실측 압축 ≈ 75KB 해제 성공

**검증**
```bash
curl -H "Accept-Encoding: gzip" -H "Authorization: Bearer $ERP_API_KEY" \
  "$ERP_BASE_URL/api/external/interview/students?limit=500" -I | grep -i content-encoding
```

---

### TC-09. 10초 타임아웃 → 지수 백오프 재시도 (1→2→4s)

**Given**: ERP 응답 지연(시뮬레이션 12초)

**When**: pull 실행

**Then**
- 1차 fetch: 10초 AbortController abort
- 1초 대기 후 재시도 → 타임아웃
- 2초 대기 후 재시도 → 타임아웃
- 4초 대기 후 재시도 → 타임아웃
- 총 3회 재시도 후 `erp_sync_runs.status='failed', error_code='timeout'`
- 전체 소요 ≈ 47초 이내 종료
- 다음 Cron 틱(하루 뒤) 또는 수동 트리거로 재개

---

### TC-10. 4xx 재시도 금지

**Given**: ERP가 400/403/404 응답

**When**: pull 실행

**Then**
- 재시도 없음, 즉시 실패
- `erp_sync_runs.status='failed', error_code='400'(또는 403/404), error_snippet` 기록
- 400(잘못된 cursor)의 경우 admin이 수동으로 `erp_sync_state.last_cursor=NULL` 처리 후 재개

---

### TC-11. 초기 전체 이관 3,500명 무결성

**Given**
- `students` 테이블에 기존 레코드 존재 가능 (1,604명)
- ERP 활성 학생 3,513명

**When**
1. `scripts/erp-initial-pull.js` dry-run 3회 실행 — 로그만, DB 무변경
2. 검증 통과 후 `scripts/erp-initial-pull.js --confirm` 실행 (source='erp_migration')

**Then**
- `SELECT COUNT(*) FROM students WHERE source='erp_migration'` = 3,513
- `SELECT COUNT(*) = COUNT(DISTINCT code) FROM students` (중복 0)
- 규격 위반 스킵 로그 합계 0건 (있으면 ERP팀 에스컬레이션)
- `pending_reactivations`에 초기 이관 3,513건 전원이 `case1_new_code`로 적재될 수 있음 — 운영 판단: 대량이면 SQL로 일괄 `status='approved'` 전환

**검증 쿼리**
```sql
SELECT COUNT(*), COUNT(DISTINCT code) FROM students WHERE source='erp_migration';
SELECT code FROM students GROUP BY code HAVING COUNT(*) > 1;  -- 0건 기대
SELECT code FROM students WHERE code !~ '^[A-Z0-9]{3,20}$';   -- 0건 기대
SELECT COUNT(*) FROM pending_reactivations WHERE source='case1_new_code' AND status='pending';
```

**운영 판단 포인트**
- 초기 이관분 3,513건을 모두 admin 수동 승인하는 것은 비현실적
- 대안: `UPDATE students SET is_active=true WHERE source='erp_migration'` + `UPDATE pending_reactivations SET status='approved', reviewed_by='system_migration', reviewed_at=now() WHERE source='case1_new_code' AND created_at BETWEEN '2026-04-22' AND '2026-04-25'` 배치 승인 SQL 실행

---

### TC-12. 케이스 1 (새 V-번호) admin 동일인 판별 → 병합

**Given**
- `students`: `V9000001(테스트A, is_active=false)` (과거 합격종료 학생)
- ERP 신규: `V9000010(테스트J, is_active=true)` — 실제로는 동일인 재등록

**When**
1. pull → V9000010 upsert (비활성) + `pending_reactivations` 적재 (`source='case1_new_code'`)
2. admin이 `/admin` ReactivationQueue에서 V9000010 행 확장
3. `/api/admin/reactivations/search?name=테스트` 호출 → V9000001 후보 노출
4. admin이 "동일인 병합" 버튼 클릭 → PATCH `{id, action:'merge', linked_student_code:'V9000001'}`

**Then**
- `students.is_active=true` (V9000010 활성화)
- `pending_reactivations.status='merged', linked_student_code='V9000001', reviewed_at=now`
- **`usage_logs` 이관은 본 스코프 외** — admin UI 응답 note에 "수기 SQL 필요" 안내
- 수기 이관 SQL 예시:
```sql
UPDATE usage_logs
SET student_id = (SELECT id FROM students WHERE code='V9000010')
WHERE student_id = (SELECT id FROM students WHERE code='V9000001');
```

---

### TC-13. 케이스 2 (enrollment 추가) admin 승인

**Given**
- TC-02 결과로 `pending_reactivations`에 V9000009 case2 pending

**When**: admin이 ReactivationQueue에서 "승인" 클릭 → PATCH `{id, action:'approve'}`

**Then**
- `students.is_active=true` (V9000009 활성화)
- `pending_reactivations.status='approved', reviewed_at=now`
- 해당 학생 즉시 `/api/auth/verify` 통과
- 다음 pull에 동일 레코드가 와도 `is_active` 이미 true라 큐 재적재 없음

**엣지**: "거부" 클릭 시 `status='rejected'`, `is_active=false` 유지

---

## 3. 엣지 케이스 (TC-E1 ~ TC-E6)

| ID | 제목 | Given | When | Then |
|---|---|---|---|---|
| TC-E1 | Cron 중복 실행 방지 | `erp_sync_state.is_running=true, started_at=1분 전` | 수동 트리거 또는 Cron 재진입 | 즉시 exit, `skipped_overlap` 로그. started_at 15분 초과 시만 강제 인수(warn) |
| TC-E2 | pending 중복 적재 방지 | 동일 code로 pending 이미 존재 | 동일 전환 재pull | UNIQUE 부분 인덱스(status='pending')로 INSERT 무시, 에러 없음 |
| TC-E3 | 규격 위반 레코드 스킵 | ERP가 `student_code='v12345'`(소문자) 또는 `name` 51자 이상 반환 | pull | 해당 레코드만 skip + `[ERP Sync] invalid_record` 로그. 다른 레코드 정상 처리 |
| TC-E4 | Dry-run 실제 변경 없음 | `ERP_DRY_RUN=true` | pull | `students`·`pending_reactivations` 변경 0건, dry-run 로그에 예상 upsert/queue 개수 출력 |
| TC-E5 | 수동 트리거 경로 | admin 로그인 세션 | SyncStatusPanel "지금 동기화" → POST `/api/admin/sync-status` | Cron과 동일 로직 실행, is_running 락 공유, 응답을 UI에 직접 표시 |
| TC-E6 | 5xx 지속 → failed 마무리 | ERP 500 고정 | pull | 3회 재시도(1/2/4s) 후 `status='failed', error_code='500'`. 다음 Cron 틱에 재개 |

---

## 4. 초기 이관 검증 체크리스트 (1회성)

- [ ] `COUNT(*) FROM students WHERE source='erp_migration'` = ERP 활성 학생 수 (3,513 내외)
- [ ] `COUNT(DISTINCT code) = COUNT(*)` (중복 0)
- [ ] 전원 `^[A-Z0-9]{3,20}$` 정규식 매치 (규격 위반 0)
- [ ] `source='erp_migration'` 플래그 정확히 부여
- [ ] `pending_reactivations` 초기 이관분 일괄 승인 SQL 실행 결과 확인
- [ ] dry-run 3회 로그에 규격 위반 0건 기록 보관
- [ ] `erp_sync_state.last_updated_at`이 ERP 응답 최종 값으로 전진
- [ ] `erp_sync_runs`에 dry_run 3건 + 실운영 1건 기록 (총 4건)

---

## 5. 운영 전환 기준

아래 항목 **전원 통과** 시 `ERP_DRY_RUN=false` 전환 + Vercel Cron 활성화:

- [ ] TC-01 ~ TC-13 전원 통과
- [ ] TC-E1 ~ TC-E6 전원 통과
- [ ] 초기 이관 검증 체크리스트 전원 green
- [ ] ERP팀 응답 SLA 1주일 모니터링 통과 (10초 이내 95%+, gzip 정상, rate limit 위반 없음)
- [ ] 면접앱 admin SyncStatusPanel 가시성 확인 (최근 10회 run 표시, 실패 시 시각 경고)
- [ ] API_KEY 로테이션 리허설 1회 완료 (Vercel env 변경 → 다음 Cron에 반영 확인)

---

## 6. 참고 파일

- 합의서: `docs/ERP_연동_합의서_최종.md`
- DB 스키마: `supabase/migrations/erp_sync.sql`, `supabase/schema.sql`
- Pull 로직: `lib/erp/{client,validation,sync}.ts`
- Cron: `app/api/cron/erp-pull/route.ts`, `vercel.json`
- Admin API: `app/api/admin/reactivations/{route,search}.ts`, `app/api/admin/sync-status/route.ts`
- 초기 이관: `scripts/erp-initial-pull.js`
- 인증 차단 검증: `app/api/auth/verify/route.ts`, `lib/auth.ts`

---

**시나리오 총계**: TC-01~TC-13 (13개) + TC-E1~TC-E6 (6개) = **19개**
