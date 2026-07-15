import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoPopover } from './InfoPopover';

/** The auto-analysis reason, in a small warning-tinted box (spec §4 flag banner). */
export function FlagBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-[#e8cfc4] bg-[#faf2ee] px-3 py-2.5 text-[13px] leading-snug text-[#a8492d]">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** A labelled group with an optional collective (i) popover (spec §4/§8). */
export function PanelGroup({ label, info, children }: { label: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
        {info && <InfoPopover label={label}>{info}</InfoPopover>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * One compact key-value row: label left, value right (usually an inline select),
 * hairline separator. The unresolved field gets accent treatment via `attention`.
 * `sub` is an optional secondary line under the row (e.g. the one-sentence
 * reasoning behind a derived value); nothing renders when it is absent.
 */
export function KeyValueRow({ label, attention, sub, children }: {
  label: string; attention?: boolean; sub?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="border-b border-ds-hairline last:border-b-0">
      <div className="flex items-center justify-between gap-3 py-2">
        <span className={cn('text-[13px]', attention ? 'text-brand-terracotta-deep' : 'text-ds-ink-secondary')}>{label}</span>
        <div className="shrink-0">{children}</div>
      </div>
      {sub != null && sub !== '' && (
        <p className="-mt-1 pb-2 text-[12px] leading-snug text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

/**
 * Empty reasoning renders as a "+ Add reasoning" link (spec §5 empty-state rule);
 * clicking expands an inline textarea. Existing text shows with an edit affordance.
 * Commits on blur; an optional `onDraft` runs the "Draft, review and adjust" AI action.
 */
export function ReasoningField({ value, placeholder, onCommit, draftAction }: {
  value: string | null;
  placeholder?: string;
  onCommit: (text: string) => void;
  draftAction?: { label: string; run: () => void; busy?: boolean };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const baseline = useRef(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (editing && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, draft]);
  useEffect(() => {
    const el = ref.current;
    if (editing && el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, [editing]);

  const start = () => { baseline.current = value ?? ''; setDraft(value ?? ''); setEditing(true); };
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== baseline.current.trim()) onCommit(draft.trim());
  };

  if (editing) {
    return (
      <div>
        <textarea
          ref={ref}
          value={draft}
          rows={1}
          aria-label="Reasoning"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="w-full resize-none overflow-hidden rounded-[8px] border border-[#e3dfd6] bg-white px-3 py-2.5 text-[13px] leading-[1.6] text-foreground caret-[#c25c3c] outline-none placeholder:text-muted-foreground/60 focus-visible:shadow-[0_0_0_3px_rgba(194,92,60,0.10)]"
        />
        {draftAction && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={draftAction.run}
            disabled={draftAction.busy}
            className="mt-1.5 text-[12px] text-brand-terracotta transition-colors hover:text-brand-terracotta-deep disabled:opacity-50"
          >
            {draftAction.label}
          </button>
        )}
      </div>
    );
  }

  if (value && value.trim()) {
    return (
      <button
        type="button"
        onClick={start}
        className="block w-full rounded-[6px] px-1 py-0.5 text-left text-[13px] leading-[1.6] text-[#4a463f] transition-colors hover:bg-muted/40"
        title="Click to edit"
      >
        {value}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex items-center gap-1.5 text-[13px] text-brand-terracotta transition-colors hover:text-brand-terracotta-deep"
    >
      <Plus className="h-3.5 w-3.5" /> Add reasoning
    </button>
  );
}

/** The segmented status control (spec §4): one row of mutually-exclusive buttons. */
export function SegmentedControl<T extends string | null>({ options, value, onChange }: {
  options: ReadonlyArray<{ value: T; label: string; tone?: 'needs' | 'no_risk' | 'neutral' }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-card p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[4px] px-3 py-1.5 text-[12.5px] transition-colors',
              active
                ? o.tone === 'needs'
                  ? 'bg-brand-terracotta-soft text-brand-terracotta-deep'
                  : o.tone === 'no_risk'
                    ? 'bg-brand-sage-soft text-ds-green-text'
                    : 'bg-foreground text-white'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
