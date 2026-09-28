import type { ReactNode } from 'react';
import { BADGE_TEXT_CLASS, type BadgeTone } from './Badge';

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: BadgeTone;
}

export default function StatTile({ label, value, hint, icon, tone = 'cyan' }: StatTileProps) {
  return (
    <div className="glass-card-dark rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-400 [word-break:keep-all]">{label}</span>
        {icon && <span className={BADGE_TEXT_CLASS[tone]}>{icon}</span>}
      </div>
      <div className={`text-2xl font-bold font-tech tabular-nums ${BADGE_TEXT_CLASS[tone]}`}>{value}</div>
      {hint && <p className="text-xs text-gray-500 mt-1 [word-break:keep-all] [overflow-wrap:break-word]">{hint}</p>}
    </div>
  );
}
