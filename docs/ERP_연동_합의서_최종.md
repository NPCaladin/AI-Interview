# ERP 학생 정보 연동 — 최종 합의서

| 항목 | 내용 |
|---|---|
| 작성일 | 2026-04-22 |
| 대상 서비스 | 이브니 면접 연습 웹앱 (`interview.evenigame.com`) |
| 데이터 소스 | 이브니 ERP (자체 구축, Supabase 기반) |
| 운영 주체 | 이브니 (eveni.mkt@gmail.com) — ERP·면접앱 단독 관리자 |
| 합의 종결일 | 2026-04-22 |
| 착수일 (D+0) | 2026-04-22 |

---

## 1. 목적

면접앱의 수강생 인증용 `students` 테이블을 ERP와 자동 동기화하여,
신규 학생 수기 등록 부담 해소 및 상태 변경(수강 종료·환불 등)의
즉시성 확보.

---

## 2. 연동 방식 요약

**방식 B — REST Pull (면접앱이 ERP를 주기적으로 조회)**

```
┌────────────┐   GET /api/external/interview/students
│  면접앱    │   ?updated_after=ISO8601&cursor=base64&limit=500
│  (Cron)    │ ─────────────────────────────────────────────▶
│            │                                               │
│            │   Bearer {API_KEY}                            │
│  Supabase  │                                               │
│  students  │ ◀───────────────────────────────────────────  │
└────────────┘   { students: [...], next_cursor }    ┌───────▼──────┐
                                                     │   ERP API    │
                                                     │ (Supabase +  │
                                                     │  Vercel Cron)│
                                                     └──────────────┘
```

- Pull 주기: 5~10분
- 초기 이관도 동일 엔드포인트로 처리 (별도 CSV 없음)
- Webhook 방식 채택 거부 — 3개 생성 경로(WC 웹훅/수동/그룹반) 각각
  발사 지점 구축 부담 대비 실시간성 이득 없음

---

## 3. API 규격

### 3-1. 엔드포인트

```
GET https://{erp-host}/api/external/interview/students
```

#### 쿼리 파라미터

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `updated_after` | ISO8601 | 조건부 | 이 시각 이후 갱신 레코드만 (초기 pull은 `2020-01-01T00:00:00+09:00`) |
| `cursor` | string (base64 opaque) | 조건부 | 직전 응답의 `next_cursor` 값 그대로 전달 |
| `limit` | integer | No | 기본 500, 최대 500 |

- `updated_after`와 `cursor`는 택일 사용 (`cursor` 우선)

### 3-2. 인증

#### 필수 헤더

- **Authorization**: `Bearer {ERP_API_KEY}`

#### Vercel Deployment Protection 정책 (v1.2 갱신)

ERP 프로젝트는 Vercel "Standard Protection" 모드:
- Stable production alias (`erp-lilac-three.vercel.app`, `erp.evenigame.com`)는 **public** — Bearer 단독 인증으로 충분
- Deployment-specific URL (`erp-{hash}-aladins-projects-...vercel.app`)만 SSO 보호

따라서 운영 호출 표면(stable alias)에서는 `x-vercel-protection-bypass` 헤더가 **불필요**합니다. v1.1 에서 도입한 bypass 헤더 의존은 v1.2 에서 정식 폐기.

#### 키 관리

- 이브니 관리자(= eveni.mkt@gmail.com)가 ERP·면접앱 양측 단독 관리자
- API_KEY 면접앱 Vercel 환경변수에 직접 주입 (Bearer 단독 인증)
- 테스트 키 → 통합 테스트 통과 후 운영 키로 전환 (테스트 키는 즉시 폐기)
- 운영 중 키 유출 징후 시 즉시 로테이션
- 권장 회전 주기: 6~12개월 (Bearer 단일 방어이므로)

### 3-3. 응답 포맷

```json
{
  "students": [
    {
      "student_code": "V2721826",
      "name": "홍길동",
      "is_active": true,
      "updated_at": "2026-04-22T10:00:00+09:00"
    }
  ],
  "next_cursor": "eyJ1cGRhdGVkX2F0IjoiMjAyNi0wNC0yMlQxMDowMDowMCswOTowMCIsImlkIjoiLi4uIn0="
}
```

- `next_cursor`가 `null`이면 페이지네이션 종료
- 응답 정렬: `(updated_at ASC, id ASC)` — tiebreaker로 id 포함
- 삭제된 레코드 없음 (§5-3 참조) — 응답에서 누락되지 않음

### 3-4. 페이로드 필드 상세

| 필드 | 타입 | 규격 | 설명 |
|---|---|---|---|
| `student_code` | string | `^[A-Z0-9]{3,20}$` | `V` + 7자리 숫자 (예: `V2721826`). 영문 대문자·숫자만, 하이픈 불허. |
| `name` | string | 1~50자 | 실명 |
| `is_active` | boolean | — | §4-2 파생 로직 참조 |
| `updated_at` | ISO8601 | KST 오프셋 고정 | `2026-04-22T10:00:00+09:00` 형식. DB 트리거로 enrollment 변경 시에도 touch됨. |

### 3-5. 제약·SLA

| 항목 | 값 |
|---|---|
| 요청 타임아웃 | 10초 |
| 응답 크기 상한 | 1MB (limit=500 기준 실측 ≈75KB) |
| gzip 압축 | 지원 (Vercel CDN 자동, `Accept-Encoding: gzip`) |
| Rate limit | 분당 60회 |
| 수업종료 반영 지연 SLA | 최대 2주 (운영팀 수동 처리에 의존) |

---

## 4. 데이터 규격 및 정책

### 4-1. `student_code` 발급

- ERP의 기존 `student_number` 필드를 그대로 활용
- 발급 주체: 상담신청 시 지원팀 시트(영업DB분배 탭)에서 자동 부여
- 포맷: `V` + 7자리 숫자 (고정 8자)
- 과거 임시번호(`WC{orderId}-{timestamp}`)는 2026-04-22 일괄 정리 완료
  (활성 enrollment 18명 교체, 감사 로그 `action=MANUAL_WC_NUMBER_FIX` 기록)
- 재발 방지: 결제 웹훅에 지원팀 시트 실시간 매칭 폴백 배포 완료 (2026-04-21)

### 4-2. `is_active` 파생 로직 (ERP 측)

```
is_active = (
  해당 student의 enrollment 중 status NOT IN (
    '수업종료', '합격종료', '환불', '미개시환불'
  )인 건이 1건 이상 존재
)
```

- ERP는 `student` 레벨이 아닌 `enrollment`(수강등록) 단위로 상태 관리
- 한 학생이 재등록/추가결제로 여러 enrollment 보유 가능 → 개별 enrollment 종료 ≠ 학생 비활성
- `환불`·`미개시환불`은 **즉시** 반영
- `수업종료`는 **수동 처리 시점**에 반영 (최대 2주 지연 허용)

### 4-3. `updated_at` 갱신 범위

- **DB 트리거로 enrollment INSERT/UPDATE 시 student.updated_at 자동 touch**
- 포함 이벤트: 상태 변경, 추가결제, 연장, 환불, 재결제 등 전부
- 이름·연락처 변경 등 student 자체 갱신도 포함
- 결과: `is_active` 판단에 영향 주는 모든 이벤트가 `updated_at` 변화로 감지됨 → 동기화 누락 없음

---

## 5. 운영 정책

### 5-1. 재활성화 승인 큐 (면접앱 측)

ERP에서 `is_active=true`로 응답되어도 면접앱이 **자동 활성화하지 않음**.
모든 `is_active` false→true 전환 이벤트는 admin 승인 큐로 적재.

#### 재결제 케이스 2가지 (ERP)

| 케이스 | 빈도 | student_code 변화 | 면접앱 감지 방법 |
|---|---|---|---|
| 케이스 1: 상담신청 → 재결제 (대다수) | 주 경로 | **새 V-번호 발급** (기존 건 `is_active=false` 유지) | 신규 `student_code` 삽입으로 인식 |
| 케이스 2: 상담사 직접 컨택 → 재결제 | 일부 | 기존 유지 | 기존 레코드의 `is_active` false→true 전환으로 인식 |

#### admin 승인 처리

- 케이스 1: "이 신규 V-xxx가 기존 V-yyy와 동일인인가?" 수기 판단 → 학습 이력 병합 여부 결정
- 케이스 2: `is_active` 뒤집힘 즉시 로그인 허용 금지 → admin 재개 승인 필요

#### 동일인 판별 보조 필드

- `phone_hash` 등 보조 필드 **도입하지 않음** (연 1~2회 예상, 전체 학생 해시 상시 저장 대비 이익 낮음)
- admin에서 이름·수강 시기 수기 대조로 처리

### 5-2. 합격종료 학생

- `합격종료` = 서비스 종료로 간주, 재활성화 불필요
- 예외적 재이용 요청 시 **admin 수동 재활성화** 경로로만 허용
- ERP 측 변경 불요

### 5-3. 삭제 불가 원칙

- ERP는 학생 레코드 하드 삭제하지 않음
- 한 번 응답에 포함된 `student_code`는 이후에도 계속 응답 (상태만 토글)
- 재결제 케이스 1에서 기존 V-번호는 `is_active=false`로 영구 유지
- 면접앱 `students` 테이블은 monotonic 성장 전제
- 효과: admin 이력 조회 안정성 확보, 롤백 시 재pull만으로 복구 가능

### 5-4. 멱등성 보장

- 엔드포인트는 완전 idempotent GET
- 동일 `updated_after`/`cursor` 조합으로 N번 재시도 시 응답 동일
- 면접앱 측 재시도 전략: **지수 백오프 (1s → 2s → 4s, 최대 3회)**
- 5xx/타임아웃 외 4xx는 재시도 금지 (로그 기록)

### 5-5. 면접앱 이용 대상

- **이브니 전 수강생** (과목/카테고리 필터 없음)
- 응답에 `course_category` 등 분류 필드 불필요

---

## 6. 초기 이관

### 6-1. 방식

별도 CSV 전달 없이 **엔드포인트 전체 pull**로 통합 처리.

- 첫 pull: `updated_after=2020-01-01T00:00:00+09:00` 지정
- `next_cursor` 기반 순차 pull (500건 × 약 7~8회 = 3,500명 내외 완료)
- 면접앱 측 dry-run 모드로 먼저 검증 → 통과 시 full insert 전환

### 6-2. 면접앱 측 안전장치

| 장치 | 설명 |
|---|---|
| **Dry-run 모드** | 초기 3~4회 pull은 insert 없이 검증 로그만 출력 (필드 포맷·중복·규격 체크) |
| **이관 출처 플래그** | 초기 이관 레코드에 `source='erp_migration'` 표시 → 이상 시 신속 롤백 |
| **단계적 전환** | dry-run 통과 → full import 1회 → cron pull 전환 |

### 6-3. 예상 규모

- 활성 학생 **3,513명** (2026-04-22 ERP 기준)
- 현재 면접앱 students 약 1,604명 → 이관 후 3,513명으로 증가
- ERP는 종료 학생도 DB 보유하나, 응답은 `is_active=true` 기준만 전달 (초기 이관 대상도 동일)

---

## 7. 양측 구현 범위

### 7-1. ERP 측

- [ ] `student.updated_at` DDL + enrollment 트리거 (D+0.5)
- [ ] `/api/external/interview/students` 엔드포인트 구현 (D+1.5)
- [ ] Bearer 인증 + 임시·운영 API_KEY 발급 (D+2)
- [ ] 내부 검증 및 엔드포인트 오픈 (D+3.25)

### 7-2. 면접앱 측

- [ ] Pull 스케줄러 + Dry-run 모드 구현 (D+1)
- [ ] `pending_reactivations` 테이블 신설
- [ ] Admin 재활성화 승인 큐 UI 구축 (D+2.5)
- [ ] 학습 이력 병합 로직 (케이스 1용, 초기엔 수동 SQL 가능)
- [ ] 통합 테스트 케이스 작성 및 공유 (D+2)
- [ ] 환경변수(API_KEY) Vercel 설정

### 7-3. 관리자 공통 (이브니)

- API_KEY 발급 후 면접앱 Vercel env에 직접 주입
- 키 유출 징후 시 양측 로테이션
- 향후 담당자 추가 시 별도 채널 합의

---

## 8. 일정

| D-day | 담당 | 이벤트 |
|---|---|---|
| D+0 (2026-04-22) | 양측 | 착수 개시 |
| D+1 | 면접앱 | Pull 스케줄러 + Dry-run 완료 |
| D+2 | 면접앱 | 통합 테스트 케이스 공유 |
| D+2.5 | 면접앱 | `pending_reactivations` + admin UI 완료 |
| D+3.25 | ERP | 엔드포인트 오픈 + API_KEY 공유 |
| D+3.25~ | 양측 | 통합 테스트 → 운영 전환 → 이관 |

---

## 9. 통합 테스트 체크리스트

- [ ] 신규 `student_code` pull → 면접앱 `students` upsert 확인
- [ ] `is_active` false→true 감지 → `pending_reactivations` 큐 적재
- [ ] `is_active` true→false → 해당 학생 로그인 차단 확인
- [ ] 학생 이름 변경 반영
- [ ] `next_cursor` 이어받기 정상 동작
- [ ] `updated_after` 누락 이벤트 없음
- [ ] Bearer 인증 실패(401) 처리
- [ ] gzip 압축 응답 정상 해제
- [ ] 10초 타임아웃 초과 시 지수 백오프 재시도
- [ ] 4xx 응답 시 재시도 금지, 로그 기록
- [ ] 초기 전체 pull 3,500명 이관 무결성 검증
- [ ] 케이스 1(새 V-번호) admin 큐 동일인 판별 플로우
- [ ] 케이스 2(enrollment 추가) admin 승인 플로우

---

## 10. 향후 운영

- 일상 소통 채널: **이메일** (`eveni.mkt@gmail.com`) 단일
- 문서 합의 본 버전으로 종결, 구현 중 변경 발생 시 이 문서에 버전 업데이트로 반영
- 운영 중 이슈 발생 시 양측 즉시 공유

---

## 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-04-22 | v1.0 | 최초 합의 종결 (면접앱 ↔ ERP 6회 교환 완결) |
| 2026-04-22 | v1.1 | ERP 엔드포인트 오픈 반영: stable alias URL (`erp-lilac-three.vercel.app`) 확정, Vercel Deployment Protection 우회용 `x-vercel-protection-bypass` 헤더 필수화 (§3-2), 테스트→운영 키 전환 플로우 명시 |
| 2026-04-29 | v1.2 | TC-07(b) 검증으로 Vercel "Standard Protection" 정책 확인 — production alias는 public이라 bypass 헤더 불필요. 운영 키 전환과 함께 Bearer 단독 인증 정식 채택 (§3-2 갱신). `ERP_VERCEL_BYPASS_TOKEN` env + 헤더 송신 코드 폐기. |
