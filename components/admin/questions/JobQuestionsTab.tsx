'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { formatKstDateTime } from '@/lib/reportUtils';
import {
  Badge,
  ConfirmModal,
  DataTable,
  FilterBar,
  Modal,
  Pagination,
  type DataTableColumn,
} from '@/components/admin/ui';
import {
  COMPANY_TAG_OPTIONS,
  DEFAULT_TAG,
  NO_TAG,
  ghostBtn,
  inputClass,
  isSilentError,
  primaryBtn,
  readError,
  smallBtn,
  type JobDetail,
} from './shared';

interface QuestionItem {
  id: string;
  job_name: string;
  question: string;
  raw_text: string;
  company_tag: string | null;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

const PAGE_SIZE = 20;
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const BULK_MAX = 200;

interface Props {
  jobs: JobDetail[];
  onChanged: () => void;
}

type EditState =
  | { mode: 'create'; job: string; tag: string; question: string }
  | { mode: 'edit'; id: string; job: string; tag: string; question: string; originalNoTag: boolean };

function tagOptionsWith(current: string): string[] {
  return COMPANY_TAG_OPTIONS.includes(current) || !current || current === NO_TAG
    ? COMPANY_TAG_OPTIONS
    : [current, ...COMPANY_TAG_OPTIONS];
}

export default function JobQuestionsTab({ jobs, onChanged }: Props) {
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [job, setJob] = useState('');
  const [company, setCompany] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkJob, setBulkJob] = useState('');
  const [bulkTag, setBulkTag] = useState(DEFAULT_TAG);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<QuestionItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const fetchItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (job) params.set('job', job);
    if (company) params.set('company', company);
    if (search) params.set('search', search);
    if (includeInactive) params.set('includeInactive', '1');

    try {
      const res = await adminFetch(`/api/admin/questions?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        toast.error(await readError(res, '문항 목록 조회 실패'));
        return;
      }
      const json = (await res.json()) as { items?: QuestionItem[]; total?: number };
      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('문항 목록을 불러오지 못했습니다.');
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [page, job, company, search, includeInactive]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const afterWrite = () => {
    fetchItems();
    onChanged();
  };

  const resetPage = () => setPage(1);
  const defaultJob = job || jobs[0]?.job_name || '';

  const openCreate = () =>
    setEdit({
      mode: 'create',
      job: defaultJob,
      tag: company && company !== NO_TAG ? company : DEFAULT_TAG,
      question: '',
    });

  const openEdit = (row: QuestionItem) =>
    setEdit({
      mode: 'edit',
      id: row.id,
      job: row.job_name,
      tag: row.company_tag ?? NO_TAG,
      question: row.question,
      originalNoTag: row.company_tag === null,
    });

  const openBulk = () => {
    setBulkJob(defaultJob);
    setBulkTag(company && company !== NO_TAG ? company : DEFAULT_TAG);
    setBulkText('');
    setBulkOpen(true);
  };

  const editQuestionLen = edit ? edit.question.trim().length : 0;
  const editValid = !!edit && !!edit.job && editQuestionLen >= QUESTION_MIN && editQuestionLen <= QUESTION_MAX;

  const saveEdit = async () => {
    if (!edit || !editValid) return;
    setSaving(true);
    try {
      let res: Response;
      if (edit.mode === 'create') {
        res = await adminFetch('/api/admin/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_name: edit.job, question: edit.question.trim(), company_tag: edit.tag }),
        });
      } else {
        const payload: { question: string; company_tag?: string } = { question: edit.question.trim() };
        // 태그 없는 기존 문항에서 '태그 없음' 을 유지하면 company_tag 를 보내지 않는다
        if (!(edit.originalNoTag && edit.tag === NO_TAG)) payload.company_tag = edit.tag;
        res = await adminFetch(`/api/admin/questions/${edit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        toast.error(await readError(res, edit.mode === 'create' ? '문항 추가 실패' : '문항 수정 실패'));
        return;
      }
      toast.success(edit.mode === 'create' ? '문항을 추가했습니다.' : '문항을 수정했습니다.');
      setEdit(null);
      afterWrite();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const bulkLines = bulkText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const bulkInvalid = bulkLines.filter((l) => l.length < QUESTION_MIN || l.length > QUESTION_MAX).length;
  const bulkValid = !!bulkJob && bulkLines.length > 0 && bulkLines.length <= BULK_MAX && bulkInvalid === 0;

  const saveBulk = async () => {
    if (!bulkValid) return;
    setBulkSaving(true);
    try {
      const res = await adminFetch('/api/admin/questions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_name: bulkJob, company_tag: bulkTag, lines: bulkLines }),
      });
      if (!res.ok) {
        toast.error(await readError(res, '일괄 추가 실패'));
        return;
      }
      const json = (await res.json()) as { inserted: number; skipped: number; skipped_samples?: string[] };
      toast.success(`${json.inserted}건 추가, ${json.skipped}건 중복 skip`, {
        description:
          json.skipped_samples && json.skipped_samples.length > 0
            ? `중복 예: ${json.skipped_samples.slice(0, 3).join(' / ')}`
            : undefined,
      });
      setBulkOpen(false);
      afterWrite();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('일괄 추가 중 오류가 발생했습니다.');
    } finally {
      setBulkSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirmTarget) return;
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/admin/questions/${confirmTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await readError(res, '비활성화 실패'));
        return;
      }
      toast.success('문항을 비활성화했습니다.');
      setConfirmTarget(null);
      afterWrite();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('비활성화 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(false);
    }
  };

  const restore = async (row: QuestionItem) => {
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/admin/questions/${row.id}/restore`, { method: 'POST' });
      if (!res.ok) {
        toast.error(await readError(res, '복원 실패'));
        return;
      }
      toast.success('문항을 복원했습니다.');
      afterWrite();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('복원 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(false);
    }
  };

  const columns: Array<DataTableColumn<QuestionItem>> = [
    {
      key: 'question',
      header: '질문',
      className: 'min-w-[320px]',
      render: (r) => (
        <div className="font-sans">
          <p className={`break-keep [overflow-wrap:break-word] ${r.is_active ? 'text-gray-200' : 'text-gray-500'}`}>
            {r.question}
          </p>
          {!job && <p className="text-xs text-gray-500 mt-0.5 break-keep">{r.job_name}</p>}
        </div>
      ),
    },
    {
      key: 'tag',
      header: '회사 태그',
      render: (r) =>
        r.company_tag ? (
          <Badge tone={r.company_tag === DEFAULT_TAG ? 'cyan' : 'purple'}>{r.company_tag}</Badge>
        ) : (
          <Badge tone="gray">태그 없음 — 면접에 미사용</Badge>
        ),
    },
    {
      key: 'source',
      header: '출처',
      render: (r) => <span className="text-xs text-gray-400">{r.source === 'manual' ? '수동' : r.source}</span>,
    },
    {
      key: 'status',
      header: '상태',
      render: (r) => (r.is_active ? <Badge tone="green">활성</Badge> : <Badge tone="gray">비활성</Badge>),
    },
    {
      key: 'updated',
      header: '수정',
      className: 'whitespace-nowrap',
      render: (r) => (
        <span className="text-xs text-gray-500">{r.updated_at ? formatKstDateTime(r.updated_at) : '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(r)}
            className={`${smallBtn} border-white/15 text-gray-300 hover:bg-white/5`}
          >
            <Pencil className="w-3 h-3" />
            수정
          </button>
          {r.is_active ? (
            <button
              type="button"
              onClick={() => setConfirmTarget(r)}
              disabled={actionBusy}
              className={`${smallBtn} border-red-500/30 text-red-400 hover:bg-red-500/10`}
            >
              <Trash2 className="w-3 h-3" />
              비활성
            </button>
          ) : (
            <button
              type="button"
              onClick={() => restore(r)}
              disabled={actionBusy}
              className={`${smallBtn} border-[#00D9A5]/30 text-[#00D9A5] hover:bg-[#00D9A5]/10`}
            >
              <RotateCcw className="w-3 h-3" />
              복원
            </button>
          )}
        </div>
      ),
    },
  ];

  const editTagOptions = edit ? tagOptionsWith(edit.tag) : COMPANY_TAG_OPTIONS;

  return (
    <div>
      <FilterBar
        total={total}
        right={
          <>
            <button type="button" onClick={openBulk} className={ghostBtn} disabled={jobs.length === 0}>
              <ClipboardList className="w-4 h-4" />
              여러 줄 일괄 추가
            </button>
            <button type="button" onClick={openCreate} className={primaryBtn} disabled={jobs.length === 0}>
              <Plus className="w-4 h-4" />
              문항 추가
            </button>
          </>
        }
      >
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
            <option key={j.job_name} value={j.job_name}>
              {j.job_name} (활성 {j.active_question_count}/전체 {j.question_count})
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
          aria-label="회사 태그"
        >
          <option value="">회사 태그 전체</option>
          <option value={DEFAULT_TAG}>공통</option>
          <option value={NO_TAG}>태그 없음</option>
          {COMPANY_TAG_OPTIONS.filter((c) => c !== DEFAULT_TAG).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="질문 검색 (Enter)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(searchInput.trim());
                resetPage();
              }
            }}
            className={`${inputClass} pl-9 w-56`}
            aria-label="질문 검색"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked);
              resetPage();
            }}
            className="accent-[#00F2FF]"
          />
          비활성 포함
        </label>
      </FilterBar>

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          loading={isLoading}
          emptyText="조건에 맞는 문항이 없습니다."
        />
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} disabled={isLoading} />
      </div>

      {/* 단건 추가/수정 */}
      <Modal
        open={edit !== null}
        title={edit?.mode === 'create' ? '문항 추가' : '문항 수정'}
        onClose={() => !saving && setEdit(null)}
        maxWidth="max-w-lg"
      >
        {edit && (
          <div className="space-y-4 font-sans">
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">직군</span>
              <select
                value={edit.job}
                onChange={(e) => setEdit({ ...edit, job: e.target.value })}
                disabled={edit.mode === 'edit'}
                className={`${inputClass} w-full disabled:opacity-60`}
              >
                {jobs.map((j) => (
                  <option key={j.job_name} value={j.job_name}>
                    {j.job_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">회사 태그</span>
              <select
                value={edit.tag}
                onChange={(e) => setEdit({ ...edit, tag: e.target.value })}
                className={`${inputClass} w-full`}
              >
                {edit.mode === 'edit' && edit.originalNoTag && (
                  <option value={NO_TAG}>태그 없음 (유지) — 면접에 미사용</option>
                )}
                {editTagOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-gray-500 mt-1 break-keep [overflow-wrap:break-word]">
                면접에는 &lsquo;공통&rsquo; 또는 학생이 선택한 회사 태그의 문항만 사용됩니다.
              </span>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">
                질문 <span className="font-tech tabular-nums">({editQuestionLen}/{QUESTION_MAX})</span>
              </span>
              <textarea
                value={edit.question}
                onChange={(e) => setEdit({ ...edit, question: e.target.value })}
                rows={4}
                className={`${inputClass} w-full resize-y break-keep`}
                placeholder={`${QUESTION_MIN}~${QUESTION_MAX}자`}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEdit(null)} disabled={saving} className={ghostBtn}>
                취소
              </button>
              <button type="button" onClick={saveEdit} disabled={!editValid || saving} className={primaryBtn}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                저장
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 여러 줄 일괄 추가 */}
      <Modal
        open={bulkOpen}
        title="여러 줄 붙여넣기 일괄 추가"
        onClose={() => !bulkSaving && setBulkOpen(false)}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 font-sans">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">직군</span>
              <select value={bulkJob} onChange={(e) => setBulkJob(e.target.value)} className={`${inputClass} w-full`}>
                {jobs.map((j) => (
                  <option key={j.job_name} value={j.job_name}>
                    {j.job_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">회사 태그</span>
              <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className={`${inputClass} w-full`}>
                {COMPANY_TAG_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1.5 break-keep">
              질문을 한 줄에 하나씩 붙여넣어 주세요. 빈 줄은 무시되고, 같은 직군에 이미 있는 질문은 건너뜁니다.
            </span>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={12}
              className={`${inputClass} w-full resize-y font-sans break-keep`}
              placeholder={'질문 1\n질문 2\n질문 3'}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-gray-400">
              추가 예정 <span className="font-tech tabular-nums text-[#00F2FF]">{bulkLines.length}</span>줄
              <span className="text-gray-600"> (최대 {BULK_MAX}줄)</span>
            </span>
            {bulkLines.length > BULK_MAX && (
              <span className="text-red-400 break-keep">한 번에 최대 {BULK_MAX}줄까지 추가할 수 있습니다.</span>
            )}
            {bulkInvalid > 0 && (
              <span className="text-red-400 break-keep">
                {QUESTION_MIN}~{QUESTION_MAX}자를 벗어난 줄이{' '}
                <span className="font-tech tabular-nums">{bulkInvalid}</span>개 있습니다.
              </span>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setBulkOpen(false)} disabled={bulkSaving} className={ghostBtn}>
              취소
            </button>
            <button type="button" onClick={saveBulk} disabled={!bulkValid || bulkSaving} className={primaryBtn}>
              {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              일괄 추가
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmTarget !== null}
        title="문항을 비활성화할까요?"
        message={
          confirmTarget
            ? `「${confirmTarget.question.slice(0, 80)}${confirmTarget.question.length > 80 ? '…' : ''}」\n\n비활성 문항은 면접에 출제되지 않으며, 언제든 복원할 수 있습니다.`
            : ''
        }
        confirmLabel="비활성화"
        busy={actionBusy}
        onConfirm={deactivate}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
