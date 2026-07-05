import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ds";
import { Textarea } from "@/components/ui/textarea";
import { useUploadText } from "@/hooks/usePrefill";
import { toast } from "@/components/ui/app-toast";
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
          toast.success("Text added", { description: `Saved as "${finalLabel}"` });
          reset();
          onOpenChange(false);
        },
        onError: (e) => {
          toast.error("Could not save text", { description: String(e) });
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
      <DialogContent className="max-w-2xl rounded-sm border-t-[3px] border-t-brand-terracotta bg-card">
        <DialogHeader>
          <DialogTitle className="font-normal">Paste additional context</DialogTitle>
          <DialogDescription>
            Memo excerpts, structural notes, or anything not in the uploaded files.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label
            htmlFor="paste-text"
            className="block text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground"
          >
            Text
          </label>
          <Textarea
            id="paste-text"
            className="min-h-[230px] focus-visible:border-brand-terracotta focus-visible:ring-brand-terracotta-soft focus-visible:ring-offset-0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste relevant context here. For example a memo excerpt, a summary of the structure, or notes that are not in the documents."
          />
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">Plain text. Read alongside your uploads.</span>
            <span className="text-muted-foreground">{text.length} characters</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!text.trim() || upload.isPending}
            onClick={save}
          >
            {upload.isPending ? "Saving..." : "Save context"}
            {!upload.isPending && <Check className="text-brand-terracotta" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
