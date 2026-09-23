'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import type { GameInterviewReport } from '@/lib/types';

/** 인쇄용 고정 크기 레이더 (320×260, 애니메이션 없음) */
export default function PrintRadar({ scores }: { scores: GameInterviewReport['scores'] }) {
  const data = [
    { subject: '직무 적합도', score: scores.job_fit ?? 0 },
    { subject: '논리성', score: scores.logic ?? 0 },
    { subject: '게임 센스', score: scores.game_sense ?? 0 },
    { subject: '태도', score: scores.attitude ?? 0 },
    { subject: '소통 능력', score: scores.communication ?? 0 },
  ];

  return (
    <RadarChart
      width={320}
      height={260}
      data={data}
      outerRadius="72%"
      margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
    >
      <PolarGrid stroke="#d1d5db" />
      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#374151' }} />
      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
      <Radar
        dataKey="score"
        stroke="#4f46e5"
        fill="#4f46e5"
        fillOpacity={0.25}
        strokeWidth={2}
        isAnimationActive={false}
      />
    </RadarChart>
  );
}
