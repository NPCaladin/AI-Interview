'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface Student {
  id: string;
  code: string;
  name: string;
}

interface Usage {
  remaining: number;
  limit: number;
  used: number;
}

interface AuthContextValue {
  token: string | null;
  student: Student | null;
  usage: Usage | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => void;
  authHeaders: () => Record<string, string>;
  updateRemaining: (remaining: number) => void;
  refreshUsage: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEYS = {
  token: 'interview_auth_token',
  student: 'interview_auth_student',
  usage: 'interview_auth_usage',
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // sessionStorage에서 복원
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem(STORAGE_KEYS.token);
      const savedStudent = sessionStorage.getItem(STORAGE_KEYS.student);
      const savedUsage = sessionStorage.getItem(STORAGE_KEYS.usage);

      if (savedToken && savedStudent) {
        setToken(savedToken);
        setStudent(JSON.parse(savedStudent));
        if (savedUsage) {
          setUsage(JSON.parse(savedUsage));
        }
      }
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (code: string) => {
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '인증에 실패했습니다.');
    }

    setToken(data.token);
    setStudent(data.student);
    setUsage(data.usage);

    try {
      sessionStorage.setItem(STORAGE_KEYS.token, data.token);
      sessionStorage.setItem(STORAGE_KEYS.student, JSON.stringify(data.student));
      sessionStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(data.usage));
    } catch {
      // sessionStorage 저장 실패 시 무시
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setStudent(null);
    setUsage(null);

    try {
      sessionStorage.removeItem(STORAGE_KEYS.token);
      sessionStorage.removeItem(STORAGE_KEYS.student);
      sessionStorage.removeItem(STORAGE_KEYS.usage);
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, [token]);

  const updateRemaining = useCallback((remaining: number) => {
    setUsage(prev => {
      if (!prev) return prev;
      const updated = { ...prev, remaining, used: prev.limit - remaining };
      try {
        sessionStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/auth/remaining', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setUsage(data);
        try {
          sessionStorage.setItem(STORAGE_KEYS.usage, JSON.stringify(data));
        } catch {
          // ignore
        }
      }
    } catch {
      // 네트워크 오류 시 무시
    }
  }, [token, logout]);

  return (
    <AuthContext.Provider
      value={{
        token,
        student,
        usage,
        isAuthenticated: !!token && !!student,
        isLoading,
        login,
        logout,
        authHeaders,
        updateRemaining,
        refreshUsage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
