import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  total?: number;
  right?: ReactNode;
}

export default function FilterBar({ children, total, right }: FilterBarProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {(total !== undefined || right) && (
        <div className="flex items-center gap-3 flex-shrink-0">
          {total !== undefined && (
            <span className="text-xs text-gray-500">
              총 <span className="font-tech tabular-nums text-gray-300">{total.toLocaleString('ko-KR')}</span>건
            </span>
          )}
          {right}
        </div>
      )}
    </div>
  );
}
