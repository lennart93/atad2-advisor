import { computeQuality, type QualityTier } from '@/lib/prefill/qualityMeter';
import type { SessionDocument } from '@/lib/prefill/types';

interface Props {
  docs: SessionDocument[];
}

const TIER_PILL: Record<Exclude<QualityTier, 'empty'>, { label: string; pill: string }> = {
  good:      { label: 'Good',      pill: 'bg-amber-100 text-amber-800' },
  strong:    { label: 'Strong',    pill: 'bg-lime-100 text-lime-800' },
  excellent: { label: 'Excellent', pill: 'bg-emerald-100 text-emerald-800' },
};

const SEGMENT_COLOR: Record<Exclude<QualityTier, 'empty'>, string> = {
  good:      'bg-amber-400',
  strong:    'bg-lime-500',
  excellent: 'bg-emerald-500',
};

export function DocumentQualityMeter({ docs }: Props) {
  const q = computeQuality(docs);

  return (
    <div className="flex items-center gap-3 text-sm">
      {q.tier !== 'empty' && (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_PILL[q.tier].pill}`}>
          {TIER_PILL[q.tier].label}
        </span>
      )}
      <div className="flex gap-1 w-32" aria-label={`Quality: ${q.tier}, ${q.segments} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${
              i < q.segments && q.tier !== 'empty'
                ? SEGMENT_COLOR[q.tier]
                : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{q.hint}</span>
    </div>
  );
}
