import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

const MIN_REASON_LENGTH = 5;

export interface KeepAsUnknownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the trimmed reason; the dialog closes itself. */
  onConfirm: (reason: string) => void;
}

/**
 * Confirmation dialog for "Keep as unknown". The short reason is required:
 * it becomes the confirmation note on the answer (on-path) or the
 * resolution note on the register row (off-path), and lands in the audit
 * trail either way.
 */
export function KeepAsUnknownDialog({
  open,
  onOpenChange,
  onConfirm,
}: KeepAsUnknownDialogProps) {
  const [reason, setReason] = useState("");

  // Fresh textarea every time the dialog opens.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const canConfirm = trimmed.length >= MIN_REASON_LENGTH;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Keep as unknown</AlertDialogTitle>
          <AlertDialogDescription>
            Record why this stays unknown. This note appears in the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: client confirmed the information is not available."
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => onConfirm(trimmed)}
          >
            Keep as unknown
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
