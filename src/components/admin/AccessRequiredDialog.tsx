import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export interface AccessRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel?: string;
}

export function AccessRequiredDialog({
  open, onOpenChange, actionLabel = "perform this action",
}: AccessRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>Admin access required</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            To {actionLabel} you need full admin access. Please contact the admin in person.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
