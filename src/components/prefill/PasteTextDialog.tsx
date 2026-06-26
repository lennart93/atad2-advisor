import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ds";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUploadText } from "@/hooks/usePrefill";
import { toast } from "@/hooks/use-toast";
import { formatDateTime } from "@/utils/formatDate";

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PasteTextDialog({ sessionId, open, onOpenChange }: Props) {
  const [text, setText] = useState("");
  const upload = useUploadText(sessionId);

  const reset = () => {
    setText("");
  };

  const save = () => {
    if (!text.trim()) return;
    const finalLabel = `Pasted text (${formatDateTime(new Date())})`;
    upload.mutate(
      { text: text.trim(), category: "other", label: finalLabel },
      {
        onSuccess: () => {
          toast({ title: "Text added", description: `Saved as "${finalLabel}"` });
          reset();
          onOpenChange(false);
        },
        onError: (e) => {
          toast({ title: "Could not save text", description: String(e), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste additional context</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="paste-text" className="text-[13px]">Text</Label>
            <Textarea
              id="paste-text"
              rows={15}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste relevant context, for example a memo excerpt or structural notes."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!text.trim() || upload.isPending}
            onClick={save}
          >
            {upload.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
