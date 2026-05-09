import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  onAutoLayout: () => void;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
  status?: string;
}

export function StructureToolbar({ onAutoLayout, onReExtract, onExportPptx, busy, status }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-white">
      <Button size="sm" variant="outline" onClick={onAutoLayout} disabled={busy}>
        Auto-layout
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>Re-extract</Button>
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

      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy}>
        Export PPTX
      </Button>

      <div className="ml-auto text-xs text-neutral-500">
        {status}
      </div>
    </div>
  );
}
