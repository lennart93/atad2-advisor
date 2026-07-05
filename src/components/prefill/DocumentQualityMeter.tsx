import { computeQuality, type QualityTier } from '@/lib/prefill/qualityMeter';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DOCUMENT_CATEGORIES, type DocumentCategory, type SessionDocument } from '@/lib/prefill/types';

interface Props {
  docs: SessionDocument[];
}

// The label sits as a pill CENTERED OVER the bar. Critical: the pill background
// is SOLID (`bg-ds-card`, opaque) — never a translucent tint — so the label
// reads over any segment fill (a see-through tint is what made "Good" unreadable
// over the amber fill). Tier color shows in the text + a thin ring. The guidance
// line is a hover tooltip, so the meter never grows taller than the bar.
const TIER_PILL: Record<
  Exclude<QualityTier, 'empty'>,
  { label: string; text: string; ring: string }
> = {
  good:      { label: 'Good',      text: 'text-brand-warning',   ring: 'ring-brand-warning/30' },
  strong:    { label: 'Strong',    text: 'text-brand-sage-deep', ring: 'ring-brand-sage/35' },
  excellent: { label: 'Excellent', text: 'text-brand-sage-deep', ring: 'ring-brand-sage/45' },
};

const SEGMENT_COLOR: Record<Exclude<QualityTier, 'empty'>, string> = {
  good:      'bg-brand-warning',
  strong:    'bg-brand-sage',
  excellent: 'bg-brand-sage-deep',
};

const CATEGORY_LABEL = Object.fromEntries(
  DOCUMENT_CATEGORIES.map((c) => [c.value, c.label.toLowerCase()]),
) as Record<DocumentCategory, string>;

/** A one-line nudge naming the two most valuable missing document types. */
function buildNudge(missingTypes: DocumentCategory[]): string | null {
  const top = missingTypes.slice(0, 2).map((t) => CATEGORY_LABEL[t]).filter(Boolean);
  if (top.length === 0) return null;
  const list = top.length === 2 ? `${top[0]} and ${top[1]}` : top[0];
  return `Adding ${list} will reduce the points left to confirm by hand.`;
}

export function DocumentQualityMeter({ docs }: Props) {
  const q = computeQuality(docs);
  // "good" is the weakest non-empty tier; nudge the user toward Strong. The
  // guidance lives only in the tooltip now, so the footer stays one slim line.
  const nudge = q.tier === 'good' ? buildNudge(q.missingTypes) : null;
  // `||` not `??`: q.hint is "" (not null) for Strong/Excellent, so fall
  // through the empty string to the default rather than show a blank tooltip.
  const hint = nudge || q.hint
    || 'A wider range of document types leaves fewer points to confirm by hand.';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="img"
            tabIndex={0}
            className="relative flex h-6 w-56 cursor-help items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2"
            aria-label={
              q.tier === 'empty'
                ? 'Document quality'
                : `Document strength: ${q.tier}, ${q.segments} of 4`
            }
          >
            <div className="flex w-full gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-sm ${
                    i < q.segments && q.tier !== 'empty'
                      ? SEGMENT_COLOR[q.tier]
                      : 'bg-ds-fill-muted'
                  }`}
                />
              ))}
            </div>
            {q.tier !== 'empty' && (
              <span
                className={`pointer-events-none absolute inset-0 m-auto h-fit w-fit rounded-full bg-ds-card px-2.5 py-0.5 text-[11px] font-medium ring-1 ${TIER_PILL[q.tier].text} ${TIER_PILL[q.tier].ring}`}
              >
                {TIER_PILL[q.tier].label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
