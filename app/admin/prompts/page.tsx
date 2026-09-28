'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { formatKstDateTime } from '@/lib/reportUtils';
import { PROMPT_SLOTS, PROMPT_SLOT_META, type PromptSlot } from '@/lib/promptSlotMeta';
import { PageHeader, Modal, ConfirmModal } from '@/components/admin/ui';
import PromptEditor, { MEMO_MAX } from '@/components/admin/prompts/PromptEditor';
import PromptHistory, { type PromptHistoryItem } from '@/components/admin/prompts/PromptHistory';

interface ActiveInfo {
  id: string | null;
  body: string;
  char_count: number;
  version_memo: string | null;
  created_by: string | null;
  created_at: string | null;
  from_default: boolean;
}

interface SlotResponse {
  slot: PromptSlot;
  active: ActiveInfo;
  history: PromptHistoryItem[];
  error?: string;
}

interface VersionDetail {
  id: string;
  body: string;
  char_count: number;
  version_memo: string;
  created_by: string;
  created_at: string;
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null;
}

function isAbortLike(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'AdminFetchError');
}

export default function AdminPromptsPage() {
  const [slot, setSlot] = useState<PromptSlot>('interviewer_persona');
  const [data, setData] = useState<SlotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [body, setBody] = useState('');
  const [memo, setMemo] = useState('');

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<PromptHistoryItem | null>(null);

  const [preview, setPreview] = useState<{ rendered: string; char_count: number } | null>(null);
  const [viewVersion, setViewVersion] = useState<VersionDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const meta = PROMPT_SLOT_META[slot];

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setIsLoading(true);
      try {
        const res = await adminFetch(`/api/admin/prompts?slot=${encodeURIComponent(slot)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await readJson<SlotResponse>(res);
        if (!res.ok || !json?.active) {
          toast.error(json?.error ?? `프롬프트 조회 실패 (${res.status})`);
          setData(null);
          return;
        }
        setData(json);
        setBody(json.active.body);
        setMemo('');
      } catch (err) {
        if (isAbortLike(err)) return;
        toast.error('프롬프트를 불러오지 못했습니다.');
        setData(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [slot, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const dirty = data !== null && body !== data.active.body;
  const busy = isLoading || saving || resetting || rollingBack;

  const changeSlot = (next: PromptSlot) => {
    if (next === slot) return;
    if (dirty && !window.confirm('저장하지 않은 수정 내용이 있습니다. 다른 슬롯으로 이동할까요?')) return;
    setSlot(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, body, version_memo: memo.trim() }),
      });
      const json = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? `저장 실패 (${res.status})`);
        return;
      }
      toast.success('새 버전을 저장하고 활성화했습니다.');
      setConfirmSave(false);
      reload();
    } catch (err) {
      if (!isAbortLike(err)) toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await adminFetch('/api/admin/prompts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, body }),
      });
      const json = await readJson<{ rendered?: string; char_count?: number; error?: string }>(res);
      if (!res.ok || typeof json?.rendered !== 'string') {
        toast.error(json?.error ?? `미리보기 실패 (${res.status})`);
        return;
      }
      setPreview({ rendered: json.rendered, char_count: json.char_count ?? json.rendered.length });
    } catch (err) {
      if (!isAbortLike(err)) toast.error('미리보기 중 오류가 발생했습니다.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await adminFetch('/api/admin/prompts/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const json = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? `기본값 복원 실패 (${res.status})`);
        return;
      }
      toast.success('코드 기본값으로 복원했습니다.');
      setConfirmReset(false);
      reload();
    } catch (err) {
      if (!isAbortLike(err)) toast.error('기본값 복원 중 오류가 발생했습니다.');
    } finally {
      setResetting(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const res = await adminFetch('/api/admin/prompts/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rollbackTarget.id }),
      });
      const json = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? `롤백 실패 (${res.status})`);
        return;
      }
      toast.success('선택한 버전으로 롤백했습니다.');
      setRollbackTarget(null);
      reload();
    } catch (err) {
      if (!isAbortLike(err)) toast.error('롤백 중 오류가 발생했습니다.');
    } finally {
      setRollingBack(false);
    }
  };

  const handleView = async (item: PromptHistoryItem) => {
    setViewLoading(true);
    try {
      const res = await adminFetch(`/api/admin/prompts/${encodeURIComponent(item.id)}`, { cache: 'no-store' });
      const json = await readJson<{ version?: VersionDetail; error?: string }>(res);
      if (!res.ok || !json?.version) {
        toast.error(json?.error ?? `버전 조회 실패 (${res.status})`);
        return;
      }
      setViewVersion(json.version);
    } catch (err) {
      if (!isAbortLike(err)) toast.error('버전을 불러오지 못했습니다.');
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="프롬프트 관리"
        subtitle="면접관 페르소나와 리포트 분석 기준을 버전으로 관리합니다."
      />

      {/* 경고 */}
      <div className="flex items-start gap-3 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4 mb-6">
        <AlertTriangle className="w-5 h-5 text-[#f59e0b] shrink-0 mt-0.5" />
        <p className="text-sm text-gray-200 leading-relaxed [word-break:keep-all] [overflow-wrap:break-word] [text-wrap:pretty]">
          저장 즉시 새 면접부터 적용됩니다(서버 인스턴스별 최대 5분). 점수 척도·JSON 형식 지시를 지우면 분석이 깨질 수 있습니다.
        </p>
      </div>

      {/* 슬롯 탭 */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 mb-3">
        {PROMPT_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeSlot(s)}
            disabled={busy}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors disabled:cursor-not-allowed ${
              slot === s ? 'border-[#00F2FF] text-[#00F2FF]' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {PROMPT_SLOT_META[s].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-4 [word-break:keep-all] [overflow-wrap:break-word] [text-wrap:pretty]">
        {meta.description}
      </p>

      {data && !data.active.from_default && (
        <p className="text-[11px] text-gray-500 mb-4 [word-break:keep-all]">
          현재 활성: <span className="font-mono">{data.active.id?.slice(0, 8)}</span> · {data.active.created_by} ·{' '}
          {data.active.created_at ? formatKstDateTime(data.active.created_at) : '—'} · {data.active.version_memo}
        </p>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <PromptEditor
            body={body}
            onBodyChange={setBody}
            memo={memo}
            onMemoChange={setMemo}
            variables={meta.variables}
            required={meta.required}
            fromDefault={data?.active.from_default ?? true}
            dirty={dirty}
            disabled={busy || !data}
            saving={saving}
            previewing={previewing}
            resetting={resetting}
            onSave={() => setConfirmSave(true)}
            onPreview={handlePreview}
            onReset={() => setConfirmReset(true)}
          />
          <PromptHistory
            items={data?.history ?? []}
            disabled={busy || viewLoading}
            onView={handleView}
            onRollback={(it) => setRollbackTarget(it)}
          />
        </div>
      )}

      <ConfirmModal
        open={confirmSave}
        title="저장 + 즉시 활성화"
        tone="primary"
        confirmLabel="저장하고 활성화"
        busy={saving}
        message={`[${meta.label}] 새 버전을 저장하고 바로 활성화합니다.\n변경 사유: ${memo.trim().slice(0, MEMO_MAX)}\n\n새 면접부터 적용됩니다(서버 인스턴스별 최대 5분).`}
        onConfirm={handleSave}
        onCancel={() => setConfirmSave(false)}
      />

      <ConfirmModal
        open={confirmReset}
        title="기본값 복원"
        confirmLabel="기본값으로 복원"
        busy={resetting}
        message={`[${meta.label}] 코드 기본값을 새 활성 버전으로 저장합니다.\n편집기의 저장하지 않은 수정 내용은 사라집니다.`}
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmModal
        open={rollbackTarget !== null}
        title="이 버전으로 롤백"
        confirmLabel="롤백"
        busy={rollingBack}
        message={
          rollbackTarget
            ? `버전 ${rollbackTarget.id.slice(0, 8)} 의 본문으로 새 활성 버전을 만듭니다.\n원 메모: ${rollbackTarget.version_memo}`
            : ''
        }
        onConfirm={handleRollback}
        onCancel={() => setRollbackTarget(null)}
      />

      <Modal
        open={preview !== null}
        title={`미리보기 — ${meta.label} (샘플: 게임기획 · 넥슨 · 5문항)`}
        onClose={() => setPreview(null)}
        maxWidth="max-w-5xl"
      >
        {preview && (
          <>
            <p className="text-xs text-gray-400 mb-3 font-tech tabular-nums">
              전체 {preview.char_count.toLocaleString('ko-KR')}자
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-200 bg-black/40 border border-white/10 rounded-lg p-3">
              {preview.rendered}
            </pre>
          </>
        )}
      </Modal>

      <Modal
        open={viewVersion !== null}
        title={viewVersion ? `버전 ${viewVersion.id.slice(0, 8)} 본문` : undefined}
        onClose={() => setViewVersion(null)}
        maxWidth="max-w-5xl"
      >
        {viewVersion && (
          <>
            <p className="text-xs text-gray-400 mb-3 [word-break:keep-all] [overflow-wrap:break-word]">
              {viewVersion.version_memo} · {viewVersion.created_by} ·{' '}
              {formatKstDateTime(viewVersion.created_at) || viewVersion.created_at} ·{' '}
              <span className="font-tech tabular-nums">{viewVersion.char_count.toLocaleString('ko-KR')}자</span>
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-200 bg-black/40 border border-white/10 rounded-lg p-3">
              {viewVersion.body}
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
}
