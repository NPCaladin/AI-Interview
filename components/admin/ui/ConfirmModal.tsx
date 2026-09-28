'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '확인',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-sm rounded-2xl border bg-[#12121a] p-6 shadow-2xl ${
          isDanger ? 'border-red-500/40' : 'border-[#00F2FF]/40'
        }`}
      >
        <h3 className="text-base font-bold text-white mb-3 [text-wrap:balance]">{title}</h3>
        <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-line mb-6 [word-break:keep-all] [overflow-wrap:break-word]">
          {message}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-300 border border-white/20 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${
              isDanger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#00F2FF] text-dark-900 hover:bg-[#00F2FF]/85'
            }`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
