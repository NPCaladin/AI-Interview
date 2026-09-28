'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export default function Pagination({ page, total, limit, onChange, disabled = false }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const btn =
    'p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500">
        페이지 <span className="font-tech tabular-nums">{page}</span> /{' '}
        <span className="font-tech tabular-nums">{totalPages}</span> · 총{' '}
        <span className="font-tech tabular-nums">{total.toLocaleString('ko-KR')}</span>건
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={disabled || page <= 1}
          className={btn}
          aria-label="이전 페이지"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={disabled || page >= totalPages}
          className={btn}
          aria-label="다음 페이지"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
