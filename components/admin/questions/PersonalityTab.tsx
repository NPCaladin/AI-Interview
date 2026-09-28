'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
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
import { ghostBtn, inputClass, isSilentError, primaryBtn, readError, smallBtn } from './shared';

interface PersonalityItem {
  id: string;
  category: string;
  question: string;
  source: string;
  is_active: boolean;
  updated_at: string | null;
}

const PAGE_SIZE = 20;
const QUESTION_MIN = 5;
const QUESTION_MAX = 500;
const CATEGORY_MAX = 50;

type EditState =
  | { mode: 'create'; category: string; question: string }
  | { mode: 'edit'; id: string; category: string; question: string };

export default function PersonalityTab() {
  const [items, setItems] = useState<PersonalityItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<PersonalityItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const fetchItems = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    if (includeInactive) params.set('includeInactive', '1');

    try {
      const res = await adminFetch(`/api/admin/personality-questions?${params}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        toast.error(await readError(res, '인성 질문 조회 실패'));
        return;
      }
      const json = (await res.json()) as { items?: PersonalityItem[]; total?: number; categories?: string[] };
      if (controller.signal.aborted) return;
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
      setCategories(json.categories ?? []);
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('인성 질문을 불러오지 못했습니다.');
    } finally {
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [page, category, search, includeInactive]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resetPage = () => setPage(1);

  const qLen = edit ? edit.question.trim().length : 0;
  const cLen = edit ? edit.category.trim().length : 0;
  const editValid = !!edit && cLen >= 1 && cLen <= CATEGORY_MAX && qLen >= QUESTION_MIN && qLen <= QUESTION_MAX;

  const saveEdit = async () => {
    if (!edit || !editValid) return;
    setSaving(true);
    try {
      const payload = { category: edit.category.trim(), question: edit.question.trim() };
      const res =
        edit.mode === 'create'
          ? await adminFetch('/api/admin/personality-questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await adminFetch(`/api/admin/personality-questions/${edit.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
      if (!res.ok) {
        toast.error(await readError(res, edit.mode === 'create' ? '인성 질문 추가 실패' : '인성 질문 수정 실패'));
        return;
      }
      toast.success(edit.mode === 'create' ? '인성 질문을 추가했습니다.' : '인성 질문을 수정했습니다.');
      setEdit(null);
      fetchItems();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirmTarget) return;
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/admin/personality-questions/${confirmTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await readError(res, '비활성화 실패'));
        return;
      }
      toast.success('인성 질문을 비활성화했습니다.');
      setConfirmTarget(null);
      fetchItems();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('비활성화 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(false);
    }
  };

  const restore = async (row: PersonalityItem) => {
    setActionBusy(true);
    try {
      const res = await adminFetch(`/api/admin/personality-questions/${row.id}/restore`, { method: 'POST' });
      if (!res.ok) {
        toast.error(await readError(res, '복원 실패'));
        return;
      }
      toast.success('인성 질문을 복원했습니다.');
      fetchItems();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('복원 중 오류가 발생했습니다.');
    } finally {
      setActionBusy(false);
    }
  };

  const columns: Array<DataTableColumn<PersonalityItem>> = [
    {
      key: 'category',
      header: '카테고리',
      className: 'whitespace-nowrap',
      render: (r) => <Badge tone="purple">{r.category}</Badge>,
    },
    {
      key: 'question',
      header: '질문',
      className: 'min-w-[320px]',
      render: (r) => (
        <p
          className={`font-sans break-keep [overflow-wrap:break-word] ${r.is_active ? 'text-gray-200' : 'text-gray-500'}`}
        >
          {r.question}
        </p>
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
            onClick={() => setEdit({ mode: 'edit', id: r.id, category: r.category, question: r.question })}
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

  return (
    <div>
      <FilterBar
        total={total}
        right={
          <button
            type="button"
            onClick={() => setEdit({ mode: 'create', category: category || categories[0] || '', question: '' })}
            className={primaryBtn}
          >
            <Plus className="w-4 h-4" />
            인성 질문 추가
          </button>
        }
      >
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            resetPage();
          }}
          className={inputClass}
          aria-label="카테고리"
        >
          <option value="">카테고리 전체</option>
          {categories.map((c) => (
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
          emptyText="조건에 맞는 인성 질문이 없습니다."
        />
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} disabled={isLoading} />
      </div>

      <Modal
        open={edit !== null}
        title={edit?.mode === 'create' ? '인성 질문 추가' : '인성 질문 수정'}
        onClose={() => !saving && setEdit(null)}
        maxWidth="max-w-lg"
      >
        {edit && (
          <div className="space-y-4 font-sans">
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5 break-keep">
                카테고리 (기존 카테고리를 고르거나 새 이름을 입력하세요)
              </span>
              <input
                type="text"
                list="personality-categories"
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                maxLength={CATEGORY_MAX}
                className={`${inputClass} w-full`}
              />
              <datalist id="personality-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="block text-xs text-gray-400 mb-1.5">
                질문 <span className="font-tech tabular-nums">({qLen}/{QUESTION_MAX})</span>
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

      <ConfirmModal
        open={confirmTarget !== null}
        title="인성 질문을 비활성화할까요?"
        message={
          confirmTarget
            ? `「${confirmTarget.question.slice(0, 80)}${confirmTarget.question.length > 80 ? '…' : ''}」\n\n비활성 질문은 면접에 출제되지 않으며, 언제든 복원할 수 있습니다.`
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
