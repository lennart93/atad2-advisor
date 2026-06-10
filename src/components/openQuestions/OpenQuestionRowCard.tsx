import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import { formatDate } from "@/utils/formatDate";

/** English status labels for the register lifecycle. */
const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  taken_to_client: "Sent to client",
  answered: "Client answered",
  resolved: "Resolved",
  confirmed_unknown: "Confirmed unknown",
  dismissed: "Not relevant",
};

/** Terminal statuses render with the quiet outline badge. */
const TERMINAL_STATUSES = new Set([
  "answered",
  "resolved",
  "confirmed_unknown",
  "dismissed",
]);

export interface OpenQuestionRowCardProps {
  row: OpenQuestionRow;
  /** Resolved display text (client_question fallback already applied). */
  questionText: string;
  /** True when an answer row exists for this question in this session. */
  onPath: boolean;
  /** Right-aligned actions slot (filled in by the panel later). */
  actions?: ReactNode;
}

/**
 * Presentational card for one open-question register row. Read-only: all
 * mutations arrive through the actions slot.
 */
export function OpenQuestionRowCard({
  row,
  questionText,
  onPath: _onPath,
  actions,
}: OpenQuestionRowCardProps) {
  const statusLabel = STATUS_LABELS[row.status] ?? row.status;
  const statusVariant = TERMINAL_STATUSES.has(row.status) ? "outline" : "secondary";
  const isReopened = row.source === "reopen";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            {isReopened && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-50 text-amber-800"
              >
                Needs attention
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium leading-snug text-foreground">
            {questionText}
          </p>

          {isReopened && row.reopen_reason && (
            <p className="text-sm text-amber-800">{row.reopen_reason}</p>
          )}

          {row.why_it_matters && (
            <p className="text-sm text-muted-foreground">{row.why_it_matters}</p>
          )}

          {row.client_answer && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                Client said on {formatDate(row.client_answer_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {row.client_answer}
              </p>
            </div>
          )}

          {row.status === "taken_to_client" && row.taken_to_client_at && (
            <p className="text-xs text-muted-foreground">
              Sent to client on {formatDate(row.taken_to_client_at)}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-col items-end gap-1">{actions}</div>
        )}
      </div>
    </div>
  );
}
