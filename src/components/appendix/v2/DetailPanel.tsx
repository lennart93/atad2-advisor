import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsWideLayout } from './hooks';

const EYEBROW = 'text-[11px] font-normal uppercase tracking-[0.16em] text-muted-foreground';

function PanelHeader({ eyebrow, title, headerRight, onClose }: {
  eyebrow?: ReactNode; title?: ReactNode; headerRight?: ReactNode; onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 flex-1">
        {eyebrow != null && <p className={EYEBROW}>{eyebrow}</p>}
        {title != null && <h3 className="mt-1 text-[17px] font-normal leading-snug tracking-tight text-foreground">{title}</h3>}
      </div>
      {headerRight}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-ink-tertiary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * The one master-detail panel per page (spec §4). Desktop (≥1200px): a sticky rail
 * in the reserved right grid column, showing a muted empty state when nothing is
 * selected so the list never reflows. Below that: a right slide-over Sheet with a
 * scrim. Esc / the ✕ close it and clear selection. Only one instance ever exists.
 */
export function DetailPanel({
  open, onClose, eyebrow, title, headerRight, emptyHint = 'Select a row to see its details.', children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title?: ReactNode;
  headerRight?: ReactNode;
  emptyHint?: string;
  children?: ReactNode;
}) {
  const wide = useIsWideLayout();

  // Desktop Esc (the Sheet handles its own Esc on mobile).
  useEffect(() => {
    if (!wide || !open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide, open, onClose]);

  if (wide) {
    return (
      <aside className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-sm border border-border bg-card">
        {open ? (
          <>
            <PanelHeader eyebrow={eyebrow} title={title} headerRight={headerRight} onClose={onClose} />
            <div className="px-5 py-4">{children}</div>
          </>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground/70">{emptyHint}</p>
          </div>
        )}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" hideClose className={cn('w-full gap-0 overflow-y-auto p-0 sm:max-w-md')}>
        <PanelHeader eyebrow={eyebrow} title={title} headerRight={headerRight} onClose={onClose} />
        <div className="px-5 py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
