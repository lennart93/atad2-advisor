import { useState } from "react";
import { CheckSquare, ChevronRight, Copy, Square } from "lucide-react";
import { Button, Card, StatusPill } from "@/components/ds";
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
  type OpenPoint,
  type PointsCopyMeta,
} from "@/lib/openQuestions/worklist";
import { OpenPointRow } from "./OpenPointRow";

export interface WorklistPointsListProps {
  worklist: DocumentsWorklist;
  /**
   * Intro card above the list. Shown on the documents step; omitted in the
   * questionnaire side panel, where that line no longer makes sense.
   */
  showIntro?: boolean;
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
  showIntro = true,
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
  const allResolved = worklist.openPoints === 0;
  const checkedPoints = allPoints.filter(isSelected);
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
    <div className="space-y-6">
      {showIntro && (
        <Card className="p-5">
          <p className="max-w-prose text-[13px] text-ds-ink">
            {allResolved
              ? "Everything was answered from your documents. No points are left to confirm."
              : "Most of the questionnaire was answered from your documents. These points still need a quick confirmation."}
          </p>
        </Card>
      )}

      {/* Sticky actions: copy the selected points for the client, copy all of
          them, and select / deselect which go into the client copy. */}
      <div className="sticky top-0 z-10 -mt-2 flex flex-wrap items-center gap-2 rounded-ds-card border border-ds-hairline bg-ds-card px-3 py-2">
        <CopyForClientButton points={checkedPoints} />
        <CopyPointsButton
          label="Copy all points"
          variant="ghost"
          points={allPoints}
          meta={meta}
        />
        {pathPoints.length > 1 && (
          <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
            {anyPathSelected ? <Square /> : <CheckSquare />}
            {anyPathSelected ? "Deselect all" : "Select all"}
          </Button>
        )}
        {worklist.totalPathPoints > 0 && (
          <span className="ml-auto text-[13px] text-ds-ink-secondary ds-tabular-nums">
            {worklist.resolvedPoints} of {worklist.totalPathPoints} answered
          </span>
        )}
      </div>

      {pathPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-ds-ink">
              Could you please confirm:
            </h3>
            <StatusPill status="neutral" className="ds-tabular-nums">
              {pathPoints.length}
            </StatusPill>
          </div>
          {pathPoints.map((point) => (
            <OpenPointRow key={point.id} {...rowProps(point)} />
          ))}
        </div>
      )}

      {offPathPoints.length > 0 && (
        <Collapsible className="rounded-ds-card border border-ds-hairline bg-ds-card">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-ds-ink-secondary transition-colors hover:text-ds-ink">
            <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span>Other possible points</span>
            <StatusPill status="neutral" className="ds-tabular-nums">
              {offPathPoints.length}
            </StatusPill>
            <span className="ml-auto text-ds-ink-secondary">
              unlikely to be relevant here
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="space-y-2 border-t border-ds-hairline p-3">
              <p className="text-[13px] text-ds-ink-secondary">
                Not expected on the current path. You can still answer or
                include any of them.
              </p>
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

/**
 * Copy the selected points as a client-ready message in one click: a short
 * lead-in plus the numbered checked points, ready to paste into an email.
 * Disabled when nothing is selected.
 */
function CopyForClientButton({ points }: { points: OpenPoint[] }) {
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
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled}
      title={disabled ? "Tick at least one point to copy." : undefined}
      onClick={() => void copy()}
    >
      <Copy />
      Copy points for client
      {points.length > 0 && (
        <span className="ds-tabular-nums text-ds-ink-secondary">
          ({points.length})
        </span>
      )}
    </Button>
  );
}

/** Copy a set of points as text, offering a plain list or an email-ready one. */
function CopyPointsButton({
  label,
  points,
  meta,
  variant = "secondary",
  emptyHint,
}: {
  label: string;
  points: OpenPoint[];
  meta: PointsCopyMeta;
  variant?: "secondary" | "ghost";
  emptyHint?: string;
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
        <Button
          variant={variant}
          size="sm"
          disabled={disabled}
          title={disabled ? emptyHint : undefined}
        >
          <Copy />
          {label}
          {points.length > 0 && (
            <span className="ds-tabular-nums text-ds-ink-secondary">
              ({points.length})
            </span>
          )}
        </Button>
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
