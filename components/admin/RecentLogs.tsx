'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Clock, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface LogEntry {
  id: string;
  code: string;
  created_at: string;
}

export default function RecentLogs({ refreshKey = 0 }: { refreshKey?: number }) {
  const { authHeaders, logout } = useAdminAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchLogs = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/admin/logs', {
        headers: { ...authHeaders(), 'Cache-Control': 'no-cache' },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setFetchError(errJson.error || `서버 오류 (${res.status})`);
        return;
      }
      const json = await res.json();
      setLogs(json.logs || []);
    } catch {
      setFetchError('네트워크 오류');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [authHeaders, logout]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  const formatDateTime = (iso: string) => {
    const logTime = new Date(iso).getTime();
    const nowTime = Date.now();
    const diffMs = nowTime - logTime;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;

    // KST = UTC+9
    const kst = new Date(logTime + 9 * 3600000);
    return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
  };

  const formatDateTimeFull = (iso: string) => {
    const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
    return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="glass-card-dark rounded-xl border border-white/10 p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#8b5cf6]" />
          <h2 className="text-sm font-semibold text-white">최근 이용 로그</h2>
          {!isLoading && (
            <span className="text-xs text-gray-500">최근 {logs.length}건</span>
          )}
        </div>
        <button
          onClick={() => fetchLogs(true)}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 text-[#8b5cf6] animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-xs">{fetchError}</span>
          <button
            onClick={() => fetchLogs(true)}
            className="text-xs text-gray-400 hover:text-white underline mt-1"
          >
            다시 시도
          </button>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
          이용 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto scrollbar-gaming pr-1">
          {logs.map((log, idx) => (
            <div
              key={log.id}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                idx === 0 ? 'bg-[#8b5cf6]/10 border border-[#8b5cf6]/20' : 'bg-white/[0.02] hover:bg-white/5'
              }`}
              title={formatDateTimeFull(log.created_at)}
            >
              <div className="flex items-center gap-2">
                {idx === 0 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-pulse" />
                )}
                <span className="font-mono text-xs text-[#00F2FF]">{log.code}</span>
              </div>
              <span className="text-xs text-gray-400 font-tech tabular-nums">
                {formatDateTime(log.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
