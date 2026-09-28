'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, CheckCircle2, DollarSign, Loader2, Search, Trophy, Users } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { COMPANY_LIST } from '@/lib/constants';
import { formatUsd } from '@/lib/llmCost';
import {
  Badge,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  StatTile,
  type DataTableColumn,
} from '@/components/admin/ui';
import StatsRadar, { type CompetencyAvg } from '@/components/admin/StatsRadar';

// ---------------------------------------------
// 타입
// ---------------------------------------------
interface GroupRow {
  sessions: number;
  analyzed: number;
  avg_score: number | null;
}
interface JobRow extends GroupRow {
  job_name: string;
}
interface CompanyRow extends GroupRow {
  company_name: string;
}
interface DailyRow {
  date: string;
  sessions: number;
  analyzed: number;
}
interface HistogramRow {
  bucket: string;
  count: number;
}
interface QuestionRow {
  question_number: number;
  avg_score: number | null;
  n: number;
}
interface OverviewResponse {
  range: { from: string; to: string };
  totals: {
    sessions: number;
    analyzed: number;
    students: number;
    avg_score: number | null;
    pass: { 합격: number; 보류: number; 불합격: number };
    tokens: { chat_in: number; chat_out: number; ana_in: number; ana_out: number };
  };
  by_job: JobRow[];
  by_company: CompanyRow[];
  competency_avg: CompetencyAvg;
  score_histogram: HistogramRow[];
  daily: DailyRow[];
  per_question_avg: QuestionRow[];
  cost: { chat_usd: number; analysis_usd: number; total_usd: number };
}

type Preset = '7' | '30' | '90' | 'month';

// ---------------------------------------------
// 날짜 유틸 (KST 달력 날짜 'YYYY-MM-DD')
// ---------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayKstYmd(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
function presetRange(p: Preset): { from: string; to: string } {
  const to = todayKstYmd();
  if (p === 'month') return { from: `${to.slice(0, 8)}01`, to };
  return { from: addDays(to, -(Number(p) - 1)), to };
}
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/** 기간 내 날짜를 0 으로 채워 차트 공백 방지 */
function fillDaily(rows: DailyRow[], from: string, to: string): DailyRow[] {
  const map = new Map<string, DailyRow>();
  rows.forEach((r) => map.set(r.date, r));
  const out: DailyRow[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) {
    out.push(map.get(d) ?? { date: d, sessions: 0, analyzed: 0 });
  }
  return out;
}

/** /api/admin/jobs 응답 형태를 모를 때를 대비한 관대한 파서 */
function parseJobs(json: unknown): string[] {
  const list: unknown = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? (json as Record<string, unknown>).jobs ?? (json as Record<string, unknown>).data
      : null;
  if (!Array.isArray(list)) return [];
  const names = list
    .map((item: unknown) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const v = o.job_name ?? o.name ?? o.jobName;
        return typeof v === 'string' ? v : null;
      }
      return null;
    })
    .filter((v): v is string => !!v);
  return Array.from(new Set(names));
}

// ---------------------------------------------
// 차트 공통 스타일
// ---------------------------------------------
const GRID_STROKE = 'rgba(255,255,255,0.08)';
const AXIS_TICK = { fontSize: 11, fill: '#9ca3af' };
const TOOLTIP_STYLE = {
  background: '#12121a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e5e7eb',
};
const TOOLTIP_LABEL_STYLE = { color: '#e5e7eb', marginBottom: 4 };
const CURSOR_FILL = { fill: 'rgba(255,255,255,0.04)' };

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: '7', label: '7일' },
  { key: '30', label: '30일' },
  { key: '90', label: '90일' },
  { key: 'month', label: '이번 달' },
];

const INPUT_CLASS =
  'bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-[#00F2FF]/50 [color-scheme:dark]';

// ---------------------------------------------
// 소형 컴포넌트
// ---------------------------------------------
function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="glass-card-dark rounded-xl border border-white/10 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-white [text-wrap:balance] [word-break:keep-all]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <div className="w-full rounded-lg bg-white/5 animate-pulse" style={{ height }} />;
}

interface QuestionTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

function QuestionTooltip({ active, payload }: QuestionTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as (QuestionRow & { label: string }) | undefined;
  if (!row) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div className="text-gray-200 mb-1">{row.label}</div>
      <div className="text-[#00F2FF]">
        평균 <span className="font-tech tabular-nums">{row.avg_score ?? '—'}</span>점
      </div>
      <div className="text-gray-400">
        표본 <span className="font-tech tabular-nums">{row.n.toLocaleString('ko-KR')}</span>건
      </div>
    </div>
  );
}

// ---------------------------------------------
// 페이지
// ---------------------------------------------
export default function AdminStatsPage() {
  const initial = presetRange('30');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<Preset | null>('30');
  const [job, setJob] = useState('');
  const [company, setCompany] = useState('');
  const [jobs, setJobs] = useState<string[]>([]);

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 직군 목록 (API 가 없거나 실패하면 빈 목록)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/jobs');
        if (!res.ok) return;
        const json: unknown = await res.json();
        if (!cancelled) setJobs(parseJobs(json));
      } catch {
        // 무시 — 직군 필터 없이 동작
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (q: { from: string; to: string; job: string; company: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: q.from, to: q.to });
      if (q.job) params.set('job', q.job);
      if (q.company) params.set('company', q.company);
      const res = await adminFetch(`/api/admin/stats/overview?${params.toString()}`);
      const json = (await res.json().catch(() => null)) as (OverviewResponse & { error?: string }) | null;
      if (!res.ok || !json) {
        setError(json?.error || `통계 조회 실패 (${res.status})`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      if (e instanceof Error && e.name === 'AdminFetchError') return;
      setError('통계 조회 중 오류가 발생했습니다.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 1회 기본 조회 (최근 30일)
  useEffect(() => {
    const r = presetRange('30');
    load({ from: r.from, to: r.to, job: '', company: '' });
  }, [load]);

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setPreset(p);
    setFrom(r.from);
    setTo(r.to);
    load({ from: r.from, to: r.to, job, company });
  };

  const handleSearch = () => {
    load({ from, to, job, company });
  };

  // ---- 파생 데이터 ----
  const totals = data?.totals;
  const isEmpty = !loading && !!data && (totals?.sessions ?? 0) === 0;

  const daily = useMemo(
    () => (data ? fillDaily(data.daily ?? [], data.range.from, data.range.to) : []),
    [data]
  );
  const questionRows = useMemo(
    () => (data?.per_question_avg ?? []).map((q) => ({ ...q, label: `Q${q.question_number}` })),
    [data]
  );
  const jobChartHeight = Math.max(160, (data?.by_job?.length ?? 0) * 30 + 40);

  const completionRate =
    totals && totals.sessions > 0 ? Math.round((totals.analyzed / totals.sessions) * 1000) / 10 : null;

  const passTotal = totals ? totals.pass.합격 + totals.pass.보류 + totals.pass.불합격 : 0;
  const pct = (n: number) => (passTotal > 0 ? `${Math.round((n / passTotal) * 1000) / 10}%` : '—');

  const jobColumns: Array<DataTableColumn<JobRow>> = [
    {
      key: 'job',
      header: '직군',
      render: (r) => <span className="text-gray-200 [word-break:keep-all]">{r.job_name}</span>,
    },
    {
      key: 'sessions',
      header: '세션',
      className: 'text-right',
      render: (r) => <span className="font-tech tabular-nums">{r.sessions.toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'analyzed',
      header: '분석',
      className: 'text-right',
      render: (r) => <span className="font-tech tabular-nums">{r.analyzed.toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'avg',
      header: '평균',
      className: 'text-right',
      render: (r) => <span className="font-tech tabular-nums">{r.avg_score ?? '—'}</span>,
    },
  ];

  const tileValue = (v: ReactNode) => (loading ? <span className="text-gray-600">—</span> : v);

  return (
    <div className="[word-break:keep-all] [overflow-wrap:break-word]">
      <PageHeader title="통계" subtitle="개발 모드 세션은 제외됩니다. 날짜는 한국 시간(KST) 기준입니다." />

      <FilterBar
        right={
          data?.range ? (
            <span className="text-xs text-gray-500">
              <span className="font-tech tabular-nums">{data.range.from}</span> ~{' '}
              <span className="font-tech tabular-nums">{data.range.to}</span>
            </span>
          ) : undefined
        }
      >
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${
                preset === p.key
                  ? 'bg-[#00F2FF]/20 text-[#00F2FF] border border-[#00F2FF]/40'
                  : 'text-gray-400 border border-white/10 hover:border-white/20 hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => {
            setFrom(e.target.value);
            setPreset(null);
          }}
          className={INPUT_CLASS}
          aria-label="시작일"
        />
        <span className="text-xs text-gray-500">~</span>
        <input
          type="date"
          value={to}
          min={from}
          onChange={(e) => {
            setTo(e.target.value);
            setPreset(null);
          }}
          className={INPUT_CLASS}
          aria-label="종료일"
        />
        <select value={job} onChange={(e) => setJob(e.target.value)} className={INPUT_CLASS} aria-label="직군">
          <option value="">전체 직군</option>
          {jobs.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className={INPUT_CLASS}
          aria-label="회사"
        >
          <option value="">전체 회사</option>
          {COMPANY_LIST.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !from || !to}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00F2FF] text-dark-900 hover:bg-[#00F2FF]/85 transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          조회
        </button>
      </FilterBar>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* KPI 타일 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <StatTile
          label="세션 수"
          icon={<Activity className="w-4 h-4" />}
          value={tileValue((totals?.sessions ?? 0).toLocaleString('ko-KR'))}
        />
        <StatTile
          label="분석 완료율"
          tone="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
          value={tileValue(completionRate === null ? '—' : `${completionRate}%`)}
          hint={totals ? `${totals.analyzed.toLocaleString('ko-KR')}건 분석 완료` : undefined}
        />
        <StatTile
          label="응시 학생"
          tone="purple"
          icon={<Users className="w-4 h-4" />}
          value={tileValue((totals?.students ?? 0).toLocaleString('ko-KR'))}
        />
        <StatTile
          label="평균 점수"
          tone="amber"
          icon={<Trophy className="w-4 h-4" />}
          value={tileValue(totals?.avg_score ?? '—')}
        />
        <StatTile
          label="예상 비용 (USD)"
          tone="gray"
          icon={<DollarSign className="w-4 h-4" />}
          value={tileValue(formatUsd(data?.cost?.total_usd ?? 0))}
          hint="gpt-4o 단가 기준"
        />
      </div>

      {isEmpty ? (
        <section className="glass-card-dark rounded-xl border border-white/10">
          <EmptyState title="조회 기간에 면접 세션이 없습니다." description="기간이나 필터를 바꿔 다시 조회해 보세요." />
        </section>
      ) : (
        <div className="space-y-4">
          {/* 일별 추이 */}
          <Section title="일별 추이">
            {loading || !data ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="statsSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00F2FF" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00F2FF" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="statsAnalyzed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00D9A5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00D9A5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} stroke={GRID_STROKE} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={GRID_STROKE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    name="세션"
                    stroke="#00F2FF"
                    fill="url(#statsSessions)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="analyzed"
                    name="분석 완료"
                    stroke="#00D9A5"
                    fill="url(#statsAnalyzed)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* 직군별 */}
          <Section title="직군별">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DataTable<JobRow>
                columns={jobColumns}
                rows={data?.by_job ?? []}
                rowKey={(r) => r.job_name}
                loading={loading}
                emptyText="직군 데이터가 없습니다."
              />
              {loading || !data ? (
                <ChartSkeleton />
              ) : (
                <ResponsiveContainer width="100%" height={jobChartHeight}>
                  <BarChart data={data.by_job} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} stroke={GRID_STROKE} />
                    <YAxis type="category" dataKey="job_name" width={110} tick={AXIS_TICK} stroke={GRID_STROKE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={CURSOR_FILL} />
                    <Bar dataKey="sessions" name="세션" fill="#00F2FF" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 역량 평균 */}
            <Section title="역량 평균">
              {loading || !data ? <ChartSkeleton height={260} /> : <StatsRadar data={data.competency_avg} />}
            </Section>

            {/* 점수 분포 */}
            <Section title="점수 분포">
              {loading || !data ? (
                <ChartSkeleton height={260} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.score_histogram} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                    <XAxis dataKey="bucket" tick={AXIS_TICK} stroke={GRID_STROKE} interval={0} />
                    <YAxis allowDecimals={false} tick={AXIS_TICK} stroke={GRID_STROKE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={CURSOR_FILL} />
                    <Bar dataKey="count" name="세션 수" fill="#8b5cf6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 문항별 평균 */}
            <div className="lg:col-span-2">
              <Section title="문항별 평균">
                {loading || !data ? (
                  <ChartSkeleton />
                ) : questionRows.length === 0 ? (
                  <EmptyState title="문항별 점수 데이터가 없습니다." />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={questionRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                      <XAxis dataKey="label" tick={AXIS_TICK} stroke={GRID_STROKE} interval={0} />
                      <YAxis domain={[0, 100]} tick={AXIS_TICK} stroke={GRID_STROKE} />
                      <Tooltip content={<QuestionTooltip />} cursor={CURSOR_FILL} />
                      <Bar dataKey="avg_score" name="평균 점수" fill="#00D9A5" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Section>
            </div>

            {/* 합격 예측 */}
            <Section title="합격 예측">
              {loading || !totals ? (
                <ChartSkeleton height={120} />
              ) : (
                <div className="space-y-3">
                  {(
                    [
                      { label: '합격', tone: 'green', n: totals.pass.합격 },
                      { label: '보류', tone: 'amber', n: totals.pass.보류 },
                      { label: '불합격', tone: 'red', n: totals.pass.불합격 },
                    ] as const
                  ).map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3">
                      <Badge tone={r.tone}>{r.label}</Badge>
                      <span className="text-sm text-gray-200">
                        <span className="font-tech tabular-nums">{r.n.toLocaleString('ko-KR')}</span>건
                        <span className="ml-2 text-xs text-gray-500 font-tech tabular-nums">{pct(r.n)}</span>
                      </span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 pt-2 border-t border-white/5">
                    분석 완료 세션 <span className="font-tech tabular-nums">{passTotal.toLocaleString('ko-KR')}</span>건 기준
                  </p>
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
