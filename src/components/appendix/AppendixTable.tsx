import { Fragment, useEffect, useMemo, useState } from 'react';
import { Info, Eye, EyeOff, Network } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { statusTone } from '@/lib/appendix/status';
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

/** Text cell that keeps a local draft and commits on blur (no per-keystroke DB writes). */
function EditableCell({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      rows={3}
      className="min-h-0 resize-y text-sm"
      aria-label={label}
    />
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

  const colSpan = showSources ? 6 : 5;

  return (
    <div className="space-y-8">
      {sections.map((sec) => (
        <section key={sec.sectionId}>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            Section {sec.sectionId}. {sec.sectionTitle}
          </h3>
          <div className="rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-[15%]">Legal basis</TableHead>
                  <TableHead className="w-[24%]">Condition tested</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead>Reasoning</TableHead>
                  {showSources && <TableHead className="w-16" aria-label="Actions" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sec.items.map((sk) => {
                  const row = byId.get(sk.rowId)!;
                  const tone = statusTone(row.status, sk.kind);
                  const excluded = row.excludedFromClient;
                  return (
                    <Fragment key={sk.rowId}>
                      <TableRow
                        className={cn('align-top border-l-2', tone.rowAccent, excluded && 'opacity-55')}
                      >
                        <TableCell className="font-medium tabular-nums text-muted-foreground">
                          {sk.rowId}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sk.legalBasis}
                        </TableCell>
                        <TableCell className="text-sm">
                          {sk.conditionTested}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {row.stale && (
                              <Badge variant="outline" className="text-[10px] font-normal text-amber-700 dark:text-amber-300 border-amber-400/50">
                                review again
                              </Badge>
                            )}
                            {excluded && (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                excluded from client
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={row.status ?? undefined} onValueChange={(v) => onEdit(sk.rowId, 'status', v)}>
                            <SelectTrigger className={cn('h-8 text-sm', tone.cell)} aria-label={`Status for ${sk.rowId}`}>
                              <span className="flex items-center gap-2">
                                <span className={cn('h-2 w-2 shrink-0 rounded-full', tone.dot)} />
                                <SelectValue placeholder="Choose" />
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {sk.allowedStates.map((s: Status) => (
                                <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <EditableCell
                            value={row.reasoning ?? ''}
                            label={`Reasoning for ${sk.rowId}`}
                            onCommit={(v) => onEdit(sk.rowId, 'reasoning', v)}
                          />
                        </TableCell>
                        {showSources && (
                          <TableCell className="px-1">
                            <div className="flex items-center">
                              <SourcesPopover
                                rowId={sk.rowId}
                                provenance={row.provenance}
                                showRelated={sk.relatedView === 'popover'}
                                relatedParties={relatedParties}
                              />
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                                aria-label={excluded ? `Include ${sk.rowId} in the client export` : `Exclude ${sk.rowId} from the client export`}
                                title={excluded ? 'Excluded from client export' : 'Visible to client'}
                                onClick={() => onToggleExclude(sk.rowId, !excluded)}
                              >
                                {excluded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {sk.relatedView === 'inline' && (
                        <TableRow className={cn(excluded && 'opacity-55')}>
                          <TableCell colSpan={colSpan} className="pt-0">
                            <AssociationPanel data={relatedParties} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
