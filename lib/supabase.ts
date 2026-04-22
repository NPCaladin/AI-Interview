import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !supabaseServiceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ');
    throw new Error(`Supabase 초기화 실패: 환경변수 누락 — ${missing}. .env.local 파일을 확인하세요.`);
  }

  // Next.js 14 App Router: API Route 내부 fetch 는 기본 force-cache.
  // supabase-js 가 내부에서 global fetch 를 사용하므로 Data Cache 에 응답이 고정되어
  // UPDATE 이후 SELECT 에서 stale 값이 반환되는 문제가 있음.
  // cache: 'no-store' 로 강제하여 항상 최신 값을 읽도록 한다.
  _supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });

  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
