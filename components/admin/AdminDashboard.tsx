'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2, AlertCircle, FileText } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import StatsCards from './StatsCards';
import UsageChart from './UsageChart';
import RecentLogs from './RecentLogs';
import ErpStatusBar from './ErpStatusBar';
import { PageHeader, DataTable, EmptyState, Badge, ScoreBadge, type DataTableColumn, type BadgeTone } from './ui';

interface Stats {
  totalStudents: number;
  activeStudents: number;
  weeklyUsageCount: number;
  weeklyActiveUsers: number;
}

/**
 * GET /api/admin/sessions 응답 행 (Phase 2 API — 필드명 미확정이라 방어적으로 파싱)
 */
interface SessionRow {
  id: string;
  started_at?: string | null;
  created_at?: string | null;
  student_code?: string | null;
  student_name?: string | null;
  student?: { code?: string | null; name?: string | null } | null;
  job_name?: string | null;
  status?: string | null;
  total_score?: number | null;
}

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  in_progress: { label: '진행 중', tone: 'cyan' },
  ended: { label: '종료', tone: 'amber' },
  analyzed: { label: '분석 완료', tone: 'green' },
};

function formatKst(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const SESSION_COLUMNS: Array<DataTableColumn<SessionRow>> = [
  {
    key: 'started_at',
    header: '시작 시각 (KST)',
    className: 'whitespace-nowrap',
    render: (r) => (
      <Link href={`/admin/sessions/${r.id}`} className="text-xs text-gray-300 hover:text-[#00F2FF] tabular-nums">
        {formatKst(r.started_at ?? r.created_at)}
      </Link>
    ),
  },
  {
    key: 'student',
    header: '학생',
    render: (r) => {
      const code = r.student_code ?? r.student?.code ?? null;
      const name = r.student_name ?? r.student?.name ?? null;
      return (
        <Link href={`/admin/sessions/${r.id}`} className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[#00F2FF] text-xs">{code ?? '—'}</span>
          <span className="text-white text-xs truncate">{name ?? ''}</span>
        </Link>
      );
    },
  },
  {
    key: 'job',
    header: '직군',
    render: (r) => <span className="text-xs text-gray-300">{r.job_name ?? '—'}</span>,
  },
  {
    key: 'status',
    header: '상태',
    render: (r) => {
      const meta = r.status ? STATUS_META[r.status] : undefined;
      return <Badge tone={meta?.tone ?? 'gray'}>{meta?.label ?? r.status ?? '—'}</Badge>;
    },
  },
  {
    key: 'total_score',
    header: '총점',
    className: 'text-right',
    render: (r) => <ScoreBadge score={r.total_score} />,
  },
];

function RecentSessionsCard({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    adminFetch('/api/admin/sessions?limit=10', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setUnavailable(true);
          setRows([]);
          return;
        }
        const json = (await res.json().catch(() => null)) as
          | { sessions?: SessionRow[]; items?: SessionRow[] }
          | null;
        if (cancelled) return;
        setUnavailable(false);
        setRows(json?.sessions ?? json?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="glass-card-dark rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#00F2FF]" />
          <h2 className="text-sm font-semibold text-white">최근 면접 세션</h2>
        </div>
        {!unavailable && (
          <Link href="/admin/sessions" className="text-xs text-gray-400 hover:text-[#00F2FF] transition-colors">
            전체 보기
          </Link>
        )}
      </div>
      {unavailable && !isLoading ? (
        <EmptyState title="세션 API 준비 중" description="면접 세션 조회 기능이 곧 추가됩니다." />
      ) : (
        <DataTable
          columns={SESSION_COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyText="최근 면접 세션이 없습니다."
        />
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);
  // UsageChart/RecentLogs는 stats 로드 후 마운트 (초기 요청 분산)
  const [showCharts, setShowCharts] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/stats');
      if (!res.ok) { setError('통계 조회에 실패했습니다.'); return; }
      const data = await res.json();
      setStats(data);
      setError('');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    }
  }, []);

  // 초기 로드: stats만 먼저 → 완료 후 차트/로그 마운트
  useEffect(() => {
    setIsLoading(true);
    fetchStats().finally(() => {
      setIsLoading(false);
      setShowCharts(true);
    });
  }, [fetchStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setLogsRefreshKey((k) => k + 1);
    setSessionsRefreshKey((k) => k + 1);
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#00F2FF] animate-spin" />
          <p className="text-gray-400 text-sm">데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="대시보드"
        subtitle="이븐아이 면접 연습 — 운영 현황"
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ERP 상태 바 (동기화 상태 + 재활성화 대기) */}
      <div className="mb-6">
        <ErpStatusBar />
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="mb-8">
          <StatsCards stats={stats} />
        </div>
      )}

      {/* 이용 현황 (지연 마운트) */}
      {showCharts && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageChart />
          </div>
          <div>
            <RecentLogs refreshKey={logsRefreshKey} />
          </div>
        </div>
      )}

      {/* 최근 면접 세션 (Phase 2 API — 미구현 시 안내) */}
      {showCharts && (
        <div className="mb-8">
          <RecentSessionsCard refreshKey={sessionsRefreshKey} />
        </div>
      )}
    </div>
  );
}
