import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
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
import type { RelatedPartiesResult } from '@/lib/appendix/relatedParties';
import type { AppendixRow, EditableField, SkeletonRow, Status } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  showSources: boolean;
  relatedParties: RelatedPartiesResult | null;
  onEdit: (rowId: string, field: EditableField, value: string) => void;
}

interface Section {
  sectionId: string;
  sectionTitle: string;
  items: SkeletonRow[];
}

/** Text cell that keeps a local draft and commits on blur (no per-keystroke DB writes). */
function EditableCell({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      rows={3}
      className="min-h-0 resize-y text-sm"
      aria-label={label}
    />
  );
}

function pct(n: number | null): string {
  return n == null ? '?' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

/** The related-parties overview, built from the structure chart. */
function RelatedPartiesPanel({ data }: { data: RelatedPartiesResult }) {
  if (!data.parties.length) {
    return <p className="text-xs text-muted-foreground">No related parties found in the structure chart.</p>;
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">
        Related parties{data.taxpayerName ? ` of ${data.taxpayerName}` : ''}{' '}
        <span className="font-normal text-muted-foreground">(from the structure chart)</span>
      </p>
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
                  {p.meetsReverse && <span className="ml-1 text-[10px] text-sky-700 dark:text-sky-300">≥50%</span>}
                  {p.meetsRelated && !p.meetsReverse && <span className="ml-1 text-[10px] text-sky-700 dark:text-sky-300">&gt;25%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Direct holdings only. A reviewer aid, not the legal relatedness test.
      </p>
    </div>
  );
}

/** Per-row internal sources: the structured related-parties overview (where relevant) plus the raw provenance. */
function SourcesPopover({
  rowId,
  provenance,
  showRelated,
  relatedParties,
}: {
  rowId: string;
  provenance: string | null;
  showRelated: boolean;
  relatedParties: RelatedPartiesResult | null;
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
        {showRelated && relatedParties && <RelatedPartiesPanel data={relatedParties} />}
        <div>
          <p className="mb-1 text-xs font-medium text-foreground">Provenance <span className="font-normal text-muted-foreground">(internal)</span></p>
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {provenance || 'No provenance recorded.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppendixTable({ rows, skeleton, showSources, relatedParties, onEdit }: Props) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const sk of skeleton) {
      if (!byId.has(sk.rowId)) continue;
      let s = out.find((x) => x.sectionId === sk.sectionId);
      if (!s) {
        s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, items: [] };
        out.push(s);
      }
      s.items.push(sk);
    }
    return out;
  }, [byId, skeleton]);

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
                  {showSources && <TableHead className="w-10" aria-label="Sources" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sec.items.map((sk) => {
                  const row = byId.get(sk.rowId)!;
                  const tone = statusTone(row.status, sk.kind);
                  return (
                    <TableRow
                      key={sk.rowId}
                      className={cn('align-top border-l-2', tone.rowAccent)}
                    >
                      <TableCell className="font-medium tabular-nums text-muted-foreground">
                        {sk.rowId}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sk.legalBasis}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sk.conditionTested}
                        {row.stale && (
                          <div className="mt-1.5">
                            <Badge variant="outline" className="text-[10px] font-normal text-amber-700 dark:text-amber-300 border-amber-400/50">
                              review again
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.status ?? undefined}
                          onValueChange={(v) => onEdit(sk.rowId, 'status', v)}
                        >
                          <SelectTrigger
                            className={cn('h-8 text-sm', tone.cell)}
                            aria-label={`Status for ${sk.rowId}`}
                          >
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
                          <SourcesPopover
                            rowId={sk.rowId}
                            provenance={row.provenance}
                            showRelated={!!sk.relatedPartiesView}
                            relatedParties={relatedParties}
                          />
                        </TableCell>
                      )}
                    </TableRow>
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
