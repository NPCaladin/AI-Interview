'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { ArrowLeft, RefreshCw, Search, Loader2, AlertTriangle, ClipboardList, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import ReactivationRow from './ReactivationRow';

export interface ReactivationItem {
  id: string;
  student_code: string;
  student_id: string | null;
  source: 'case1_new_code' | 'case2_existing_code';
  transition_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  linked_student_code: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at: string;
  student: { id: string; code: string; name: string; is_active: boolean; created_at: string } | null;
  linked_student: { id: string; code: string; name: string; is_active: boolean; created_at: string } | null;
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'merged' | 'all';
const PAGE_SIZE = 20;

const FILTERS: { value: FilterStatus; label: string; color: string }[] = [
  { value: 'pending', label: '대기중', color: '#f59e0b' },
  { value: 'approved', label: '승인됨', color: '#00D9A5' },
  { value: 'merged', label: '병합됨', color: '#8b5cf6' },
  { value: 'rejected', label: '거부됨', color: '#ef4444' },
  { value: 'all', label: '전체', color: '#00F2FF' },
];

export default function ReactivationQueue() {
  const { authHeaders, logout } = useAdminAuth();
  const [items, setItems] = useState<ReactivationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError('');
    const params = new URLSearchParams({
      status: filter,
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(debouncedSearch && { search: debouncedSearch }),
    });

    try {
      const res = await fetch(`/api/admin/reactivations?${params}`, {
        headers: authHeaders(),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        setError(`조회 실패 (${res.status})`);
        return;
      }
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total || 0);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('네트워크 오류');
      }
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, logout, filter, page, debouncedSearch]);

  useEffect(() => {
    fetchItems();
    return () => abortRef.current?.abort();
  }, [fetchItems]);

  const handleAction = useCallback(async (
    id: string,
    action: 'approve' | 'reject' | 'merge',
    extra?: { linked_student_code?: string; note?: string },
  ): Promise<{ ok: boolean; error?: string; note?: string }> => {
    try {
      const res = await fetch('/api/admin/reactivations', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...extra }),
      });
      if (res.status === 401) { logout(); return { ok: false, error: '로그아웃됨' }; }
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error || '처리 실패' };
      await fetchItems();
      setExpandedId(null);
      return { ok: true, note: json.note };
    } catch {
      return { ok: false, error: '네트워크 오류' };
    }
  }, [authHeaders, logout, fetchItems]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="뒤로"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">재활성화 승인</h1>
              <p className="text-xs text-gray-400 mt-0.5">ERP 재수강 / 신규 V-번호 검토 · 승인 · 병합</p>
            </div>
          </div>
          <button
            onClick={fetchItems}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 필터 + 검색 */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.02]">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setPage(1); }}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${filter === f.value
                    ? 'text-dark-900'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
                style={filter === f.value ? {
                  background: f.color,
                  boxShadow: `0 0 12px ${f.color}40`,
                } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-[200px] max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="student_code 검색..."
              className="
                w-full pl-10 pr-3 py-2.5 rounded-xl text-sm
                bg-white/[0.02] border border-white/10
                text-white placeholder-gray-500
                focus:outline-none focus:border-[#00F2FF]/50 focus:bg-white/[0.04]
                transition-colors
              "
            />
          </div>

          <div className="text-xs text-gray-400 font-tech tabular-nums">
            <span className="text-white font-semibold">{total}</span>건
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 p-4 mb-5 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* 목록 */}
        <div className="glass-card-dark rounded-xl border border-white/10">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-[#00F2FF] animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              {filter === 'pending' ? (
                <>
                  <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm text-gray-400 mb-1">처리할 항목이 없습니다</p>
                  <p className="text-xs">새로운 재활성화 요청이 들어오면 여기에 표시됩니다</p>
                </>
              ) : (
                <>
                  <Inbox className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">해당 상태의 항목 없음</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {items.map((item) => (
                <ReactivationRow
                  key={item.id}
                  item={item}
                  isExpanded={expandedId === item.id}
                  onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-400 font-tech tabular-nums px-3">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
