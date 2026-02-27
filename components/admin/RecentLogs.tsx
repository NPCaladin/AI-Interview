'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Clock, Loader2, RefreshCw } from 'lucide-react';

interface LogEntry {
  id: string;
  code: string;
  created_at: string;
}

export default function RecentLogs() {
  const { authHeaders } = useAdminAuth();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLogs = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await fetch('/api/admin/logs', { headers: authHeaders() });
      const json = await res.json();
      setLogs(json.logs || []);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatDateTime = (iso: string) => {
    const kst = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const diffMs = now.getTime() - kst.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;

    return `${kst.getMonth() + 1}/${kst.getDate()} ${String(kst.getHours()).padStart(2, '0')}:${String(kst.getMinutes()).padStart(2, '0')}`;
  };

  const formatDateTimeFull = (iso: string) => {
    const kst = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    return `${kst.getFullYear()}.${String(kst.getMonth() + 1).padStart(2, '0')}.${String(kst.getDate()).padStart(2, '0')} ${String(kst.getHours()).padStart(2, '0')}:${String(kst.getMinutes()).padStart(2, '0')}`;
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
