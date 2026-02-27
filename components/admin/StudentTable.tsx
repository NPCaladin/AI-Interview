'use client';

import { useState } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Search, Pencil, ToggleLeft, ToggleRight, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import StudentFormModal from './StudentFormModal';

interface Student {
  id: string;
  code: string;
  name: string;
  weekly_limit: number;
  is_active: boolean;
  created_at: string;
  weekly_usage: number;
}

interface StudentTableProps {
  students: Student[];
  onRefresh: () => void;
}

type Filter = 'all' | 'active' | 'inactive';

export default function StudentTable({ students, onRefresh }: StudentTableProps) {
  const { authHeaders } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = students.filter((s) => {
    const matchesSearch =
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === 'all' || (filter === 'active' ? s.is_active : !s.is_active);
    return matchesSearch && matchesFilter;
  });

  const handleToggle = async (student: Student) => {
    if (togglingId) return;
    setTogglingId(student.id);

    try {
      const response = await fetch('/api/admin/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id: student.id, is_active: !student.is_active }),
      });

      if (response.ok) {
        onRefresh();
      }
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  };

  const handleReset = async (student: Student) => {
    if (resettingId) return;
    if (!window.confirm(`${student.name}(${student.code})의 이번 주 사용량을 초기화할까요?`)) return;
    setResettingId(student.id);
    try {
      const response = await fetch('/api/admin/students/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id: student.id }),
      });
      if (response.ok) {
        onRefresh();
      }
    } catch {
      // ignore
    } finally {
      setResettingId(null);
    }
  };

  const handleDelete = async (student: Student) => {
    if (deletingId) return;
    if (!window.confirm(`${student.name}(${student.code})을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingId(student.id);
    try {
      const response = await fetch('/api/admin/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id: student.id }),
      });
      if (response.ok) {
        onRefresh();
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const filterButtons: { label: string; value: Filter }[] = [
    { label: '전체', value: 'all' },
    { label: '활성', value: 'active' },
    { label: '비활성', value: 'inactive' },
  ];

  return (
    <>
      {/* 검색 + 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="코드 또는 이름 검색..."
            className="w-full pl-9 pr-4 py-2.5 bg-dark-700/80 border border-dark-500 rounded-xl text-sm text-white placeholder:text-gray-500 focus:border-[#00F2FF]/60 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                filter === btn.value
                  ? 'bg-[#00F2FF]/20 text-[#00F2FF] border border-[#00F2FF]/40'
                  : 'text-gray-400 border border-white/10 hover:border-white/20 hover:text-gray-300'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="glass-card-dark rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">코드</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">이름</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">주간제한</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">이번 주</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">가입일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">액션</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">
                    {search || filter !== 'all' ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
                  </td>
                </tr>
              ) : (
                filtered.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[#00F2FF] text-xs">{student.code}</td>
                    <td className="px-4 py-3 text-white">{student.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          student.is_active
                            ? 'bg-[#00D9A5]/15 text-[#00D9A5] border border-[#00D9A5]/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {student.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{student.weekly_limit}회</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`font-medium ${
                          student.weekly_usage >= student.weekly_limit
                            ? 'text-red-400'
                            : 'text-gray-300'
                        }`}
                      >
                        {student.weekly_usage}/{student.weekly_limit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(student.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {/* 수정 버튼 */}
                        <button
                          onClick={() => setEditStudent(student)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#00F2FF] hover:bg-[#00F2FF]/10 transition-colors"
                          title="수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* 활성/비활성 토글 */}
                        <button
                          onClick={() => handleToggle(student)}
                          disabled={togglingId === student.id}
                          className={`p-1.5 rounded-lg transition-colors ${
                            student.is_active
                              ? 'text-[#00D9A5] hover:bg-[#00D9A5]/10'
                              : 'text-red-400 hover:bg-red-500/10'
                          } disabled:opacity-50`}
                          title={student.is_active ? '비활성화' : '활성화'}
                        >
                          {togglingId === student.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : student.is_active ? (
                            <ToggleRight className="w-3.5 h-3.5" />
                          ) : (
                            <ToggleLeft className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {/* 사용량 리셋 */}
                        <button
                          onClick={() => handleReset(student)}
                          disabled={!!resettingId || student.weekly_usage === 0}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#f59e0b] hover:bg-[#f59e0b]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="이번 주 사용량 초기화"
                        >
                          {resettingId === student.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* 삭제 */}
                        <button
                          onClick={() => handleDelete(student)}
                          disabled={!!deletingId}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="학생 삭제"
                        >
                          {deletingId === student.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 카운트 */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-white/5 text-xs text-gray-500">
            {filtered.length}명 표시
            {search || filter !== 'all' ? ` (전체 ${students.length}명)` : ''}
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editStudent && (
        <StudentFormModal
          student={editStudent}
          onClose={() => setEditStudent(null)}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}
