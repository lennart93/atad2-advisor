import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The routine roll-up inside an open section (spec §4): one muted line — check +
 * summary + a Show/Hide link — that expands to reveal the routine rows in the same
 * thin-row format. Collapsed by default on every load (no persistence).
 */
export function RolledUpGroup({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-2.5 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-brand-sage-deep" aria-hidden />
          <span className="truncate text-[13px] text-muted-foreground">{summary}</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
          )}
        >
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}
