import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/prefill/types";
import { useUploadText } from "@/hooks/usePrefill";
import { toast } from "@/hooks/use-toast";

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PasteTextDialog({ sessionId, open, onOpenChange }: Props) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [label, setLabel] = useState("");
  const [relevanceNote, setRelevanceNote] = useState("");
  const upload = useUploadText(sessionId);

  const reset = () => {
    setText("");
    setCategory("");
    setLabel("");
    setRelevanceNote("");
  };

  const save = () => {
    if (!text.trim() || !category) return;
    const finalLabel = label.trim() || `Pasted text — ${new Date().toLocaleString()}`;
    upload.mutate(
      { text: text.trim(), category, label: finalLabel, relevanceNote: relevanceNote.trim() || undefined },
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
            <Label htmlFor="paste-text">Text</Label>
            <Textarea
              id="paste-text"
              rows={15}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste any relevant context here — e.g. excerpts from a memo, email thread, or structural notes. The AI will treat this like any uploaded document."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="paste-label">Label (optional)</Label>
              <Input
                id="paste-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Pasted text"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="paste-relevance">Why is this relevant? (optional)</Label>
            <Input
              id="paste-relevance"
              value={relevanceNote}
              onChange={(e) => setRelevanceNote(e.target.value)}
              placeholder="Short note that helps the AI focus on the right facts"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!text.trim() || !category || upload.isPending} onClick={save}>
            {upload.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
