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
import type { AppendixRow, SkeletonRow } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  skeleton: SkeletonRow[];
  showReferences: boolean;
  onEdit: (rowId: string, field: 'decision' | 'reasoning', value: string) => void;
}

interface Section {
  sectionId: string;
  sectionTitle: string;
  items: SkeletonRow[];
}

/** Reasoning cell keeps a local draft and commits on blur (no per-keystroke DB writes). */
function ReasoningCell({
  value,
  onCommit,
}: {
  value: string;
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
      aria-label="Reasoning"
    />
  );
}

export function AppendixTable({ rows, skeleton, showReferences, onEdit }: Props) {
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
                  <TableHead className="w-14">#</TableHead>
                  <TableHead className="w-[28%]">Legal framework</TableHead>
                  <TableHead className="w-48">Decision</TableHead>
                  <TableHead>Reasoning</TableHead>
                  {showReferences && (
                    <TableHead className="w-48 bg-muted/40">
                      Reference <span className="font-normal text-muted-foreground">(internal)</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sec.items.map((sk) => {
                  const row = byId.get(sk.rowId)!;
                  return (
                    <TableRow
                      key={sk.rowId}
                      className={cn('align-top', row.stale && 'border-l-2 border-l-amber-500')}
                    >
                      <TableCell className="font-medium tabular-nums text-muted-foreground">
                        {sk.rowId}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sk.legalFramework}
                        {row.stale && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px] font-normal text-amber-700 dark:text-amber-300 border-amber-400/50">
                              review again
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.decision ?? undefined}
                          onValueChange={(v) => onEdit(sk.rowId, 'decision', v)}
                        >
                          <SelectTrigger className="h-8 text-sm" aria-label={`Decision for ${sk.rowId}`}>
                            <SelectValue placeholder="Choose" />
                          </SelectTrigger>
                          <SelectContent>
                            {sk.allowedStates.map((s) => (
                              <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <ReasoningCell
                          value={row.reasoning ?? ''}
                          onCommit={(v) => onEdit(sk.rowId, 'reasoning', v)}
                        />
                      </TableCell>
                      {showReferences && (
                        <TableCell className="bg-muted/20 text-xs text-muted-foreground">
                          {row.reference}
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
