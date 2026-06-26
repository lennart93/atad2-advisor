import { computeQuality, type QualityTier } from '@/lib/prefill/qualityMeter';
import { StatusPill, type StatusPillProps } from '@/components/ds';
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

const TIER_PILL: Record<
  Exclude<QualityTier, 'empty'>,
  { label: string; status: StatusPillProps['status'] }
> = {
  good:      { label: 'Good',      status: 'neutral' },
  strong:    { label: 'Strong',    status: 'complete' },
  excellent: { label: 'Excellent', status: 'complete' },
};

const SEGMENT_COLOR: Record<Exclude<QualityTier, 'empty'>, string> = {
  good:      'bg-ds-ink-tertiary',
  strong:    'bg-ds-green',
  excellent: 'bg-ds-green',
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
  // "good" is the weakest non-empty tier; nudge the user toward Strong.
  const nudge = q.tier === 'good' ? buildNudge(q.missingTypes) : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="img"
              tabIndex={0}
              className="relative flex h-7 w-56 cursor-help items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2"
              aria-label={`Document strength: ${q.tier}, ${q.segments} of 4`}
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
                <StatusPill
                  status={TIER_PILL[q.tier].status}
                  className="pointer-events-none absolute inset-0 m-auto h-fit w-fit"
                >
                  {TIER_PILL[q.tier].label}
                </StatusPill>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            A wider range of document types leaves fewer points to confirm by hand.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {(nudge || q.hint) && (
        <div className="max-w-xs text-center text-xs text-ds-ink-secondary">
          {nudge ?? q.hint}
        </div>
      )}
    </div>
  );
}
