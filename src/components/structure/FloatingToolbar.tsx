import { Button } from '@/components/ui/button';

interface Props {
  isExtracting: boolean;
  busy?: boolean;
  collapsedClusterCount: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
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
  collapsedClusterCount,
  onCollapseAll,
  onExpandAll,
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
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-ds-card border border-ds-hairline rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm"
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
      {collapsedClusterCount > 0 ? (
        <button
          type="button"
          onClick={onExpandAll}
          className="text-xs text-ds-ink-secondary hover:text-ds-ink px-2 py-1 rounded hover:bg-ds-fill-muted whitespace-nowrap"
        >
          {collapsedClusterCount} collapsed · Expand
        </button>
      ) : (
        <button
          type="button"
          onClick={onCollapseAll}
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
