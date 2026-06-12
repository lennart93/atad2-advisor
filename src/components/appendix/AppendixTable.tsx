import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, Flag, Info, Network } from 'lucide-react';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { cleanReasoning } from '@/lib/appendix/reasoningText';
import type { RelatedParty, RelatedPartiesResult, Relationship } from '@/lib/appendix/relatedParties';
import type { AppendixRow, EditableField, SkeletonRow, Status } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  showSources: boolean;
  relatedParties: RelatedPartiesResult | null;
  onEdit: (rowId: string, field: EditableField, value: string) => void;
  onToggleExclude: (rowId: string, excluded: boolean) => void;
}

interface Section {
  sectionId: string;
  sectionTitle: string;
  items: SkeletonRow[];
}

// ---------------------------------------------------------------------------
// Status presentation: the quiet default vs the rows that need the reviewer.
// 'Not triggered' is the dominant, boring outcome and stays muted; color is
// reserved for Triggered (info blue) and Insufficient information (amber).
// ---------------------------------------------------------------------------

type StatusKind = 'triggered' | 'insufficient' | 'quiet';

function statusKind(status: Status | null): StatusKind {
  if (status === 'Triggered') return 'triggered';
  if (status === 'Insufficient information') return 'insufficient';
  return 'quiet';
}

const STATUS_SHORT: Record<StatusKind, string> = {
  triggered: 'Triggered',
  insufficient: 'Insufficient info',
  quiet: 'Not triggered',
};

function StatusIcon({ kind, className }: { kind: StatusKind; className?: string }) {
  if (kind === 'triggered') return <Flag className={cn('text-sky-600 dark:text-sky-400', className)} />;
  if (kind === 'insufficient') return <AlertCircle className={cn('text-amber-600 dark:text-amber-400', className)} />;
  return <CheckCircle2 className={cn('text-muted-foreground/50', className)} />;
}

/** Condition titles are labels, not statute text: one line, cut at a word. */
function shortTitle(s: string, max = 64): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > 32 ? at : max)}…`;
}

/**
 * Read mode is a normal paragraph; Edit reasoning swaps in an auto-growing
 * textarea (no fixed height, no inner scrollbox, commit on blur).
 */
function ReasoningBlock({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (editing && el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing, draft]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        autoFocus
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() !== value.trim()) onCommit(draft.trim());
        }}
        aria-label={label}
        className="w-full resize-none overflow-hidden rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1.5 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 dark:bg-transparent"
      />
    );
  }
  return (
    <div>
      <p className="text-sm leading-relaxed text-foreground/90">{value || 'No reasoning recorded.'}</p>
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true); }}
        className="mt-1.5 rounded border border-[hsl(var(--border-subtle))] px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Edit reasoning
      </button>
    </div>
  );
}

function pct(n: number | null): string {
  return n == null ? '?' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** One dense, single-line associated-enterprise row. */
function AssociationRow({ p }: { p: RelatedParty }) {
  const reverse = p.meetsReverse === true;
  const associated = p.meetsRelated === true;
  const dot = reverse ? 'bg-indigo-500' : associated ? 'bg-sky-500' : 'bg-muted-foreground/30';
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs leading-tight">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />
      <span className={cn('truncate', associated ? 'font-medium text-foreground' : 'text-muted-foreground')} title={p.name}>
        {p.name}
      </span>
      {p.jurisdiction && <span className="shrink-0 text-[10px] uppercase text-muted-foreground/70">{p.jurisdiction}</span>}
      <span className="flex-1" />
      <span className="shrink-0 tabular-nums text-muted-foreground">{pct(p.ownershipPct)}</span>
      {reverse && <span className="shrink-0 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">&ge;50%</span>}
    </div>
  );
}

const GROUPS: { key: Relationship; label: string }[] = [
  { key: 'Parent', label: 'Shareholders' },
  { key: 'Subsidiary', label: 'Subsidiaries' },
  { key: 'Group entity', label: 'Other group' },
];

function LegendDot({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
      {label}
    </span>
  );
}

/** Full-width, dense association panel shown under the relatedness row. */
function AssociationPanel({ data }: { data: RelatedPartiesResult | null }) {
  if (!data) return <p className="text-xs text-muted-foreground">Structure chart not available.</p>;
  if (!data.parties.length) return <p className="text-xs text-muted-foreground">No related parties found in the structure chart.</p>;
  return (
    <div className="rounded-md border border-sky-200/70 bg-sky-50/40 p-2.5 dark:border-sky-900/40 dark:bg-sky-950/20">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Network className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
          Associated enterprises{data.taxpayerName ? ` of ${data.taxpayerName}` : ''}
        </span>
        <span className="text-[10px] text-muted-foreground">art. 12ac, &gt;25% test</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <LegendDot dot="bg-indigo-500" label="≥50%" />
          <LegendDot dot="bg-sky-500" label=">25% associated" />
          <LegendDot dot="bg-muted-foreground/30" label="below" />
        </span>
      </div>
      <div className="grid gap-x-5 gap-y-2 sm:grid-cols-3">
        {GROUPS.map((g) => {
          const items = data.parties.filter((p) => p.relationship === g.key);
          if (!items.length) return null;
          return (
            <div key={g.key}>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{g.label}</p>
              <div className="divide-y divide-[hsl(var(--border-subtle))]">
                {items.map((p) => <AssociationRow key={p.id} p={p} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact related-parties table for the sources popover. */
function RelatedPartiesTable({ data }: { data: RelatedPartiesResult }) {
  if (!data.parties.length) return <p className="text-xs text-muted-foreground">No related parties found in the structure chart.</p>;
  return (
    <div className="overflow-hidden rounded border border-[hsl(var(--border-subtle))]">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Entity</th>
            <th className="px-2 py-1 text-left font-medium">Relationship</th>
            <th className="px-2 py-1 text-right font-medium">Interest</th>
          </tr>
        </thead>
        <tbody>
          {data.parties.map((p) => (
            <tr key={p.id} className="border-t border-[hsl(var(--border-subtle))]">
              <td className="px-2 py-1">
                <span className="font-medium text-foreground">{p.name}</span>
                {p.jurisdiction && <span className="text-muted-foreground"> · {p.jurisdiction}</span>}
              </td>
              <td className="px-2 py-1 text-muted-foreground">{p.relationship}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                <span className={cn(p.meetsRelated && 'font-semibold text-foreground')}>{pct(p.ownershipPct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per-row sources: a related-parties table (popover rows) plus the raw provenance. */
function SourcesPopover({
  rowId, provenance, showRelated, relatedParties,
}: {
  rowId: string; provenance: string | null; showRelated: boolean; relatedParties: RelatedPartiesResult | null;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Sources for ${rowId}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3 text-sm">
        {showRelated && relatedParties && <RelatedPartiesTable data={relatedParties} />}
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Provenance <span className="font-normal text-muted-foreground">(internal)</span></p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{provenance || 'No provenance recorded.'}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppendixTable({ rows, skeleton, showSources, relatedParties, onEdit, onToggleExclude }: Props) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const sk of skeleton) {
      if (!byId.has(sk.rowId)) continue;
      let s = out.find((x) => x.sectionId === sk.sectionId);
      if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, items: [] }; out.push(s); }
      s.items.push(sk);
    }
    return out;
  }, [byId, skeleton]);

  // Rows that need the reviewer start expanded; the quiet majority starts
  // collapsed. Initialized once when rows first arrive so the background
  // refine poll never yanks rows open or shut while the advisor works.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || rows.length === 0) return;
    initializedRef.current = true;
    setOpen(new Set(rows.filter((r) => statusKind(r.status) !== 'quiet').map((r) => r.rowId)));
  }, [rows]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tally = (sec: Section): string => {
    const counts = { triggered: 0, insufficient: 0, quiet: 0 };
    for (const sk of sec.items) counts[statusKind(byId.get(sk.rowId)!.status)] += 1;
    const parts = [
      `${sec.items.length} ${sec.items.length === 1 ? 'condition' : 'conditions'}`,
      counts.quiet > 0 ? `${counts.quiet} not triggered` : null,
      counts.insufficient > 0 ? `${counts.insufficient} insufficient` : null,
      counts.triggered > 0 ? `${counts.triggered} triggered` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  };

  return (
    <div className="space-y-7">
      {sections.map((sec) => (
        <section key={sec.sectionId}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Section {sec.sectionId} · {sec.sectionTitle}
            </h3>
            <span className="flex-1" />
            <span className="shrink-0 text-[11px] text-muted-foreground">{tally(sec)}</span>
          </div>
          <div className="space-y-1.5">
            {sec.items.map((sk) => {
              const row = byId.get(sk.rowId)!;
              const kind = statusKind(row.status);
              const expanded = open.has(sk.rowId);
              const excluded = row.excludedFromClient;
              const reasoning = cleanReasoning(row.reasoning);

              if (!expanded) {
                return (
                  <button
                    key={sk.rowId}
                    type="button"
                    onClick={() => toggle(sk.rowId)}
                    aria-expanded={false}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md border border-[hsl(var(--border-subtle))] px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40',
                      excluded && 'opacity-55',
                    )}
                  >
                    <span className="w-7 shrink-0 tabular-nums text-xs text-muted-foreground">{sk.rowId}</span>
                    <StatusIcon kind={kind} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-muted-foreground">{shortTitle(sk.conditionTested)}</span>
                    {row.stale && (
                      <Badge variant="outline" className="shrink-0 border-amber-400/50 text-[10px] font-normal text-amber-700 dark:text-amber-300">
                        review again
                      </Badge>
                    )}
                    <span className="flex-1" />
                    <span className="shrink-0 text-xs text-muted-foreground/70">{STATUS_SHORT[kind]}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              }

              return (
                <Fragment key={sk.rowId}>
                  <div
                    className={cn(
                      'rounded-md border border-[hsl(var(--border-subtle))] border-l-[3px]',
                      kind === 'triggered' && 'border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/15',
                      kind === 'insufficient' && 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/15',
                      kind === 'quiet' && 'border-l-[hsl(var(--border-subtle))]',
                      excluded && 'opacity-55',
                    )}
                  >
                    {/* Header line: number, icon, title, status + controls. */}
                    <div className="flex items-center gap-2.5 px-3 pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggle(sk.rowId)}
                        aria-expanded
                        aria-label={`Collapse ${sk.rowId}`}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span className="w-7 shrink-0 tabular-nums text-xs text-muted-foreground">{sk.rowId}</span>
                        <StatusIcon kind={kind} className="h-4 w-4 shrink-0" />
                        <span className="truncate text-sm font-medium text-foreground">{shortTitle(sk.conditionTested)}</span>
                      </button>
                      <Select value={row.status ?? undefined} onValueChange={(v) => onEdit(sk.rowId, 'status', v)}>
                        <SelectTrigger
                          aria-label={`Status for ${sk.rowId}`}
                          className={cn(
                            'h-7 w-auto gap-1.5 rounded-full border-none px-2.5 text-xs font-medium',
                            kind === 'triggered' && 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200',
                            kind === 'insufficient' && 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
                            kind === 'quiet' && 'bg-muted text-muted-foreground',
                          )}
                        >
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          {sk.allowedStates.map((s: Status) => (
                            <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showSources && (
                        <SourcesPopover
                          rowId={sk.rowId}
                          provenance={row.provenance}
                          showRelated={sk.relatedView === 'popover'}
                          relatedParties={relatedParties}
                        />
                      )}
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={excluded ? `Include ${sk.rowId} in the client export` : `Exclude ${sk.rowId} from the client export`}
                        title={excluded ? 'Excluded from client export' : 'Visible to client'}
                        onClick={() => onToggleExclude(sk.rowId, !excluded)}
                      >
                        {excluded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(sk.rowId)}
                        aria-label={`Collapse ${sk.rowId}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                      </button>
                    </div>

                    {/* Body: legal basis caption, the full condition, the reasoning. */}
                    <div className="space-y-1.5 px-3 pb-3 pl-[3.25rem] pt-1">
                      <p className={cn(
                        'text-xs font-medium',
                        kind === 'triggered' && 'text-sky-700 dark:text-sky-300',
                        kind === 'insufficient' && 'text-amber-700 dark:text-amber-300',
                        kind === 'quiet' && 'text-muted-foreground',
                      )}>
                        {sk.legalBasis}
                        {row.stale && (
                          <Badge variant="outline" className="ml-2 border-amber-400/50 text-[10px] font-normal text-amber-700 dark:text-amber-300">
                            review again
                          </Badge>
                        )}
                        {excluded && (
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal text-muted-foreground">
                            excluded from client
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs leading-snug text-muted-foreground">{sk.conditionTested}</p>
                      <ReasoningBlock
                        value={reasoning}
                        label={`Reasoning for ${sk.rowId}`}
                        onCommit={(v) => onEdit(sk.rowId, 'reasoning', v)}
                      />
                    </div>
                  </div>
                  {sk.relatedView === 'inline' && relatedParties && (
                    <div className={cn(excluded && 'opacity-55')}>
                      <AssociationPanel data={relatedParties} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
