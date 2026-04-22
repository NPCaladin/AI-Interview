'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Activity, ClipboardList, ChevronRight, Loader2 } from 'lucide-react';

interface SyncState {
  last_success_at: string | null;
  last_run_at: string | null;
  is_running: boolean;
}

interface Status {
  sync: SyncState | null;
  pendingCount: number;
  lastRunStatus: string | null;
}

type Health = 'ok' | 'warn' | 'error' | 'unknown';

function deriveHealth(state: SyncState | null, lastRunStatus: string | null): Health {
  if (!state) return 'unknown';
  if (state.is_running) return 'ok';
  if (!state.last_success_at) {
    return lastRunStatus === 'failed' ? 'error' : 'unknown';
  }
  const successMs = Date.now() - new Date(state.last_success_at).getTime();
  const H = 3600_000;
  if (successMs > 72 * H) return 'error';
  if (successMs > 48 * H) return 'warn';
  return 'ok';
}

function relativeTime(iso: string | null): string {
  if (!iso) return '기록 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3600_000);
  const day = Math.floor(diff / 86400_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${day}일 전`;
}

const HEALTH_STYLES: Record<Health, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-[#00D9A5]', text: 'text-[#00D9A5]', label: '정상' },
  warn: { dot: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: '주의' },
  error: { dot: 'bg-red-500', text: 'text-red-400', label: '오류' },
  unknown: { dot: 'bg-gray-500', text: 'text-gray-400', label: '미실행' },
};

export default function ErpStatusBar() {
  const { authHeaders, logout } = useAdminAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const [syncRes, pendingRes] = await Promise.all([
        fetch('/api/admin/sync-status', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/api/admin/reactivations?status=pending&limit=1', { headers: authHeaders(), cache: 'no-store' }),
      ]);

      if (syncRes.status === 401 || pendingRes.status === 401) { logout(); return; }
      if (!syncRes.ok || !pendingRes.ok) { setStatus(null); return; }

      const syncJson = await syncRes.json();
      const pendingJson = await pendingRes.json();

      const runs = syncJson.recentRuns || [];
      const lastRunStatus = runs.length > 0 ? runs[0].status : null;

      setStatus({
        sync: syncJson.state,
        pendingCount: pendingJson.total || 0,
        lastRunStatus,
      });
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, logout]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.02] text-gray-500 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>ERP 상태 확인 중...</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
        <span>ERP 상태 조회 실패</span>
        <button onClick={fetchStatus} className="underline hover:text-red-300">다시 시도</button>
      </div>
    );
  }

  const health = deriveHealth(status.sync, status.lastRunStatus);
  const healthStyle = HEALTH_STYLES[health];
  const pendingCount = status.pendingCount;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 동기화 상태 칩 */}
      <Link
        href="/admin/sync"
        className="
          group flex items-center gap-2.5 px-4 py-2.5 rounded-xl
          border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20
          transition-all duration-200
        "
      >
        <div className="flex items-center gap-2">
          <span className="relative flex w-2 h-2">
            <span className={`absolute inset-0 rounded-full ${healthStyle.dot} ${health === 'error' || health === 'warn' ? 'animate-pulse' : ''}`} />
          </span>
          <Activity className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-colors" />
          <span className="text-xs font-medium text-gray-300">ERP 동기화</span>
        </div>
        <span className={`text-xs ${healthStyle.text}`}>{healthStyle.label}</span>
        <span className="text-xs text-gray-500 font-tech tabular-nums">
          {status.sync?.is_running ? '실행 중' : relativeTime(status.sync?.last_success_at ?? null)}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-white transition-colors" />
      </Link>

      {/* 재활성화 대기 큐 칩 */}
      <Link
        href="/admin/reactivations"
        className={`
          group flex items-center gap-2.5 px-4 py-2.5 rounded-xl
          border transition-all duration-200
          ${pendingCount > 0
            ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 hover:bg-[#f59e0b]/15 hover:border-[#f59e0b]/60'
            : 'border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20'
          }
        `}
      >
        <ClipboardList className={`w-3.5 h-3.5 transition-colors ${pendingCount > 0 ? 'text-[#f59e0b]' : 'text-gray-400 group-hover:text-white'}`} />
        <span className="text-xs font-medium text-gray-300">재활성화 승인</span>
        {pendingCount > 0 ? (
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-[#f59e0b] text-dark-900 tabular-nums">
            {pendingCount}
          </span>
        ) : (
          <span className="text-xs text-gray-500">대기 없음</span>
        )}
        <ChevronRight className={`w-3.5 h-3.5 transition-colors ${pendingCount > 0 ? 'text-[#f59e0b]/70 group-hover:text-[#f59e0b]' : 'text-gray-600 group-hover:text-white'}`} />
      </Link>
    </div>
  );
}
