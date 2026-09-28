import { getScoreTone, type ScoreTone } from '@/lib/reportUtils';
import Badge, { type BadgeTone } from './Badge';

const SCORE_TONE_MAP: Record<ScoreTone, BadgeTone> = {
  high: 'green',
  mid: 'cyan',
  low: 'amber',
  poor: 'red',
};

export default function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return <Badge tone="gray">—</Badge>;
  }
  const rounded = Math.round(score);
  return (
    <Badge tone={SCORE_TONE_MAP[getScoreTone(rounded)]}>
      <span className="font-tech tabular-nums">{rounded}</span>
    </Badge>
  );
}
