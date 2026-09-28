import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="mb-3 text-gray-600">{icon ?? <Inbox className="w-8 h-8" />}</div>
      <p className="text-sm font-medium text-gray-300 [word-break:keep-all]">{title}</p>
      {description && (
        <p className="text-xs text-gray-500 mt-1 max-w-sm [text-wrap:pretty] [word-break:keep-all] [overflow-wrap:break-word]">
          {description}
        </p>
      )}
    </div>
  );
}
