import type { ReactNode } from "react";
import { StatusPill } from "@/components/ds";
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

/** Statuses with a confirmed outcome render the green "complete" pill;
 *  everything else (in-flight or dismissed) stays neutral. */
const COMPLETE_STATUSES = new Set([
  "answered",
  "resolved",
  "confirmed_unknown",
]);

export interface OpenQuestionRowCardProps {
  row: OpenQuestionRow;
  /** Resolved display text (client_question fallback already applied). */
  questionText: string;
  /**
   * Honesty hint for dismissed rows whose underlying question still needs an
   * answer or a confirmed unknown for the final memo (dismissing never moves
   * the gate). See dismissedGateHint in grouping.ts.
   */
  gateHint?: string | null;
  /** Full-width actions slot under the row content (buttons + inputs). */
  actions?: ReactNode;
}

/**
 * Presentational card for one open-question register row. All mutations
 * arrive through the actions slot.
 */
export function OpenQuestionRowCard({
  row,
  questionText,
  gateHint,
  actions,
}: OpenQuestionRowCardProps) {
  const statusLabel = STATUS_LABELS[row.status] ?? row.status;
  const statusVariant = COMPLETE_STATUSES.has(row.status)
    ? "complete"
    : "neutral";
  const isReopened = row.source === "reopen";

  return (
    <div className="rounded-ds-card border border-ds-hairline bg-ds-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={statusVariant}>{statusLabel}</StatusPill>
            {isReopened && (
              <StatusPill status="neutral">Needs attention</StatusPill>
            )}
          </div>

          {gateHint && (
            <p className="text-[13px] text-ds-ink-secondary">{gateHint}</p>
          )}

          <p className="text-[13px] font-normal leading-snug text-ds-ink">
            {questionText}
          </p>

          {isReopened && row.reopen_reason && (
            <p className="text-[13px] text-ds-ink-secondary">{row.reopen_reason}</p>
          )}

          {row.why_it_matters && (
            <p className="text-[13px] text-ds-ink-secondary">
              {row.why_it_matters}
            </p>
          )}

          {row.client_answer && (
            <div className="rounded-ds-control border border-ds-hairline bg-ds-fill-muted px-3 py-2">
              <p className="text-[13px] font-normal text-ds-ink-secondary ds-tabular-nums">
                Client said on {formatDate(row.client_answer_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-ds-ink">
                {row.client_answer}
              </p>
            </div>
          )}

          {row.status === "taken_to_client" && row.taken_to_client_at && (
            <p className="text-[13px] text-ds-ink-secondary ds-tabular-nums">
              Sent to client on {formatDate(row.taken_to_client_at)}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="mt-3">{actions}</div>}
    </div>
  );
}
