'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/adminFetch';
import { Search, Pencil, ToggleLeft, ToggleRight, Loader2, RotateCcw, Trash2, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import StudentFormModal from './StudentFormModal';
import { Badge, ConfirmModal } from './ui';

interface Student {
  id: string;
  code: string;
  name: string;
  weekly_limit: number;
  is_active: boolean;
  created_at: string;
  weekly_usage: number;
  total_usage: number;
  sync_exempt?: boolean | null;
  sync_exempt_until?: string | null;
}

interface StudentTableProps {
  onRefresh: () => void;
  refreshKey?: number;
}

type Filter = 'all' | 'active' | 'inactive' | 'exempt';
const PAGE_SIZE = 20;

export default function StudentTable({ onRefresh, refreshKey = 0 }: StudentTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 검색어 디바운스 (300ms)
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // 검색 변경 시 1페이지로
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // 단일 useEffect로 모든 조건 변경 시 서버 조회 (AbortController로 경쟁 방지)
  useEffect(() => {
    // 이전 요청 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(filter !== 'all' && { filter }),
    });

    adminFetch(`/api/admin/students?${params}`, {
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && !controller.signal.aborted) {
          setStudents(data.students || []);
          setTotal(data.total || 0);
          // 마지막 페이지 삭제 시 빈 페이지 보정
          const maxPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
          if (page > maxPage) setPage(maxPage);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, debouncedSearch, filter, refreshKey]);

  // 검색어 입력 핸들러 (UI만 업데이트, 실제 조회는 debouncedSearch가 담당)
  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  // 필터 변경
  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };

  // 액션 후 갱신 — onRefresh가 상위에서 refreshKey를 증가시키므로 useEffect가 재실행됨
  const refresh = onRefresh;

  const handleToggle = async (student: Student) => {
    if (togglingId) return;
    setTogglingId(student.id);
    try {
      const response = await adminFetch('/api/admin/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, is_active: !student.is_active }),
      });
      if (response.ok) refresh();
    } catch {
      // ignore
    } finally {
      setTogglingId(null);
    }
  };

  const handleReset = async (student: Student) => {
    if (resettingId) return;
    setConfirmModal({
      title: '사용량 초기화',
      confirmLabel: '초기화',
      message: `${student.name}(${student.code})의 이번 주 사용량을 초기화할까요?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setResettingId(student.id);
        try {
          const response = await adminFetch('/api/admin/students/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: student.id }),
          });
          if (response.ok) refresh();
        } catch { /* ignore */ } finally { setResettingId(null); }
      },
    });
  };

  const handleDelete = async (student: Student) => {
    if (deletingId) return;
    setConfirmModal({
      title: '학생 삭제',
      confirmLabel: '삭제',
      message: `${student.name}(${student.code})을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setDeletingId(student.id);
        try {
          const response = await adminFetch('/api/admin/students', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: student.id }),
          });
          if (response.ok) {
            refresh();
          } else {
            const j = await response.json().catch(() => ({}));
            toast.error(j.error || '학생 삭제에 실패했습니다.');
          }
        } catch { /* ignore */ } finally { setDeletingId(null); }
      },
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const filterButtons: { label: string; value: Filter }[] = [
    { label: '전체', value: 'all' },
    { label: '활성', value: 'active' },
    { label: '비활성', value: 'inactive' },
    { label: '동기화 예외', value: 'exempt' },
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
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="코드 또는 이름 검색..."
            className="w-full pl-9 pr-4 py-2.5 bg-dark-700/80 border border-dark-500 rounded-xl text-sm text-white placeholder:text-gray-500 focus:border-[#00F2FF]/60 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => handleFilterChange(btn.value)}
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
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">누적</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">예외</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400">가입일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">액션</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400">관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12">
                    <Loader2 className="w-5 h-5 text-[#00F2FF] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500 text-sm">
                    {search || filter !== 'all' ? '검색 결과가 없습니다.' : '등록된 학생이 없습니다.'}
                  </td>
                </tr>
              ) : (
                students.map((student) => (
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
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-400 font-tech">{student.total_usage}회</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {student.sync_exempt ? (
                        <Badge tone="amber">
                          동기화 예외{student.sync_exempt_until ? ` ~${student.sync_exempt_until.slice(0, 10)}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(student.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/admin/students/${student.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-[#00F2FF] hover:bg-[#00F2FF]/10 transition-colors whitespace-nowrap"
                          title="상세"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          상세
                        </Link>
                        <button
                          onClick={() => setEditStudent(student)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#00F2FF] hover:bg-[#00F2FF]/10 transition-colors"
                          title="수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
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

        {/* 페이지네이션 */}
        <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            전체 {total}명{search || filter !== 'all' ? ' (필터 적용)' : ''}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-400 px-2 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 수정 모달 */}
      {editStudent && (
        <StudentFormModal
          student={editStudent}
          onClose={() => setEditStudent(null)}
          onSuccess={refresh}
        />
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        confirmLabel={confirmModal?.confirmLabel}
        tone="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </>
  );
}
