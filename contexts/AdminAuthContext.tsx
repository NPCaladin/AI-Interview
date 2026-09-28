'use client';

/**
 * 어드민 세션 컨텍스트 (쿠키 기반)
 * - 토큰은 httpOnly 쿠키(eveni_admin)에 있어 클라이언트가 직접 읽지 않는다.
 * - 마운트 시 GET /api/admin/auth 로 현재 작업자(actor)를 확인한다.
 * - 페이지 보호는 middleware 가 담당(비로그인 → /admin/login 리다이렉트).
 *   이 컨텍스트는 actor 표시·로그아웃 용도이다.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface AdminAuthContextValue {
  /** 로그인한 작업자 이름. 미확인/비로그인 시 null */
  actor: string | null;
  isLoading: boolean;
  /** 서버에 actor 재조회 */
  refresh: () => Promise<void>;
  /** 쿠키 삭제 후 로그인 페이지로 이동 */
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';
  const [actor, setActor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!isLoginPage);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auth', { method: 'GET', credentials: 'same-origin' });
      if (!res.ok) {
        setActor(null);
        return;
      }
      const data = (await res.json()) as { actor?: unknown };
      setActor(typeof data.actor === 'string' ? data.actor : 'admin');
    } catch {
      setActor(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoginPage) {
      setIsLoading(false);
      return;
    }
    void refresh();
  }, [isLoginPage, refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      // 네트워크 실패여도 로그인 페이지로 보낸다 (쿠키는 만료로 자연 소멸)
    }
    setActor(null);
    window.location.href = '/admin/login';
  }, []);

  return (
    <AdminAuthContext.Provider value={{ actor, isLoading, refresh, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return ctx;
}
