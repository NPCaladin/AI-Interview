'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { EmptyState } from '@/components/admin/ui';
import { ghostBtn, inputClass, isSilentError, primaryBtn, readError } from './shared';

interface CriterionItem {
  id: string;
  criterion: string;
  sort_order: number;
}

interface DraftItem {
  key: string;
  id: string | null;
  criterion: string;
}

const CRITERION_MAX = 200;
const ITEMS_MAX = 20;

let tempSeq = 0;
function tempKey(): string {
  tempSeq += 1;
  return `new-${Date.now()}-${tempSeq}`;
}

function toDraft(items: CriterionItem[]): DraftItem[] {
  return items.map((it) => ({ key: it.id, id: it.id, criterion: it.criterion }));
}

function signature(list: Array<{ id: string | null; criterion: string }>): string {
  return JSON.stringify(list.map((it) => [it.id, it.criterion.trim()]));
}

export default function CriteriaTab() {
  const [original, setOriginal] = useState<CriterionItem[]>([]);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch('/api/admin/eval-criteria', { cache: 'no-store' });
      if (!res.ok) {
        toast.error(await readError(res, '평가 기준 조회 실패'));
        return;
      }
      const json = (await res.json()) as { items?: CriterionItem[] };
      const items = json.items ?? [];
      setOriginal(items);
      setDraft(toDraft(items));
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('평가 기준을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => signature(draft) !== signature(original.map((o) => ({ id: o.id, criterion: o.criterion }))),
    [draft, original]
  );
  const invalid = draft.some((d) => {
    const len = d.criterion.trim().length;
    return len < 1 || len > CRITERION_MAX;
  });
  const canSave = dirty && !invalid && draft.length >= 1 && draft.length <= ITEMS_MAX && !saving;

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = draft.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setDraft(next);
  };

  const update = (index: number, criterion: string) => {
    setDraft(draft.map((d, i) => (i === index ? { ...d, criterion } : d)));
  };

  const remove = (index: number) => setDraft(draft.filter((_, i) => i !== index));

  const add = () => {
    if (draft.length >= ITEMS_MAX) return;
    setDraft([...draft, { key: tempKey(), id: null, criterion: '' }]);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/eval-criteria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draft.map((d) => (d.id ? { id: d.id, criterion: d.criterion.trim() } : { criterion: d.criterion.trim() })),
        }),
      });
      if (!res.ok) {
        toast.error(await readError(res, '평가 기준 저장 실패'));
        return;
      }
      const json = (await res.json()) as { items?: CriterionItem[] };
      const items = json.items ?? [];
      setOriginal(items);
      setDraft(toDraft(items));
      toast.success('평가 기준을 저장했습니다.');
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const iconBtn =
    'p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-xs text-gray-400 break-keep [text-wrap:pretty] [overflow-wrap:break-word]">
          면접 분석에 쓰이는 공통 평가 기준입니다. 순서·문구를 편집한 뒤 &lsquo;저장&rsquo;을 눌러야 반영됩니다.
          (<span className="font-tech tabular-nums">1~{ITEMS_MAX}</span>개, 각{' '}
          <span className="font-tech tabular-nums">{CRITERION_MAX}</span>자 이하)
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setDraft(toDraft(original))}
            disabled={!dirty || saving}
            className={ghostBtn}
          >
            <Undo2 className="w-4 h-4" />
            되돌리기
          </button>
          <button type="button" onClick={save} disabled={!canSave} className={primaryBtn}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            저장
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : draft.length === 0 ? (
          <EmptyState title="평가 기준이 없습니다." description="최소 1개 이상 추가해야 저장할 수 있습니다." />
        ) : (
          <ol className="space-y-2">
            {draft.map((d, i) => {
              const len = d.criterion.trim().length;
              const bad = len < 1 || len > CRITERION_MAX;
              return (
                <li key={d.key} className="flex items-center gap-2">
                  <span className="w-6 text-right font-tech tabular-nums text-xs text-gray-500">{i + 1}</span>
                  <input
                    type="text"
                    value={d.criterion}
                    onChange={(e) => update(i, e.target.value)}
                    maxLength={CRITERION_MAX + 50}
                    placeholder="평가 기준 문구"
                    className={`${inputClass} flex-1 min-w-0 ${bad ? 'border-red-500/50' : ''}`}
                    aria-label={`평가 기준 ${i + 1}`}
                  />
                  {!d.id && <span className="text-[10px] text-[#00F2FF] whitespace-nowrap">새 항목</span>}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label="위로">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.length - 1}
                    className={iconBtn}
                    aria-label="아래로"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className={`${iconBtn} hover:text-red-400`}
                    aria-label="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 pt-3 border-t border-white/5">
          <button type="button" onClick={add} disabled={isLoading || draft.length >= ITEMS_MAX} className={ghostBtn}>
            <Plus className="w-4 h-4" />
            기준 추가
          </button>
        </div>
      </div>
    </div>
  );
}
