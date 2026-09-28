import type { ReactNode } from 'react';

export type BadgeTone = 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'gray';

const TONE_CLASS: Record<BadgeTone, string> = {
  cyan: 'bg-[#00F2FF]/10 text-[#00F2FF] border-[#00F2FF]/30',
  green: 'bg-[#00D9A5]/15 text-[#00D9A5] border-[#00D9A5]/30',
  amber: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  purple: 'bg-[#8b5cf6]/10 text-[#a78bfa] border-[#8b5cf6]/30',
  gray: 'bg-white/5 text-gray-400 border-white/10',
};

/** 톤별 텍스트 색 (StatTile 등에서 재사용) */
export const BADGE_TEXT_CLASS: Record<BadgeTone, string> = {
  cyan: 'text-[#00F2FF]',
  green: 'text-[#00D9A5]',
  amber: 'text-[#f59e0b]',
  red: 'text-red-400',
  purple: 'text-[#a78bfa]',
  gray: 'text-gray-400',
};

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}

export default function Badge({ tone, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
