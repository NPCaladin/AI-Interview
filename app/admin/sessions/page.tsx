'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { COMPANY_LIST } from '@/lib/constants';
import { formatKstDateTime, getPassTone, type PassTone } from '@/lib/reportUtils';
import {
  PageHeader,
  DataTable,
  Pagination,
  FilterBar,
  Badge,
  ScoreBadge,
  type DataTableColumn,
  type BadgeTone,
} from '@/components/admin/ui';

type DbStatus = 'in_progress' | 'ended' | 'analyzed';
type DisplayStatus = DbStatus | 'abandoned';
type StatusFilter = '' | DisplayStatus;

interface SessionListItem {
  id: string;
  student_id: string | null;
  student_code: string;
  student_name: string | null;
  job_name: string;
  company_name: string | null;
  status: DbStatus;
  display_status: DisplayStatus;
  question_count: number | null;
  started_at: string;
  last_activity_at: string | null;
  ended_at: string | null;
  analysis_completed_at: string | null;
  total_score: number | null;
  pass_prediction: string | null;
  summary_title: string | null;
  analyzed_questions: number | null;
  report_version: string | number | null;
  chat_prompt_tokens: number | null;
  chat_completion_tokens: number | null;
  analysis_prompt_tokens: number | null;
  analysis_completion_tokens: number | null;
  model: string | null;
  is_dev: boolean;
}

const PAGE_SIZE = 20;

const SESSION_STATUS_META: Record<DisplayStatus, { label: string; tone: BadgeTone }> = {
  in_progress: { label: '진행 중', tone: 'cyan' },
  abandoned: { label: '중단', tone: 'gray' },
  ended: { label: '종료', tone: 'amber' },
  analyzed: { label: '분석 완료', tone: 'green' },
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: '전체' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'abandoned', label: '중단' },
  { value: 'ended', label: '종료' },
  { value: 'analyzed', label: '분석 완료' },
];

const PASS_TONE_CLASS: Record<PassTone, string> = {
  pass: 'text-[#00D9A5]',
  hold: 'text-[#f59e0b]',
  fail: 'text-red-400',
};

function compactNum(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}m`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

function formatTokens(row: SessionListItem): string {
  const input = (row.chat_prompt_tokens ?? 0) + (row.analysis_prompt_tokens ?? 0);
  const output = (row.chat_completion_tokens ?? 0) + (row.analysis_completion_tokens ?? 0);
  if (input === 0 && output === 0) return '—';
  return `${compactNum(input)}/${compactNum(output)}`;
}

const inputClass =
  'px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-[#00F2FF]/50';

export default function AdminSessionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [jobs, setJobs] = useState<string[]>([]);

  const [job, setJob] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeDev, setIncludeDev] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adminFetch('/api/admin/jobs', { cache: 'no-store' });
        if (!res.ok) {
          toast.error(`직군 목록 조회 실패 (${res.status})`);
          return;
        }
        const json = (await res.json()) as { items?: string[] };
        if (!cancelled) setJobs(json.items ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AdminFetchError') return;
        toast.error('직군 목록을 불러오지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (job) params.set('job', job);
    if (company) params.set('company', company);
    if (status) params.set('status', status);
    if (minScore.trim()) params.set('minScore', minScore.trim());
    if (maxScore.trim()) params.set('maxScore', maxScore.trim());
    // 날짜는 KST 하루 경계로 변환 (to 는 당일 포함)
    if (from) params.set('from', `${from}T00:00:00+09:00`);
    if (to) params.set('to', `${to}T23:59:59.999+09:00`);
    if (includeDev) params.set('includeDev', '1');

    try {
      const res = await adminFetch(`/api/admin/sessions?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? `세션 목록 조회 실패 (${res.status})`);
        return;
      }
      const json = (await res.json()) as { items?: SessionListItem[]; total?: number };
      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'AdminFetchError')) return;
      toast.error('세션 목록을 불러오지 못했습니다.');
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [page, search, job, company, status, minScore, maxScore, from, to, includeDev]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resetPage = () => setPage(1);

  const columns: Array<DataTableColumn<SessionListItem>> = [
    {
      key: 'started_at',
      header: '시작',
      className: 'whitespace-nowrap',
      render: (r) => <span className="text-xs text-gray-400">{formatKstDateTime(r.started_at)}</span>,
    },
    {
      key: 'student',
      header: '학생',
      className: 'whitespace-nowrap',
      render: (r) => {
        const inner = (
          <>
            <span className="font-mono text-xs text-gray-300">{r.student_code}</span>
            {r.student_name && <span className="ml-2 text-gray-200">{r.student_name}</span>}
          </>
        );
        return r.student_id ? (
          <Link
            href={`/admin/students/${r.student_id}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-[#00F2FF] hover:underline"
          >
            {inner}
          </Link>
        ) : (
          inner
        );
      },
    },
    { key: 'job', header: '직군', render: (r) => <span className="[word-break:keep-all]">{r.job_name}</span> },
    {
      key: 'company',
      header: '회사',
      render: (r) => <span className="[word-break:keep-all]">{r.company_name || '—'}</span>,
    },
    {
      key: 'q',
      header: 'Q수',
      className: 'text-right',
      render: (r) => <span className="font-tech tabular-nums">{r.question_count ?? 0}</span>,
    },
    {
      key: 'status',
      header: '상태',
      render: (r) => {
        const meta = SESSION_STATUS_META[r.display_status] ?? SESSION_STATUS_META[r.status];
        return (
          <span className="inline-flex items-center gap-1">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {r.is_dev && <Badge tone="purple">dev</Badge>}
          </span>
        );
      },
    },
    { key: 'score', header: '총점', render: (r) => <ScoreBadge score={r.total_score} /> },
    {
      key: 'pass',
      header: '합격 예측',
      className: 'whitespace-nowrap',
      render: (r) =>
        r.pass_prediction ? (
          <span className={`font-medium ${PASS_TONE_CLASS[getPassTone(r.pass_prediction)]}`}>
            {r.pass_prediction}
          </span>
        ) : (
          <span className="text-gray-600">—</span>
        ),
    },
    {
      key: 'tokens',
      header: '토큰',
      className: 'whitespace-nowrap',
      render: (r) => <span className="font-tech tabular-nums text-xs text-gray-400">{formatTokens(r)}</span>,
    },
    {
      key: 'version',
      header: '버전',
      render: (r) => <span className="text-xs text-gray-500">{r.report_version ?? '—'}</span>,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="면접 세션" subtitle="면접 진행 기록 · 분석 리포트 조회" />

      <FilterBar total={total}>
        <select
          value={job}
          onChange={(e) => {
            setJob(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="직군"
        >
          <option value="">직군 전체</option>
          {jobs.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>

        <select
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="회사"
        >
          <option value="">회사 전체</option>
          {COMPANY_LIST.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            resetPage();
          }}
          className={inputClass}
          aria-label="상태"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.value ? o.label : '상태 전체'}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            placeholder="최소점"
            value={minScore}
            onChange={(e) => {
              setMinScore(e.target.value);
              resetPage();
            }}
            className={`${inputClass} w-20`}
            aria-label="최소 점수"
          />
          <span className="text-gray-500 text-xs">~</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="최대점"
            value={maxScore}
            onChange={(e) => {
              setMaxScore(e.target.value);
              resetPage();
            }}
            className={`${inputClass} w-20`}
            aria-label="최대 점수"
          />
        </div>

        <div className="flex items-center gap-1">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetPage();
            }}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label="시작일"
          />
          <span className="text-gray-500 text-xs">~</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetPage();
            }}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label="종료일"
          />
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="코드·이름 검색 (Enter)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(searchInput.trim());
                resetPage();
              }
            }}
            className={`${inputClass} pl-9 w-52`}
            aria-label="검색"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeDev}
            onChange={(e) => {
              setIncludeDev(e.target.checked);
              resetPage();
            }}
            className="accent-[#00F2FF]"
          />
          dev 포함
        </label>
      </FilterBar>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyText="조건에 맞는 세션이 없습니다."
          onRowClick={(r) => router.push(`/admin/sessions/${r.id}`)}
        />
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} disabled={isLoading} />
      </div>
    </div>
  );
}
