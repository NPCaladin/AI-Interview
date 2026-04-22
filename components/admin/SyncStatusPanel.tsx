'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import {
  ArrowLeft, RefreshCw, Loader2, AlertTriangle,
  Clock, Target, PlayCircle, ClipboardList, Play, Lock, Info,
} from 'lucide-react';
import SyncRunTimeline from './SyncRunTimeline';

interface SyncState {
  id: number;
  last_updated_at: string | null;
  last_cursor: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  is_running: boolean;
  started_at: string | null;
}

interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  pages_fetched: number;
  records_upserted: number;
  records_queued: number;
  error_code: string | null;
  error_snippet: string | null;
  dry_run: boolean;
}

interface StatusResponse {
  state: SyncState | null;
  recentRuns: SyncRun[];
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

function absoluteKst(iso: string | null): string {
  if (!iso) return '-';
  const kst = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

function ConfirmTriggerModal({ onConfirm, onCancel, isRunning }: {
  onConfirm: (dryRun: boolean) => void; onCancel: () => void; isRunning: boolean;
}) {
  const [dryRun, setDryRun] = useState(true);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl border border-[#00F2FF]/40 bg-[#12121a] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-3">ERP 동기화 수동 실행</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-4">
          지금 즉시 ERP에서 학생 정보를 pull 합니다. 일반적으로 매일 오전 3시 Cron 자동 실행되므로, 긴급 상황에만 사용하세요.
        </p>
        <label className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/10 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#00F2FF]"
          />
          <div>
            <div className="text-sm text-white">Dry-run 모드</div>
            <div className="text-xs text-gray-500 mt-0.5">DB 변경 없이 검증 로그만 출력. 처음 실행 시 권장.</div>
          </div>
        </label>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isRunning}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-300 border border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(dryRun)}
            disabled={isRunning}
            className="
              flex-1 py-2.5 rounded-xl text-sm font-bold
              bg-gradient-to-r from-[#00D9A5] to-[#00F2FF] text-dark-900
              hover:shadow-[0_0_20px_rgba(0,242,255,0.4)]
              transition-all duration-200 disabled:opacity-50
              flex items-center justify-center gap-2
            "
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>실행</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SyncStatusPanel() {
  const { authHeaders, logout } = useAdminAuth();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    try {
      const [statusRes, pendingRes] = await Promise.all([
        fetch('/api/admin/sync-status', { headers: authHeaders(), cache: 'no-store' }),
        fetch('/api/admin/reactivations?status=pending&limit=1', { headers: authHeaders(), cache: 'no-store' }),
      ]);
      if (statusRes.status === 401 || pendingRes.status === 401) { logout(); return; }
      if (!statusRes.ok) {
        setError(`상태 조회 실패 (${statusRes.status})`);
        return;
      }
      const statusJson = await statusRes.json();
      const pendingJson = pendingRes.ok ? await pendingRes.json() : { total: 0 };
      setData(statusJson);
      setPendingCount(pendingJson.total || 0);
    } catch {
      setError('네트워크 오류');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [authHeaders, logout]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTrigger = async (dryRun: boolean) => {
    setIsTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/admin/sync-status', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      if (res.status === 401) { logout(); return; }
      const json = await res.json();
      if (!res.ok) {
        setTriggerResult(`오류: ${json.error || '실행 실패'}`);
      } else {
        setTriggerResult(
          `완료 — pages=${json.pagesFetched}, upserted=${json.upserted}, queued=${json.queued}, deactivated=${json.deactivated}, errors=${json.errorsCount ?? json.errors?.length ?? 0} (${json.dryRun ? 'dry-run' : '실운영'})`
        );
        setShowConfirm(false);
        await fetchData(true);
      }
    } catch {
      setTriggerResult('네트워크 오류');
    } finally {
      setIsTriggering(false);
    }
  };

  const copyCursor = async () => {
    if (!data?.state?.last_cursor) return;
    try {
      await navigator.clipboard.writeText(data.state.last_cursor);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#00F2FF] animate-spin" />
      </div>
    );
  }

  const state = data?.state;
  const runs = data?.recentRuns || [];
  const lastRun = runs[0];

  const isDryRun = lastRun?.dry_run ?? false;

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
              <h1 className="text-2xl font-bold text-white">동기화 상태</h1>
              <p className="text-xs text-gray-400 mt-0.5">ERP 학생 정보 Pull 모니터링</p>
            </div>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* 상태 카드 4개 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* 마지막 pull */}
          <div className="glass-card-dark rounded-xl p-5 border border-white/10 relative overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at top right, #00F2FF, transparent 70%)' }} />
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ background: '#00F2FF15', border: '1px solid #00F2FF30' }}>
                <Clock className="w-5 h-5" style={{ color: '#00F2FF', filter: 'drop-shadow(0 0 6px rgba(0,242,255,0.3))' }} />
              </div>
            </div>
            <div className="text-lg font-bold text-white mb-0.5 tabular-nums">
              {state?.is_running ? '실행 중...' : relativeTime(state?.last_success_at ?? null)}
            </div>
            <div className="text-xs text-gray-400">마지막 성공 pull</div>
            {state?.last_success_at && (
              <div className="text-[10px] text-gray-500 font-tech tabular-nums mt-1">
                {absoluteKst(state.last_success_at)}
              </div>
            )}
          </div>

          {/* Cursor */}
          <div className="glass-card-dark rounded-xl p-5 border border-white/10">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ background: '#00D9A515', border: '1px solid #00D9A530' }}>
                <Target className="w-5 h-5" style={{ color: '#00D9A5' }} />
              </div>
              {state?.last_cursor && (
                <button
                  onClick={copyCursor}
                  className="text-[10px] px-2 py-1 rounded-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {copied ? '복사됨' : '복사'}
                </button>
              )}
            </div>
            <div className="text-sm font-mono text-white mb-0.5 truncate" title={state?.last_cursor || ''}>
              {state?.last_cursor ? `${state.last_cursor.slice(0, 14)}...` : '없음'}
            </div>
            <div className="text-xs text-gray-400">현재 cursor</div>
            <div className="text-[10px] text-gray-500 mt-1">
              last_updated_at: <span className="font-tech tabular-nums">{state?.last_updated_at ? relativeTime(state.last_updated_at) : '-'}</span>
            </div>
          </div>

          {/* Dry-run 모드 */}
          <div className={`glass-card-dark rounded-xl p-5 border relative overflow-hidden ${isDryRun ? 'border-[#f59e0b]/40' : 'border-white/10'}`}>
            <div className="absolute inset-0 opacity-5" style={{ background: `radial-gradient(circle at top right, ${isDryRun ? '#f59e0b' : '#00D9A5'}, transparent 70%)` }} />
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{
                background: `${isDryRun ? '#f59e0b' : '#00D9A5'}15`,
                border: `1px solid ${isDryRun ? '#f59e0b' : '#00D9A5'}30`,
              }}>
                <PlayCircle className="w-5 h-5" style={{ color: isDryRun ? '#f59e0b' : '#00D9A5' }} />
              </div>
            </div>
            <div className="text-lg font-bold mb-0.5" style={{ color: isDryRun ? '#f59e0b' : '#00D9A5' }}>
              {isDryRun ? 'Dry-run ON' : '실운영 모드'}
            </div>
            <div className="text-xs text-gray-400">최근 실행 모드</div>
            {isDryRun && (
              <div className="text-[10px] text-[#f59e0b]/80 mt-1">
                DB 변경 비활성 — 검증 로그만
              </div>
            )}
          </div>

          {/* 대기 큐 */}
          <Link
            href="/admin/reactivations"
            className="glass-card-dark rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ background: '#8b5cf615', border: '1px solid #8b5cf630' }}>
                <ClipboardList className="w-5 h-5" style={{ color: '#8b5cf6' }} />
              </div>
              <span className="text-[10px] text-gray-500 group-hover:text-white transition-colors">이동 →</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1 tabular-nums">{pendingCount ?? '-'}</div>
            <div className="text-xs text-gray-400">재활성화 대기 건수</div>
          </Link>
        </div>

        {/* 수동 트리거 + Cron 안내 */}
        <div className="glass-card-dark rounded-xl p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#00F2FF]/10 border border-[#00F2FF]/30">
                <Info className="w-5 h-5 text-[#00F2FF]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white mb-0.5">Cron 스케줄</div>
                <div className="text-xs text-gray-400">매일 오전 3시 (KST) — <span className="font-mono text-gray-500">0 18 * * *</span> UTC</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {state?.is_running && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  <span>실행 중 — 잠금</span>
                </div>
              )}
              <button
                onClick={() => setShowConfirm(true)}
                disabled={state?.is_running}
                className="
                  flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                  bg-gradient-to-r from-[#00D9A5] to-[#00F2FF] text-dark-900
                  shadow-[0_0_20px_rgba(0,242,255,0.25)]
                  hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                  transition-all duration-200
                "
              >
                <Play className="w-4 h-4" />
                <span>지금 동기화</span>
              </button>
            </div>
          </div>
          {triggerResult && (
            <div className="mt-4 p-3 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-gray-300 font-mono">
              {triggerResult}
            </div>
          )}
        </div>

        {/* 최근 10회 실행 이력 */}
        <SyncRunTimeline runs={runs} />
      </div>

      {showConfirm && (
        <ConfirmTriggerModal
          onConfirm={handleTrigger}
          onCancel={() => setShowConfirm(false)}
          isRunning={isTriggering}
        />
      )}
    </div>
  );
}
