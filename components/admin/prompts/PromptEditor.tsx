'use client';

import { useRef } from 'react';
import { Eye, Loader2, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/admin/ui';
import { SLOT_BODY_MAX, SLOT_BODY_MIN } from '@/lib/promptSlotMeta';

interface PromptEditorProps {
  body: string;
  onBodyChange: (v: string) => void;
  memo: string;
  onMemoChange: (v: string) => void;
  variables: string[];
  required: string[];
  fromDefault: boolean;
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  previewing: boolean;
  resetting: boolean;
  onSave: () => void;
  onPreview: () => void;
  onReset: () => void;
}

export const MEMO_MAX = 200;

const btnBase =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed';

export default function PromptEditor({
  body,
  onBodyChange,
  memo,
  onMemoChange,
  variables,
  required,
  fromDefault,
  dirty,
  disabled,
  saving,
  previewing,
  resetting,
  onSave,
  onPreview,
  onReset,
}: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const len = body.length;
  const lenOk = len >= SLOT_BODY_MIN && len <= SLOT_BODY_MAX;
  const memoTrimmed = memo.trim();
  const canSave = !disabled && lenOk && memoTrimmed.length > 0 && memoTrimmed.length <= MEMO_MAX;

  /** 커서 위치(선택 영역 대체)에 {{name}} 삽입 후 커서를 삽입 끝으로 이동 */
  const insertPlaceholder = (name: string) => {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    if (!el) {
      onBodyChange(body + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    onBodyChange(next);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-white">편집기</h2>
        {fromDefault && <Badge tone="gray">코드 기본값</Badge>}
        {dirty && <Badge tone="amber">수정됨 (미저장)</Badge>}
        <span
          className={`ml-auto font-tech tabular-nums text-xs ${lenOk ? 'text-gray-400' : 'text-red-400'}`}
          title={`${SLOT_BODY_MIN.toLocaleString('ko-KR')}~${SLOT_BODY_MAX.toLocaleString('ko-KR')}자`}
        >
          {len.toLocaleString('ko-KR')} / {SLOT_BODY_MAX.toLocaleString('ko-KR')}자
        </span>
      </div>

      {variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1 [word-break:keep-all]">플레이스홀더 삽입:</span>
          {variables.map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => insertPlaceholder(v)}
              className={`px-2 py-0.5 rounded-md font-mono text-[11px] border transition-colors disabled:opacity-40 ${
                required.includes(v)
                  ? 'border-[#00F2FF]/40 text-[#00F2FF] bg-[#00F2FF]/10 hover:bg-[#00F2FF]/20'
                  : 'border-white/15 text-gray-300 bg-white/5 hover:bg-white/10'
              }`}
              title={required.includes(v) ? '필수 플레이스홀더' : undefined}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        className="w-full min-h-[520px] resize-y rounded-lg bg-black/40 border border-white/10 p-3 font-mono text-xs leading-relaxed text-gray-100 focus:outline-none focus:border-[#00F2FF]/50 disabled:opacity-60"
      />

      <div>
        <label className="block text-xs text-gray-400 mb-1 [word-break:keep-all]">
          변경 사유 <span className="text-red-400">*</span>
          <span className="text-gray-600 ml-1">(1~{MEMO_MAX}자, 저장 시 필수)</span>
        </label>
        <input
          type="text"
          value={memo}
          maxLength={MEMO_MAX}
          onChange={(e) => onMemoChange(e.target.value)}
          disabled={disabled}
          placeholder="예: 꼬리질문 압박 강도 완화"
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#00F2FF]/50 disabled:opacity-60"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saving}
          className={`${btnBase} bg-gradient-to-r from-[#00D9A5] to-[#00F2FF] text-dark-900 shadow-[0_0_20px_rgba(0,242,255,0.25)] hover:shadow-[0_0_30px_rgba(0,242,255,0.4)]`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>저장 + 즉시 활성화</span>
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={disabled || !lenOk || previewing}
          className={`${btnBase} bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10`}
        >
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          <span>미리보기</span>
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled || resetting}
          className={`${btnBase} ml-auto bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20`}
        >
          {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          <span>기본값 복원</span>
        </button>
      </div>
    </div>
  );
}
