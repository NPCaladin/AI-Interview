'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, X } from 'lucide-react';
import { adminFetch } from '@/lib/adminFetch';
import { Badge, EmptyState } from '@/components/admin/ui';
import { inputClass, isSilentError, primaryBtn, readError, type JobDetail } from './shared';

const KEYWORD_MAX_LEN = 30;
const KEYWORDS_MAX = 50;

interface Props {
  jobs: JobDetail[];
  loading: boolean;
  onChanged: () => void;
}

interface RowDraft {
  keywords: string[];
  is_active: boolean;
  input: string;
}

function JobRow({ job, onSaved }: { job: JobDetail; onSaved: () => void }) {
  const [draft, setDraft] = useState<RowDraft>({ keywords: job.keywords, is_active: job.is_active, input: '' });
  const [saving, setSaving] = useState(false);

  const dirty =
    draft.is_active !== job.is_active || JSON.stringify(draft.keywords) !== JSON.stringify(job.keywords);

  const addKeyword = () => {
    const k = draft.input.trim();
    if (!k) return;
    if (k.length > KEYWORD_MAX_LEN) {
      toast.error(`키워드는 ${KEYWORD_MAX_LEN}자 이하여야 합니다.`);
      return;
    }
    if (draft.keywords.length >= KEYWORDS_MAX) {
      toast.error(`키워드는 최대 ${KEYWORDS_MAX}개까지입니다.`);
      return;
    }
    if (draft.keywords.includes(k)) {
      setDraft({ ...draft, input: '' });
      return;
    }
    setDraft({ ...draft, keywords: [...draft.keywords, k], input: '' });
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const payload: { keywords?: string[]; is_active?: boolean } = {};
      if (JSON.stringify(draft.keywords) !== JSON.stringify(job.keywords)) payload.keywords = draft.keywords;
      if (draft.is_active !== job.is_active) payload.is_active = draft.is_active;
      const res = await adminFetch(`/api/admin/jobs/${encodeURIComponent(job.job_name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readError(res, '직군 저장 실패'));
        return;
      }
      toast.success(`${job.job_name} 저장 완료`);
      onSaved();
    } catch (err) {
      if (isSilentError(err)) return;
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="md:w-56 flex-shrink-0">
          <p className="text-sm font-bold text-white break-keep">{job.job_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            활성 문항 <span className="font-tech tabular-nums text-gray-300">{job.active_question_count}</span> / 전체{' '}
            <span className="font-tech tabular-nums text-gray-300">{job.question_count}</span>
          </p>
          <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
              className="accent-[#00D9A5]"
            />
            {draft.is_active ? <Badge tone="green">활성</Badge> : <Badge tone="gray">비활성 — 면접 데이터 제외</Badge>}
          </label>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {draft.keywords.length === 0 && <span className="text-xs text-gray-600">키워드 없음</span>}
            {draft.keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs bg-[#00F2FF]/10 text-[#00F2FF] border border-[#00F2FF]/30"
              >
                {k}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })}
                  className="p-0.5 rounded-full hover:bg-white/10"
                  aria-label={`${k} 제거`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={draft.input}
            onChange={(e) => setDraft({ ...draft, input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="키워드 입력 후 Enter"
            maxLength={KEYWORD_MAX_LEN}
            className={`${inputClass} w-full sm:w-72`}
            aria-label={`${job.job_name} 키워드 추가`}
          />
        </div>

        <div className="flex-shrink-0">
          <button type="button" onClick={save} disabled={!dirty || saving} className={primaryBtn}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobKeywordsTab({ jobs, loading, onChanged }: Props) {
  if (loading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (jobs.length === 0) return <EmptyState title="직군이 없습니다." />;

  return (
    <div className="space-y-3 font-sans">
      <p className="text-xs text-gray-400 break-keep [text-wrap:pretty] [overflow-wrap:break-word]">
        직군별 필수 키워드와 활성 여부를 관리합니다. 행마다 &lsquo;저장&rsquo;을 눌러야 반영됩니다. 비활성 직군은 면접
        데이터에서 제외됩니다.
      </p>
      {jobs.map((j) => (
        // 서버 값이 바뀐 행만 재마운트 → 초안 재설정 (다른 행의 미저장 편집은 유지)
        <JobRow key={`${j.job_name}|${j.is_active}|${JSON.stringify(j.keywords)}`} job={j} onSaved={onChanged} />
      ))}
    </div>
  );
}
