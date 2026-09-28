'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

export interface CompetencyAvg {
  job_fit: number | null;
  logic: number | null;
  game_sense: number | null;
  attitude: number | null;
  communication: number | null;
}

/** ReportView scoreItems 와 동일한 순서·라벨 */
const AXES: Array<{ key: keyof CompetencyAvg; label: string }> = [
  { key: 'job_fit', label: '직무 적합도' },
  { key: 'logic', label: '논리성' },
  { key: 'game_sense', label: '게임 센스' },
  { key: 'attitude', label: '태도' },
  { key: 'communication', label: '소통 능력' },
];

const TOOLTIP_STYLE = {
  background: '#12121a',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e5e7eb',
};

/** 어드민 통계용 역량 평균 레이더 (다크 테마, 0~100) */
export default function StatsRadar({ data, height = 260 }: { data: CompetencyAvg; height?: number }) {
  const rows = AXES.map(({ key, label }) => ({
    subject: label,
    score: data[key] ?? 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={rows} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="rgba(255,255,255,0.12)" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#e5e7eb' }}
          itemStyle={{ color: '#00F2FF' }}
        />
        <Radar
          name="평균 점수"
          dataKey="score"
          stroke="#00F2FF"
          fill="#00F2FF"
          fillOpacity={0.2}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
