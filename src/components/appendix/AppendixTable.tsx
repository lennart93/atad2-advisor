import { useEffect, useMemo, useState } from 'react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { statusTone } from '@/lib/appendix/status';
import type { AppendixRow, EditableField, SkeletonRow, Status } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  showInternal: boolean;
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
      rows={2}
      className="min-h-0 resize-y text-sm"
      aria-label={label}
    />
  );
}

export function AppendixTable({ rows, skeleton, showInternal, onEdit }: Props) {
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
                  <TableHead className="w-[22%]">Condition tested</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead>Legal consequence</TableHead>
                  <TableHead>Factual basis</TableHead>
                  {showInternal && (
                    <TableHead className="w-44 bg-muted/40">
                      Provenance <span className="font-normal text-muted-foreground">(internal)</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sec.items.map((sk) => {
                  const row = byId.get(sk.rowId)!;
                  const tone = statusTone(row.status);
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
                          value={row.consequence ?? ''}
                          label={`Legal consequence for ${sk.rowId}`}
                          onCommit={(v) => onEdit(sk.rowId, 'consequence', v)}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          value={row.factualBasis ?? ''}
                          label={`Factual basis for ${sk.rowId}`}
                          onCommit={(v) => onEdit(sk.rowId, 'factualBasis', v)}
                        />
                      </TableCell>
                      {showInternal && (
                        <TableCell className="bg-muted/20 text-xs text-muted-foreground">
                          {row.provenance}
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
