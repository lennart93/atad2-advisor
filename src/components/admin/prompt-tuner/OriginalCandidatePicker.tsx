import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import { cn } from "@/lib/utils";
import { formatFiscalYears } from "@/utils/formatFiscalYears";
import type { MemoCandidate } from "@/lib/admin/promptTuner";

interface Props {
  candidates: MemoCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onManual: () => void;
  /** What the candidates are, for the empty state. Defaults to "memo". */
  noun?: string;
}

export function OriginalCandidatePicker({ candidates, selectedId, onSelect, onConfirm, onManual, noun = "memo" }: Props) {
  if (candidates.length === 0) {
    return (
      <AdminCard>
        <p className="text-sm text-muted-foreground">
          No matching {noun} found. You can paste the original by hand instead.
        </p>
        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onManual}>Paste original manually</Button>
        </div>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-normal">
        Pick the original this was improved from
      </div>
      {candidates.map((c, i) => {
        const selected = c.source_row_id === selectedId;
        return (
          <AdminCard
            key={c.source_row_id}
            interactive
            onClick={() => onSelect(c.source_row_id)}
            className={cn(selected && "ring-2 ring-ds-ink border-ds-ink")}
          >
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="min-w-0">
                <div className="text-[13px] font-normal text-foreground truncate">
                  {c.taxpayer_name ?? "Unknown taxpayer"}
                  {c.fiscal_year ? <span className="text-muted-foreground font-normal"> · FY {formatFiscalYears(c.fiscal_year)}</span> : null}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">{c.session_id}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {i === 0 && <StatusChip label="Best match" tone="neutral" />}
                <span className="text-[11px] font-mono text-muted-foreground">
                  {Math.round(c.score * 100)}%
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{c.snippet}</p>
          </AdminCard>
        );
      })}
      <div className="flex justify-between items-center pt-1">
        <Button variant="ghost" size="sm" onClick={onManual}>None of these, paste manually</Button>
        <Button disabled={!selectedId} onClick={onConfirm}>Use this original</Button>
      </div>
    </div>
  );
}
