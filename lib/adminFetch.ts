/**
 * 어드민 전용 fetch 래퍼 (클라이언트)
 * - 인증은 httpOnly 쿠키(eveni_admin)로 전달되므로 Authorization 헤더를 붙이지 않는다.
 * - 401 이면 로그인 페이지로 이동(현재 경로를 next 로 보존)하고 throw.
 * - 그 외 상태코드는 호출자가 처리한다(기존 컴포넌트의 에러 처리 유지).
 */

export class AdminFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
  }
}

export function adminLoginUrl(next?: string): string {
  const target = next && next.startsWith('/admin') ? next : '/admin';
  return `/admin/login?next=${encodeURIComponent(target)}`;
}

export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: 'same-origin' });
  if (res.status === 401 && typeof window !== 'undefined') {
    const next = window.location.pathname + window.location.search;
    window.location.href = adminLoginUrl(next);
    throw new AdminFetchError('관리자 인증이 만료되었습니다.', 401);
  }
  return res;
}
