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
  onAutoLayout: () => void;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
}

const EXTRACTING_PREFIX = 'extracting:';

export function FloatingToolbar({
  status,
  entityCount,
  ownershipCount,
  transactionCount,
  onAutoLayout,
  onReExtract,
  onExportPptx,
  busy,
}: Props) {
  const isExtracting = status.startsWith(EXTRACTING_PREFIX);
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm">
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isExtracting
            ? 'bg-amber-50 text-amber-700 animate-pulse'
            : status === 'extraction_failed'
            ? 'bg-red-50 text-red-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}
      >
        {status || 'idle'}
      </span>
      <span className="text-xs text-neutral-500 whitespace-nowrap">
        {entityCount} entities · {ownershipCount} ownership · {transactionCount} transactions
      </span>
      <div className="w-px h-5 bg-neutral-200" />
      <Button size="sm" variant="outline" onClick={onAutoLayout} disabled={busy || isExtracting}>
        Auto-layout
      </Button>
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
    </div>
  );
}
