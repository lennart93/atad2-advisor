// src/components/structure/StructureRefiningCallout.tsx
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiBusySignal } from '@/stores/uiBusyStore';
import type { ChartStatus } from '@/lib/structure/types';

interface Props {
  chartId: string | null;
  status: ChartStatus | 'loading';
}

/**
 * Speech-bubble callout that appears below the "Structure" stepper pill on
 * landing. Explains that the visible chart was extracted from the documents
 * and that Phase B (refine with Q&A) is finishing up in the background.
 * Auto-disappears when status reaches draft_ready; user can dismiss early.
 *
 * Dismissal is scoped per chart via sessionStorage so the bubble does not
 * re-pop on tab returns within the same session, but a fresh assessment
 * (new chart id) sees it again.
 */
export function StructureRefiningCallout({ chartId, status }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [entered, setEntered] = useState(false);

  const storageKey = chartId ? `atad2.refiningCalloutDismissed:${chartId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      if (window.sessionStorage.getItem(storageKey) === '1') {
        setDismissed(true);
      }
    } catch {
      // sessionStorage unavailable (private mode) — falls through to in-memory only.
    }
  }, [storageKey]);

  const isRefining =
    status === 'phase_a_ready' || status === 'extracting:refining';
  const visible = isRefining && !dismissed;

  // The top-left AppLayout logo is the app's single loading indicator. Signal
  // "busy" while the refine pass runs so that logo spins, rather than putting a
  // second spinner inside this bubble. Stays active even after the bubble is
  // dismissed — it tracks the work, not the notice.
  useUiBusySignal(isRefining);

  // Stagger the enter so the chart paints first and the bubble feels like a
  // friendly follow-up rather than a stacked overlay.
  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const t = window.setTimeout(() => setEntered(true), 450);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey) {
      try {
        window.sessionStorage.setItem(storageKey, '1');
      } catch {
        // Quota / private mode — accept in-memory dismissal only.
      }
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-3 z-20"
      data-snapshot-exclude="true"
    >
      <div className="mx-auto flex max-w-6xl justify-end px-4">
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-auto relative w-[320px] origin-top-right rounded-2xl border border-[hsl(var(--border-subtle))] bg-card',
            'shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_36px_-18px_rgb(0_0_0/0.28)]',
            'transition-all duration-300 ease-out motion-reduce:transition-none',
            entered ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1.5 scale-[0.96] opacity-0',
          )}
        >
          {/* Tail — sits flush against the bubble's top edge, offset to land
              roughly under the active "Structure" pill in the stepper above. */}
          <div
            aria-hidden
            className="absolute -top-[6px] right-14 h-3 w-3 rotate-45 rounded-[2px] border-l border-t border-[hsl(var(--border-subtle))] bg-card"
          />
          <div className="flex items-start gap-3 px-4 py-3">
            <p className="flex-1 text-xs leading-relaxed text-foreground">
              This structure chart is based on your uploaded documents. Give me about{' '}
              <span className="font-medium">2 minutes</span> to check whether
              your Q&amp;A answers require adjustments.
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="-m-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
