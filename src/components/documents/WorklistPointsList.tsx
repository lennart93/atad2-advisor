import { useState } from "react";
import { CheckSquare, ChevronRight, Copy, Square } from "lucide-react";
import { Button, StatusPill } from "@/components/ds";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import type { DocumentsWorklist } from "@/hooks/useDocumentsWorklist";
import {
  formatClientMessage,
  formatPointsList,
  pointsLeadIn,
  type OpenPoint,
  type PointsCopyMeta,
} from "@/lib/openQuestions/worklist";
import { cn } from "@/lib/utils";
import { OpenPointRow } from "./OpenPointRow";

export interface WorklistPointsListProps {
  worklist: DocumentsWorklist;
  /** Progress-counter verb: "confirmed" on the documents step, "answered" in
   *  the questionnaire's open-questions side panel. */
  confirmVerb?: "confirmed" | "answered";
}

/**
 * The merged "Points to confirm" list: a few client-ready questions the
 * documents could not answer, each resolved with a short free-text note that
 * the AI turns into the questionnaire answer. The decision-tree mapping and the
 * per-row open-question actions are never surfaced here, only the questions.
 *
 * Shared by the documents step (DocumentsWorklist) and the questionnaire's
 * "Open questions" side panel, so both show exactly the same thing.
 */
export function WorklistPointsList({
  worklist,
  confirmVerb = "confirmed",
}: WorklistPointsListProps) {
  const { pathPoints, offPathPoints } = worklist;

  // Which points go into the client copy. The default is derived, not stored:
  // the main-list points (the ones most likely relevant to this questionnaire)
  // start ticked so "Copy points for client" yields the relevant list straight
  // away; the off-path extras start unticked. `selectOverrides` records only the
  // advisor's explicit ticks/unticks on top of that default. So an unticked
  // point stays unticked, and a point that moves between the two lists follows
  // the default for its new group until the advisor decides otherwise. This
  // selection feeds the client copy only; it is independent of the
  // "X of N answered" progress counter.
  const pathIds = new Set(pathPoints.map((point) => point.id));
  const [selectOverrides, setSelectOverrides] = useState<Map<string, boolean>>(
    () => new Map(),
  );

  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>(
    {},
  );

  const resolved = (point: OpenPoint) =>
    point.status === "answered" || point.status === "answered_by_client";
  const isExpanded = (point: OpenPoint) =>
    // Keep the point being worked out open so its "Working it out..." state
    // stays visible through the realtime refetch that fires mid-analyze;
    // otherwise open points start expanded and answered ones collapsed.
    worklist.savingPointIds.has(point.id) ||
    (expandOverrides[point.id] ?? !resolved(point));
  const toggle = (point: OpenPoint) =>
    setExpandOverrides((prev) => ({
      ...prev,
      [point.id]: !(prev[point.id] ?? !resolved(point)),
    }));

  // Explicit choice wins; otherwise fall back to the default (main list ticked).
  const isSelected = (point: OpenPoint) =>
    selectOverrides.get(point.id) ?? pathIds.has(point.id);
  const setSelected = (point: OpenPoint, checked: boolean) =>
    setSelectOverrides((prev) => new Map(prev).set(point.id, checked));

  const rowProps = (point: OpenPoint) => ({
    point,
    expanded: isExpanded(point),
    onToggle: () => toggle(point),
    selected: isSelected(point),
    onSelectChange: (checked: boolean) => setSelected(point, checked),
    saving: worklist.savingPointIds.has(point.id),
    onSaveContext: (context: string) => worklist.saveContext(point, context),
  });

  const allPoints = [...pathPoints, ...offPathPoints];
  const checkedPoints = allPoints.filter(isSelected);

  // The collective stem the questions complete ("Could you please confirm: for
  // each of ..."). Each point's text is a direct clause, so without the stem
  // the list reads as bare fragments. Computed per list because a legacy set
  // whose questions carry their own polite opener returns null (no stem).
  const pathLeadIn = pointsLeadIn(pathPoints);
  const offPathLeadIn = pointsLeadIn(offPathPoints);
  const meta: PointsCopyMeta = {
    taxpayerName: worklist.taxpayerName || "Taxpayer",
    fiscalYear: worklist.fiscalYear || "",
  };

  // The bulk toggle drives the client list only: the "Could you please confirm"
  // points (pathPoints). The off-path "Other possible points" are extras the
  // advisor pulls in one at a time, so "Select all" must never sweep all of them
  // into the client copy (that would push it from the relevant few up to every
  // point). Toggling clears or ticks every path point and leaves any manual
  // off-path ticks untouched, writing explicit choices so the result sticks
  // across re-renders.
  const anyPathSelected = pathPoints.some(isSelected);
  const toggleSelectAll = () =>
    setSelectOverrides((prev) => {
      const value = !anyPathSelected;
      const next = new Map(prev);
      for (const point of pathPoints) next.set(point.id, value);
      return next;
    });

  return (
    <div className="space-y-7">
      {/* Two copy actions as labeled cards: the client card copies the ticked
          (likely-relevant) points; the all-points card opens a plain/email
          choice. Counts are live (path vs all), never fixed numbers. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <CopyForClientCard points={checkedPoints} />
        <CopyAllPointsCard points={allPoints} meta={meta} />
      </div>

      {/* Thin toolbar: bulk select for the client copy, a live progress
          counter, and a segment-per-point meter that fills as each likely
          point is answered. */}
      {(pathPoints.length > 1 || worklist.totalPathPoints > 0) && (
        <div className="space-y-3 border-y border-ds-hairline py-3">
          <div className="flex items-center gap-3">
            {pathPoints.length > 1 && (
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                {anyPathSelected ? <Square /> : <CheckSquare />}
                {anyPathSelected ? "Deselect all" : "Select all"}
              </Button>
            )}
            {worklist.totalPathPoints > 0 && (
              <span className="ml-auto text-[13px] text-ds-ink-secondary ds-tabular-nums">
                {/* Confirmed reads sage once any point is done, keeping it
                    visually separate from the terracotta/slate categories. */}
                <span
                  className={cn(
                    "font-medium",
                    worklist.resolvedPoints > 0
                      ? "text-brand-sage-deep"
                      : "text-ds-ink",
                  )}
                >
                  {worklist.resolvedPoints}
                </span>{" "}
                of {worklist.totalPathPoints} {confirmVerb}
              </span>
            )}
          </div>
          {pathPoints.length > 0 && (
            <div className="flex gap-1" aria-hidden="true">
              {pathPoints.map((point) => (
                <span
                  key={point.id}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    resolved(point) ? "bg-brand-sage" : "bg-ds-fill-muted",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {pathPoints.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-terracotta" aria-hidden="true" />
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-ds-ink-secondary">
              Likely relevant
            </h3>
            <span className="text-xs font-normal text-brand-terracotta-deep ds-tabular-nums">
              {pathPoints.length} {pathPoints.length === 1 ? "point" : "points"}
            </span>
          </div>
          {pathLeadIn && (
            <p className="mt-3 text-[13px] text-ds-ink">{pathLeadIn}</p>
          )}
          <div className="mt-3 border-t border-ds-hairline">
            {pathPoints.map((point) => (
              <OpenPointRow key={point.id} {...rowProps(point)} />
            ))}
          </div>
        </div>
      )}

      {offPathPoints.length > 0 && (
        <Collapsible className="border-t border-ds-hairline">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 py-4 text-left text-[11px] font-medium uppercase tracking-wide text-ds-ink-secondary transition-colors hover:text-ds-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-info" aria-hidden="true" />
            <span>Contingent</span>
            <span className="text-xs font-normal normal-case tracking-normal text-brand-info-deep ds-tabular-nums">
              {offPathPoints.length} {offPathPoints.length === 1 ? "point" : "points"}
            </span>
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <p className="max-w-prose pb-3 text-[13px] text-ds-ink-secondary">
              These only matter if your answers to the questionnaire turn out
              different than expected, for example because of the points above.
              They are included when you copy all points.
            </p>
            {offPathLeadIn && (
              <p className="pb-3 text-[13px] text-ds-ink">{offPathLeadIn}</p>
            )}
            <div className="border-t border-ds-hairline">
              {offPathPoints.map((point) => (
                <OpenPointRow key={point.id} {...rowProps(point)} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Shared chrome for the two copy cards: a hairline panel that reads as a
 *  quiet action, dimmed and non-interactive when there is nothing to copy. */
const COPY_CARD_CLASS =
  "group flex flex-1 items-start gap-3 rounded-ds-card border border-ds-hairline bg-ds-card p-4 text-left transition-colors hover:border-ds-ink-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent disabled:pointer-events-none disabled:opacity-60";

/**
 * Copy the selected points as a client-ready message in one click: a short
 * lead-in plus the numbered checked points, ready to paste into an email.
 * Disabled when nothing is selected.
 */
function CopyForClientCard({ points }: { points: OpenPoint[] }) {
  const disabled = points.length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatClientMessage(points));
      toast.success(
        points.length === 1 ? "Copied 1 point." : `Copied ${points.length} points.`,
      );
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Tick at least one point to copy." : undefined}
      onClick={() => void copy()}
      className={cn(COPY_CARD_CLASS, "border-t-2 border-t-brand-terracotta")}
    >
      <Copy className="mt-0.5 h-4 w-4 shrink-0 text-brand-terracotta" />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ds-ink">Copy points for client</span>
          <StatusPill
            status="neutral"
            className="ds-tabular-nums bg-brand-terracotta-soft text-brand-terracotta-deep"
          >
            {points.length}
          </StatusPill>
        </span>
        <span className="mt-1 block text-[13px] text-ds-ink-secondary">
          The likely-relevant points, ready to send to your client.
        </span>
      </span>
    </button>
  );
}

/** Copy every point as text, offering a plain list or an email-ready one. */
function CopyAllPointsCard({
  points,
  meta,
}: {
  points: OpenPoint[];
  meta: PointsCopyMeta;
}) {
  const [open, setOpen] = useState(false);
  const disabled = points.length === 0;

  const copy = async (withIntro: boolean) => {
    try {
      await navigator.clipboard.writeText(formatPointsList(points, meta, withIntro));
      toast.success(
        points.length === 1 ? "Copied 1 point." : `Copied ${points.length} points.`,
      );
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(COPY_CARD_CLASS, "border-t-2 border-t-brand-info")}
        >
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-brand-info" />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-ds-ink">Copy all points</span>
              <StatusPill
                status="neutral"
                className="ds-tabular-nums bg-brand-info-soft text-brand-info-deep"
              >
                {points.length}
              </StatusPill>
            </span>
            <span className="mt-1 block text-[13px] text-ds-ink-secondary">
              Everything, including the points that sit off the likely path.
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-1 pb-1.5 text-xs text-ds-ink-secondary">Copy as</p>
        <button
          type="button"
          onClick={() => void copy(false)}
          className="block w-full rounded-ds-control px-2 py-1.5 text-left text-[13px] text-ds-ink hover:bg-ds-fill-muted"
        >
          Plain numbered list
        </button>
        <button
          type="button"
          onClick={() => void copy(true)}
          className="block w-full rounded-ds-control px-2 py-1.5 text-left text-[13px] text-ds-ink hover:bg-ds-fill-muted"
        >
          Email-ready (intro + list)
        </button>
      </PopoverContent>
    </Popover>
  );
}
