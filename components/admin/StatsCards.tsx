'use client';

import { Users, UserCheck, Activity, TrendingUp } from 'lucide-react';

interface Stats {
  totalStudents: number;
  activeStudents: number;
  weeklyUsageCount: number;
  weeklyActiveUsers: number;
}

interface StatsCardsProps {
  stats: Stats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: '전체 학생',
      value: stats.totalStudents,
      icon: Users,
      color: '#00F2FF',
      glow: 'rgba(0,242,255,0.3)',
    },
    {
      label: '활성 학생',
      value: stats.activeStudents,
      icon: UserCheck,
      color: '#00D9A5',
      glow: 'rgba(0,217,165,0.3)',
    },
    {
      label: '이번 주 사용',
      value: stats.weeklyUsageCount,
      icon: Activity,
      color: '#f59e0b',
      glow: 'rgba(245,158,11,0.3)',
    },
    {
      label: '이번 주 이용자',
      value: stats.weeklyActiveUsers,
      icon: TrendingUp,
      color: '#8b5cf6',
      glow: 'rgba(139,92,246,0.3)',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="glass-card-dark rounded-xl p-5 border border-white/10 relative overflow-hidden"
          >
            <div
              className="absolute inset-0 opacity-5 rounded-xl"
              style={{ background: `radial-gradient(circle at top right, ${card.color}, transparent 70%)` }}
            />
            <div className="flex items-start justify-between mb-3">
              <div
                className="p-2 rounded-lg"
                style={{ background: `${card.color}15`, border: `1px solid ${card.color}30` }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: card.color, filter: `drop-shadow(0 0 6px ${card.glow})` }}
                />
              </div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{card.value.toLocaleString()}</div>
            <div className="text-xs text-gray-400">{card.label}</div>
          </div>
        );
      })}
    </div>
  );
}
