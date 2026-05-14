import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  status: string;
  entityCount: number;
  ownershipCount: number;
  transactionCount: number;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
  focusedCount: number;
  onClearFocus: () => void;
  expandedClusterCount: number;
  onCollapseAll: () => void;
  orphanCount: number;
  orphansVisible: boolean;
  onToggleOrphans: () => void;
  onAutoArrange: () => void;
  onResetAllRouting: () => void;
  gridVisible: boolean;
  onToggleGrid: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
}

const EXTRACTING_PREFIX = 'extracting:';

export function FloatingToolbar({
  status,
  entityCount,
  ownershipCount,
  transactionCount,
  onReExtract,
  onExportPptx,
  busy,
  focusedCount,
  onClearFocus,
  expandedClusterCount,
  onCollapseAll,
  orphanCount,
  orphansVisible,
  onToggleOrphans,
  onAutoArrange,
  onResetAllRouting,
  gridVisible,
  onToggleGrid,
  snapEnabled,
  onToggleSnap,
}: Props) {
  const isExtracting = status.startsWith(EXTRACTING_PREFIX);
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-card border border-[hsl(var(--border-subtle))] rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm"
      data-snapshot-exclude="true"
    >
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isExtracting
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 animate-pulse'
            : status === 'extraction_failed'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400'
            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
        }`}
      >
        {status || 'idle'}
      </span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {entityCount} entities · {ownershipCount} ownership · {transactionCount} transactions
      </span>
      <div className="w-px h-5 bg-[hsl(var(--border-subtle))]" />
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
      {focusedCount > 0 && (
        <Button size="sm" variant="outline" onClick={onClearFocus}>
          Clear focus ({focusedCount})
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || isExtracting}>
            Re-extract
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-extract from inputs?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites AI-suggested entities and edges. Your manual edits and additions are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReExtract}>Re-extract</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy || isExtracting}>
        Export PPTX
      </Button>
      <Button size="sm" variant="outline" onClick={onAutoArrange} disabled={busy || isExtracting}>
        Auto-arrange
      </Button>
      <Button size="sm" variant="outline" onClick={onResetAllRouting} disabled={busy || isExtracting}>
        Reset all routing
      </Button>
      <Button
        size="sm"
        variant={gridVisible ? 'default' : 'outline'}
        onClick={onToggleGrid}
        disabled={busy || isExtracting}
      >
        Grid
      </Button>
      <Button
        size="sm"
        variant={snapEnabled ? 'default' : 'outline'}
        onClick={onToggleSnap}
        disabled={busy || isExtracting}
      >
        Snap
      </Button>
    </div>
  );
}
