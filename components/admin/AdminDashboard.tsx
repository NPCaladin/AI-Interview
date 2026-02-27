'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { LogOut, RefreshCw, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import StatsCards from './StatsCards';
import StudentTable from './StudentTable';
import StudentFormModal from './StudentFormModal';

interface Stats {
  totalStudents: number;
  activeStudents: number;
  weeklyUsageCount: number;
  weeklyActiveUsers: number;
}

interface Student {
  id: string;
  code: string;
  name: string;
  weekly_limit: number;
  is_active: boolean;
  created_at: string;
  weekly_usage: number;
}

export default function AdminDashboard() {
  const { authHeaders, logout } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers = authHeaders();
      const [statsRes, studentsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/students', { headers }),
      ]);

      if (statsRes.status === 401 || studentsRes.status === 401) {
        logout();
        return;
      }

      if (!statsRes.ok || !studentsRes.ok) {
        setError('데이터 조회에 실패했습니다.');
        return;
      }

      const [statsData, studentsData] = await Promise.all([
        statsRes.json(),
        studentsRes.json(),
      ]);

      setStats(statsData);
      setStudents(studentsData.students || []);
      setError('');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    }
  }, [authHeaders, logout]);

  useEffect(() => {
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#00F2FF] animate-spin" />
          <p className="text-gray-400 text-sm">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">관리자 대시보드</h1>
            <p className="text-xs text-gray-400 mt-1">EvenI 면접 연습 — 학생 관리</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* 통계 카드 */}
        {stats && (
          <div className="mb-8">
            <StatsCards stats={stats} />
          </div>
        )}

        {/* 학생 목록 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">학생 목록</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="
                flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                bg-gradient-to-r from-[#00D9A5] to-[#00F2FF]
                text-dark-900
                shadow-[0_0_20px_rgba(0,242,255,0.25)]
                hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]
                transition-all duration-200
              "
            >
              <UserPlus className="w-4 h-4" />
              <span>학생 추가</span>
            </button>
          </div>

          <StudentTable students={students} onRefresh={handleRefresh} />
        </div>
      </div>

      {/* 학생 추가 모달 */}
      {showAddModal && (
        <StudentFormModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}
