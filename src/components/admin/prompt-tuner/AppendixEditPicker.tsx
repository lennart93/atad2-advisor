import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import { cn } from "@/lib/utils";
import type { AppendixCandidate } from "@/lib/admin/promptTuner";

interface Props {
  candidates: AppendixCandidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConfirm: () => void;
}

export function AppendixEditPicker({ candidates, selectedId, onSelect, onConfirm }: Props) {
  if (candidates.length === 0) {
    return (
      <AdminCard>
        <p className="text-sm text-muted-foreground">
          No appendix edits found yet. Edit an appendix row in an assessment first, then come back.
        </p>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-normal">
        Pick a manual appendix correction to learn from
      </div>
      {candidates.map((c) => {
        const selected = c.edit_id === selectedId;
        return (
          <AdminCard
            key={c.edit_id}
            interactive
            onClick={() => onSelect(c.edit_id)}
            className={cn(selected && "ring-2 ring-ds-ink border-ds-ink")}
          >
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="min-w-0">
                <div className="text-[13px] font-normal text-foreground truncate">
                  {c.taxpayer_name ?? "Unknown taxpayer"}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  row {c.row_id} · {c.field}
                </div>
              </div>
              <StatusChip label={new Date(c.edited_at).toLocaleDateString()} tone="neutral" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ds-ink-secondary font-normal mb-0.5">Original</div>
                <p className="text-xs text-muted-foreground line-clamp-3">{c.original_text}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-ds-ink-secondary font-normal mb-0.5">Improved</div>
                <p className="text-xs text-muted-foreground line-clamp-3">{c.improved_text}</p>
              </div>
            </div>
          </AdminCard>
        );
      })}
      <div className="flex justify-end pt-1">
        <Button disabled={!selectedId} onClick={onConfirm}>Use this correction</Button>
      </div>
    </div>
  );
}
