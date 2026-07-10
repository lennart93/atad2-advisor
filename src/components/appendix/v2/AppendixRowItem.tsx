import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowEye {
  hidden: boolean;
  onToggle: () => void;
  label: string;
}

/**
 * One list item (spec §4). Thin, fixed-height, two lines max. Line 1: ID (muted) +
 * primary label + right meta. Line 2 (optional, muted): the one-line flag reason.
 * No chevron, no inline controls. The eye stays as a small muted icon on the right.
 * Selected: 2px left accent border + subtle tint. The whole row opens the panel.
 *
 * A div[role=button] (not a <button>) so the eye can be a real nested button
 * without invalid markup; `data-appendix-row` + tabIndex make ↑/↓/Enter work.
 */
export function AppendixRowItem({
  rowId, domId, label, meta, reason, selected, routine, onSelect, eye,
}: {
  rowId: string;
  domId?: string;
  label: ReactNode;
  meta?: ReactNode;
  reason?: string | null;
  selected: boolean;
  routine?: boolean;
  onSelect: () => void;
  eye?: RowEye | null;
}) {
  return (
    <div
      id={domId}
      data-appendix-row
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(ev) => {
        if (ev.currentTarget === ev.target && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group flex cursor-pointer items-start gap-3 border-b border-border py-2.5 pr-2 pl-3 transition-colors hover:bg-accent focus:bg-accent focus:outline-none',
        selected
          ? 'border-l-2 border-l-brand-terracotta bg-brand-terracotta-soft/25 pl-[10px]'
          : 'border-l-2 border-l-transparent',
        routine && 'opacity-90',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-ds-ink-secondary">{rowId}</span>
          <span className={cn('min-w-0 truncate text-[14px]', routine ? 'text-muted-foreground' : 'text-foreground')}>
            {label}
          </span>
          {meta != null && (
            <>
              <span className="ml-auto shrink-0" />
              <span className="shrink-0 text-[12.5px] text-muted-foreground">{meta}</span>
            </>
          )}
        </div>
        {reason && (
          <p className="mt-0.5 truncate text-[11.5px] leading-snug text-muted-foreground">{reason}</p>
        )}
      </div>
      {eye && (
        <button
          type="button"
          aria-label={eye.label}
          title={eye.label}
          onClick={(e) => { e.stopPropagation(); eye.onToggle(); }}
          className={cn(
            'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] transition-colors',
            eye.hidden
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'text-brand-sage-deep hover:bg-brand-sage-soft',
          )}
        >
          {eye.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
