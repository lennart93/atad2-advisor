import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSessionDocuments, useCleanupDocuments } from "@/hooks/usePrefill";
import { DOCUMENT_CATEGORIES } from "@/lib/prefill/types";

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UploadedDocumentsModal({ sessionId, open, onOpenChange }: Props) {
  const { data: docs } = useSessionDocuments(sessionId);
  const cleanup = useCleanupDocuments(sessionId);

  const label = (cat: string) => DOCUMENT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Uploaded documents</DialogTitle></DialogHeader>
        <ul className="space-y-2 text-sm">
          {(docs ?? []).length === 0 && <li className="text-muted-foreground">No documents uploaded.</li>}
          {docs?.map((d) => (
            <li key={d.id} className="flex justify-between items-center">
              <div>
                <div className="font-medium">{d.doc_label}</div>
                <div className="text-xs text-muted-foreground">{label(d.category)}</div>
              </div>
              <span className="text-xs">{d.status}</span>
            </li>
          ))}
        </ul>
        {(docs?.length ?? 0) > 0 && (
          <Button
            variant="destructive"
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            Delete all documents
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
