import { Button } from '@/components/ui/button';

interface Props {
  isExtracting: boolean;
  onExportPptx: () => void;
  busy?: boolean;
  expandedClusterCount: number;
  onCollapseAll: () => void;
  orphanCount: number;
  orphansVisible: boolean;
  onToggleOrphans: () => void;
  onAutoArrange: () => void;
  selectedEntityIds: string[];
  onCreateFiscalUnity: () => void;
}

export function FloatingToolbar({
  isExtracting,
  onExportPptx,
  busy,
  expandedClusterCount,
  onCollapseAll,
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
      {expandedClusterCount > 0 && (
        <button
          type="button"
          onClick={onCollapseAll}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent whitespace-nowrap"
        >
          {expandedClusterCount} expanded · Collapse
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
          Maak fiscale eenheid ({selectedEntityIds.length})
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy || isExtracting}>
        Export PPTX
      </Button>
      <Button size="sm" variant="outline" onClick={onAutoArrange} disabled={busy || isExtracting}>
        Auto-arrange
      </Button>
    </div>
  );
}
