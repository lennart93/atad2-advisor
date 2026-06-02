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
}: Props) {
  const canCreateFiscalUnity = selectedEntityIds.length >= 2;
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-card border border-[hsl(var(--border-subtle))] rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm"
      data-snapshot-exclude="true"
    >
      {isExtracting && (
        <span
          className="text-xs text-muted-foreground inline-flex items-center gap-2 px-2 py-1 whitespace-nowrap"
          aria-live="polite"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          Refining structure…
        </span>
      )}
      {collapsedClusterCount > 0 ? (
        <button
          type="button"
          onClick={onExpandAll}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent whitespace-nowrap"
        >
          {collapsedClusterCount} collapsed · Expand
        </button>
      ) : (
        <button
          type="button"
          onClick={onCollapseAll}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent whitespace-nowrap"
        >
          Collapse non-relevant
        </button>
      )}
      {orphanCount > 0 && (
        <button
          type="button"
          onClick={onToggleOrphans}
          className="text-xs text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 whitespace-nowrap"
        >
          {orphanCount} disconnected · {orphansVisible ? 'Hide' : 'Show'}
        </button>
      )}
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
