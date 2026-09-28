'use client';

import { FileText, History, Undo2 } from 'lucide-react';
import { Badge, EmptyState } from '@/components/admin/ui';
import { formatKstDateTime } from '@/lib/reportUtils';

export interface PromptHistoryItem {
  id: string;
  slot: string;
  char_count: number;
  is_active: boolean;
  version_memo: string;
  created_by: string;
  created_at: string;
}

interface PromptHistoryProps {
  items: PromptHistoryItem[];
  disabled: boolean;
  onView: (item: PromptHistoryItem) => void;
  onRollback: (item: PromptHistoryItem) => void;
}

export default function PromptHistory({ items, disabled, onView, onRollback }: PromptHistoryProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">버전 이력</h2>
        <span className="text-[11px] text-gray-500">최근 20건</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="저장된 버전 없음"
          description="아직 저장한 버전이 없어 코드 기본값이 사용되고 있습니다."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className={`rounded-lg border p-3 ${
                it.is_active ? 'border-[#00D9A5]/40 bg-[#00D9A5]/5' : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {it.is_active && <Badge tone="green">활성</Badge>}
                <span className="font-mono text-[11px] text-gray-500">{it.id.slice(0, 8)}</span>
                <span className="ml-auto font-tech tabular-nums text-[11px] text-gray-400">
                  {it.char_count.toLocaleString('ko-KR')}자
                </span>
              </div>
              <p className="text-sm text-gray-200 mb-1.5 [word-break:keep-all] [overflow-wrap:break-word] [text-wrap:pretty]">
                {it.version_memo}
              </p>
              <p className="text-[11px] text-gray-500 mb-2">
                {it.created_by} · {formatKstDateTime(it.created_at) || it.created_at}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onView(it)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-gray-300 border border-white/15 hover:bg-white/10"
                >
                  <FileText className="w-3.5 h-3.5" />
                  본문 보기
                </button>
                {!it.is_active && (
                  <button
                    type="button"
                    onClick={() => onRollback(it)}
                    disabled={disabled}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-[#f59e0b] border border-[#f59e0b]/30 hover:bg-[#f59e0b]/10 disabled:opacity-40"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    이 버전으로 롤백
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
