'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, FileDown, Search } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { formatKstDateTime } from '@/lib/reportUtils';
import {
  PageHeader,
  Pagination,
  FilterBar,
  Badge,
  EmptyState,
  JsonDiff,
  type BadgeTone,
} from '@/components/admin/ui';

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 30;

const RESOURCE_TYPES = [
  'student',
  'reactivation',
  'session',
  'question',
  'personality_question',
  'job',
  'criteria',
  'prompt',
  'sync',
  'admin',
] as const;

type ActionTone = BadgeTone | 'blue';

function actionTone(action: string): ActionTone {
  if (action.includes('DELETE')) return 'red';
  if (action === 'ADMIN_LOGIN') return 'gray';
  if (action.startsWith('STUDENT_')) return 'cyan';
  if (action.startsWith('QUEUE_')) return 'green';
  if (action.startsWith('QUESTION_') || action.startsWith('JOB_') || action.startsWith('CRITERIA_')) return 'purple';
  if (action.startsWith('PROMPT_')) return 'amber';
  if (action.startsWith('SYNC_')) return 'blue';
  return 'gray';
}

function ActionBadge({ action }: { action: string }) {
  const tone = actionTone(action);
  if (tone === 'blue') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap bg-blue-500/10 text-blue-400 border-blue-500/30">
        {action}
      </span>
    );
  }
  return <Badge tone={tone}>{action}</Badge>;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function formatPrimitive(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `${v.length}건`;
  return null;
}

/** details 에서 대표 값 1~2개 (원시값·배열 길이) */
function summarize(details: Record<string, unknown> | null): string {
  if (!details) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    const text = formatPrimitive(v);
    if (text === null || text === '') continue;
    parts.push(`${k}=${text}`);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}

const inputClass =
  'px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 focus:outline-none focus:border-[#00F2FF]/50';

const btnBase =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200';

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [actions, setActions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [action, setAction] = useState('');
  const [actorInput, setActorInput] = useState('');
  const [actor, setActor] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceIdInput, setResourceIdInput] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const buildFilterParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (actor) params.set('actor', actor);
    if (resourceType) params.set('resource_type', resourceType);
    if (resourceId) params.set('resource_id', resourceId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
  }, [action, actor, resourceType, resourceId, from, to]);

  const fetchItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    const params = buildFilterParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));

    try {
      const res = await adminFetch(`/api/admin/audit?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as
        | { items?: AuditItem[]; total?: number; actions?: string[]; error?: string }
        | null;
      if (!res.ok || !json) {
        toast.error(json?.error ?? `감사 로그 조회 실패 (${res.status})`);
        return;
      }
      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
      if (json.actions) setActions(json.actions);
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'AdminFetchError')) return;
      toast.error('감사 로그를 불러오지 못했습니다.');
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [buildFilterParams, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resetPage = () => setPage(1);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const params = buildFilterParams();
    params.set('type', 'audit');
    window.location.href = `/api/admin/export?${params}`;
  };

  const headers = ['', '시각 (KST)', '작업자', '액션', '대상', '요약'];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="감사 로그"
        subtitle="어드민 작업 이력 조회 · 변경 전후 비교"
        actions={
          <button
            type="button"
            onClick={handleExport}
            className={`${btnBase} bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10`}
          >
            <FileDown className="w-4 h-4" />
            <span>CSV 내보내기</span>
          </button>
        }
      />

      <FilterBar total={total}>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="액션"
        >
          <option value="">액션 전체</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={resourceType}
          onChange={(e) => {
            setResourceType(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="대상 유형"
        >
          <option value="">대상 유형 전체</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="작업자 검색 (Enter)"
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setActor(actorInput.trim());
                resetPage();
              }
            }}
            className={`${inputClass} pl-9 w-44`}
            aria-label="작업자"
          />
        </div>

        <input
          type="text"
          placeholder="대상 ID (Enter)"
          value={resourceIdInput}
          onChange={(e) => setResourceIdInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setResourceId(resourceIdInput.trim());
              resetPage();
            }
          }}
          className={`${inputClass} w-52 font-mono`}
          aria-label="대상 ID"
        />

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
      </FilterBar>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {headers.map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-white/5">
                    {headers.map((_h, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3.5 rounded bg-white/5 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={headers.length}>
                    <EmptyState title="조건에 맞는 감사 로그가 없습니다." />
                  </td>
                </tr>
              ) : (
                items.map((a) => {
                  const open = expanded.has(a.id);
                  return (
                    <Fragment key={a.id}>
                      <tr
                        onClick={() => toggle(a.id)}
                        className="border-b border-white/5 transition-colors hover:bg-white/[0.03] cursor-pointer"
                      >
                        <td className="pl-4 py-3 w-6 text-gray-500">
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                          {formatKstDateTime(a.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-200">{a.actor}</td>
                        <td className="px-4 py-3">
                          <ActionBadge action={a.action} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-400" title={a.resource_id ?? undefined}>
                          {a.resource_type
                            ? `${a.resource_type}${a.resource_id ? `:${shortId(a.resource_id)}` : ''}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 [word-break:keep-all] [overflow-wrap:break-word]">
                          {summarize(a.details) || '—'}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-white/5 bg-black/20">
                          <td colSpan={headers.length} className="px-4 py-4">
                            <div className="space-y-3">
                              {(a.old_values || a.new_values) && (
                                <JsonDiff before={a.old_values} after={a.new_values} />
                              )}
                              {a.details && (
                                <div>
                                  <div className="text-xs font-medium text-gray-400 mb-1.5">details</div>
                                  <pre className="text-xs font-mono bg-black/30 border border-white/10 rounded-lg p-3 overflow-x-auto text-gray-300">
                                    {JSON.stringify(a.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                                <span>
                                  IP: <span className="font-mono text-gray-300">{a.ip_address ?? '—'}</span>
                                </span>
                                {a.resource_id && (
                                  <span>
                                    대상 ID: <span className="font-mono text-gray-300">{a.resource_id}</span>
                                  </span>
                                )}
                                <span>
                                  로그 ID: <span className="font-mono text-gray-300">{a.id}</span>
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} disabled={isLoading} />
      </div>
    </div>
  );
}
