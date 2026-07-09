import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoPopover } from './InfoPopover';

/**
 * A section header row (spec §4). One 44-48px row: index (muted) + title + an
 * inline data summary + a right side that reads either "✓ Verified/Complete" or
 * "N need review" in accent, plus a chevron. The old intro paragraph moves behind
 * the (i). Sections with flagged rows open by default; verified ones start collapsed.
 * The body renders only when open.
 */
export function SectionRow({
  index, title, summary, needReview, verifiedLabel = 'Verified', info, open, onToggle, children, id,
}: {
  index: number | string;
  title: string;
  summary?: ReactNode;
  needReview: number;
  verifiedLabel?: string;
  info?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="rounded-sm border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="w-4 shrink-0 text-[13px] tabular-nums text-muted-foreground/60">{index}</span>
          <span className="shrink-0 text-[15px] font-normal text-foreground">{title}</span>
          {summary != null && (
            <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{summary}</span>
          )}
        </button>
        {info && <InfoPopover label={`About ${title}`}>{info}</InfoPopover>}
        {needReview > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-ds-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-ds-ink-tertiary" aria-hidden />
            {needReview} need review
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-brand-sage-deep">
            <Check className="h-3.5 w-3.5" aria-hidden />
            {verifiedLabel}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}
