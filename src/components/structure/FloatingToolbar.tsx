import { Button } from '@/components/ui/button';

interface Props {
  isExtracting: boolean;
  busy?: boolean;
  /** True while non-relevant entities are hidden (the default). */
  hideNonRelevant: boolean;
  /** How many non-relevant entities are currently folded away. */
  nonRelevantCount: number;
  /** Re-hide the non-relevant entities (the "Show all" affordance lives in the
   *  top-right chip on the canvas). */
  onCollapseNonRelevant: () => void;
  orphanCount: number;
  orphansVisible: boolean;
  onToggleOrphans: () => void;
  onAutoArrange: () => void;
  selectedEntityIds: string[];
  onCreateFiscalUnity: () => void;
  hiddenInAppendixCount?: number;
}

export function FloatingToolbar({
  isExtracting,
  busy,
  hideNonRelevant,
  nonRelevantCount,
  onCollapseNonRelevant,
  orphanCount,
  orphansVisible,
  onToggleOrphans,
  onAutoArrange,
  selectedEntityIds,
  onCreateFiscalUnity,
  hiddenInAppendixCount,
}: Props) {
  const canCreateFiscalUnity = selectedEntityIds.length >= 2;
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-ds-card border border-ds-hairline rounded-sm shadow-md px-3 py-2 flex items-center gap-3 text-sm"
      data-snapshot-exclude="true"
    >
      {isExtracting && (
        <span
          className="text-xs text-ds-ink-secondary inline-flex items-center gap-2 px-2 py-1 whitespace-nowrap"
          aria-live="polite"
        >
          <span className="h-2 w-2 rounded-full bg-ds-ink-tertiary animate-pulse" aria-hidden />
          Refining structure…
        </span>
      )}
      {!hideNonRelevant && nonRelevantCount > 0 && (
        <button
          type="button"
          onClick={onCollapseNonRelevant}
          className="text-xs text-ds-ink-secondary hover:text-ds-ink px-2 py-1 rounded hover:bg-ds-fill-muted whitespace-nowrap"
        >
          Collapse non-relevant
        </button>
      )}
      {orphanCount > 0 && (
        <button
          type="button"
          onClick={onToggleOrphans}
          className="text-xs text-ds-ink-secondary hover:text-ds-ink px-2 py-1 rounded hover:bg-ds-fill-muted whitespace-nowrap"
        >
          {orphanCount} disconnected · {orphansVisible ? 'Hide' : 'Show'}
        </button>
      )}
      {hiddenInAppendixCount ? (
        <span className="text-[11px] text-ds-ink-secondary px-1">
          {hiddenInAppendixCount} hidden in appendix
        </span>
      ) : null}
      {canCreateFiscalUnity && (
        <Button size="sm" variant="outline" onClick={onCreateFiscalUnity} disabled={busy || isExtracting}>
          Create fiscal unity ({selectedEntityIds.length})
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onAutoArrange} disabled={busy || isExtracting}>
        Auto-arrange
      </Button>
    </div>
  );
}
