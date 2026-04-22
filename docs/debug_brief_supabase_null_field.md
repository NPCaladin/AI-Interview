# [디버그 의뢰] Supabase single-column null on Vercel only

## 1줄 요약

**Vercel production의 Next.js API 라우트가 Supabase 테이블 `erp_sync_state`에서 `last_updated_at` 컬럼만 `null`로 읽어오는데, 로컬 Node 스크립트는 같은 URL/키로 동일 row의 동일 컬럼을 정상 값으로 읽어옴.**

같은 row의 다른 필드(`id`, `last_cursor`, `last_run_at`)는 양쪽 모두 정상.

---

## 환경

- Next.js 14.2.33 (App Router)
- `@supabase/supabase-js` v2.x (`lib/supabase.ts` lazy-init Proxy 싱글톤)
- Supabase — `sb_secret_` 프리픽스 41자 service_role key
  - 레거시 JWT 키가 아님, 신규 API 키 형식
- Vercel serverless (Node runtime, maxDuration=60)
- Cron 엔드포인트: `/api/cron/erp-pull` (Bearer CRON_SECRET 검증 후 `runErpPull()` 호출)
- DB: Supabase hosted PostgreSQL

---

## 재현 — 같은 순간, 같은 DB, 다른 결과

### 로컬 Node 스크립트 (WSL/Windows bash)

```js
const sb = createClient(
  process.env.SUPABASE_URL,           // https://falbyilzmryyrabnrctz.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY // sb_secret_...(41자)
);
const { data } = await sb
  .from('erp_sync_state')
  .select('*')
  .eq('id', 1)
  .maybeSingle();
console.log(data);
```

**출력**:
```json
{
  "id": 1,
  "last_updated_at": "2026-04-21T22:00:00+00:00",  ← 값 정상
  "last_cursor": null,
  "last_run_at": "2026-04-22T10:43:22.734+00:00",
  "last_success_at": "2026-04-21T21:49:36+00:00",
  "is_running": false,
  "started_at": "2026-04-22T10:43:22.734+00:00"
}
```

### Vercel production `lib/erp/sync.ts` loadSyncState

```ts
async function loadSyncState(): Promise<SyncStateRow | null> {
  const { data, error } = await supabase
    .from('erp_sync_state')
    .select('id, last_updated_at, last_cursor, last_run_at, last_success_at, is_running, started_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) { logger.error('...', error); return null; }
  return (data as SyncStateRow) ?? null;
}
```

**Vercel 로그 (동일 시각에 수회 재현)**:
```
[ERP Sync][DEBUG] state raw: {
  state_last_updated_at: null,                       ← null!
  state_last_cursor: null,
  state_type_last_updated_at: 'object',              ← typeof null === 'object'
  initialUpdatedAfter: '2020-01-01T00:00:00+09:00',
  computed_startUpdatedAfter: '2020-01-01T00:00:00+09:00',
  computed_updatedAfter: '2020-01-01T00:00:00+09:00',
  computed_cursor: null
}
```

`last_run_at`은 Vercel에서 `acquireRunLock()` 직전 쓴 값을 직후 읽으면 정상 받아옴. `last_updated_at` **만** null.

---

## 컬럼 정의 (`supabase/migrations/erp_sync.sql`)

```sql
CREATE TABLE IF NOT EXISTS erp_sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_updated_at TIMESTAMPTZ NULL,
  last_cursor TEXT NULL,
  last_run_at TIMESTAMPTZ NULL,
  last_success_at TIMESTAMPTZ NULL,
  is_running BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NULL
);

INSERT INTO erp_sync_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

- `last_updated_at`도 `last_run_at`도 같은 `TIMESTAMPTZ NULL` 타입
- 초기값은 전부 NULL
- 이후 SQL `UPDATE`로 `last_updated_at = '2026-04-22T07:00:00+09:00'` 세팅

---

## 시도한 디버깅 (전부 효과 없음)

- [x] `SUPABASE_URL`이 로컬과 Vercel에서 동일 — `falbyilzmryyrabnrctz`
- [x] `SUPABASE_SERVICE_ROLE_KEY` 형식 확인 — `sb_secret_` 41자, 양쪽 동일 추정
- [x] `NOTIFY pgrst, 'reload schema'` 실행 — 변화 없음
- [x] `ALTER TABLE erp_sync_state DISABLE ROW LEVEL SECURITY;` 실행 — 변화 없음
  - 참고: Supabase 프로젝트 기본 설정으로 신규 테이블 RLS 자동 enable 상태였음
  - `students`(기존 테이블)만 RLS disabled, 신규 3개 테이블(`erp_sync_state`, `erp_sync_runs`, `pending_reactivations`) RLS enabled 였음
- [x] `information_schema.column_privileges` 조회 — `service_role` 계정에 전 컬럼 SELECT/INSERT/UPDATE 정상 부여
- [x] Vercel 재배포 (Use existing Build Cache / 전체 재빌드 각각) — 변화 없음
- [x] 로컬 Node에서 같은 코드로 fetch — 값 정상 읽힘

---

## 코드 레퍼런스

### `lib/supabase.ts` — Lazy-init Proxy

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
```

### `lib/erp/sync.ts` (loadSyncState 부분)

```ts
async function loadSyncState(): Promise<SyncStateRow | null> {
  const { data, error } = await supabase
    .from('erp_sync_state')
    .select('id, last_updated_at, last_cursor, last_run_at, last_success_at, is_running, started_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    logger.error('[ERP Sync] loadSyncState error:', error);
    return null;
  }
  return (data as SyncStateRow) ?? null;
}
```

### 호출부 (sync.ts runErpPull 내부)

```ts
const state = await loadSyncState();
const startCursor = state?.last_cursor ?? null;
const startUpdatedAfter = state?.last_updated_at ?? initialUpdatedAfter;
// ↑ 로컬에서는 state.last_updated_at = "2026-04-21T22:00:00+00:00"
// ↑ Vercel에서는 state.last_updated_at = null → initialUpdatedAfter('2020-01-01') 폴백
```

---

## 증상 영향

- `last_updated_at`이 null로 읽히면 sync.ts가 `initialUpdatedAfter`(2020-01-01)로 폴백
- ERP API에 `updated_after=2020-01-01T00:00:00+09:00` 로 호출 → 전체 3,529 records 반환
- 8 pages × 500 records 처리, 매 Cron 호출 17초 (dry-run) / 60초 초과(실운영) 타임아웃
- 실운영 모드로 전환 불가 → 매일 자동 동기화 미작동

### 비교용 정상 동작 기대치
- `last_updated_at`이 "2026-04-21T22:00:00+00:00"로 읽히면
- ERP 직접 테스트 시 그 watermark로 요청 → 38 records 1페이지만 반환
- 빠른 응답, 60초 제한 여유

---

## Codex에 묻고 싶은 질문

1. **Supabase `sb_secret_` 형식 키와 TIMESTAMPTZ 컬럼 상호작용**에서 알려진 이슈가 있나?
2. **Vercel serverless 환경의 connection pooler (Supavisor/PgBouncer)** 설정이 특정 컬럼을 masking 할 수 있나?
3. `@supabase/supabase-js`가 Vercel 콜드 스타트 시 **PostgREST schema 캐시**를 client-side로 들고 있나? (공식 문서엔 없지만 내부 동작)
4. `service_role`이 정말로 RLS를 bypass하고 있는지 Vercel 환경에서 검증할 방법?
5. **row는 읽히는데 특정 컬럼만 null로 오는 패턴**의 Postgres/PostgREST/Supabase 원인 카탈로그?

---

## 필요 시 추가 제공 가능

- Vercel 로그 전체 (최근 실행 3회분)
- `lib/erp/sync.ts` 전체 (490 lines)
- Supabase 프로젝트의 전체 마이그레이션 SQL
- `next.config.js` (CSP 포함)
- `middleware.ts` (Edge runtime, `/api/cron/` PUBLIC_PATHS로 JWT 우회)

---

## 프로젝트 경로 (참고)

```
C:\Users\master\Desktop\AI_Interview\
  ├ lib/supabase.ts
  ├ lib/erp/sync.ts         (loadSyncState는 line 131~142)
  ├ lib/erp/client.ts
  ├ app/api/cron/erp-pull/route.ts
  ├ supabase/migrations/erp_sync.sql
  └ docs/ERP_연동_합의서_최종.md    (전체 통합 컨텍스트)
```

GitHub: `https://github.com/NPCaladin/AI-Interview`
최근 커밋: `d9d0547` (Debug 로깅 추가)
