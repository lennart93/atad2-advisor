import { useRef } from "react";
import { usePrefillStore, type PendingFile } from "@/stores/prefillStore";
import { useUploadDocument, useSessionDocuments } from "@/hooks/usePrefill";
import {
  ACCEPTED_MIME_TYPES, MAX_FILE_BYTES, MAX_SESSION_BYTES, DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/prefill/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Trash2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  sessionId: string;
  locked: boolean;
}

export function DocumentUploader({ sessionId, locked }: Props) {
  const store = usePrefillStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument(sessionId);
  const { data: uploadedDocs } = useSessionDocuments(sessionId);

  const onFilesSelected = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(f.type)) {
        rejected.push(`${f.name} — unsupported format`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} — exceeds 32 MB`);
        continue;
      }
      accepted.push(f);
    }
    const existingBytes = (uploadedDocs ?? []).reduce((a, d) => a + d.size_bytes, 0);
    const pendingBytes = store.totalBytes();
    const newBytes = accepted.reduce((a, f) => a + f.size, 0);
    if (existingBytes + pendingBytes + newBytes > MAX_SESSION_BYTES) {
      toast({ title: "Total upload limit reached", description: "Session limit is 200 MB.", variant: "destructive" });
      return;
    }
    if (rejected.length > 0) {
      toast({ title: "Some files were skipped", description: rejected.join("\n"), variant: "destructive" });
    }
    store.addFiles(accepted);
  };

  const kickUpload = (pending: PendingFile) => {
    if (!pending.category) return;
    store.setStatus(pending.localId, "uploading");
    upload.mutate({ pending }, {
      onSuccess: (doc) => store.setStatus(pending.localId, "uploaded", { remoteDocumentId: doc?.id }),
      onError: (err) => store.setStatus(pending.localId, "failed", { errorMessage: (err as Error).message }),
    });
  };

  return (
    <div className="space-y-4">
      {!locked && (
        <div
          onDrop={(e) => { e.preventDefault(); onFilesSelected(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed rounded-lg p-8 text-center"
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-3">Drag files here or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(e) => onFilesSelected(e.target.files)}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>Upload files</Button>
        </div>
      )}

      <div className="space-y-2">
        {store.pendingFiles.map((p) => (
          <Card key={p.localId} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{p.file.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(p.file.size)} · {labelForStatus(p)}
              </div>
              {p.errorMessage && <div className="text-xs text-destructive">{p.errorMessage}</div>}
            </div>

            <Select
              value={p.category ?? undefined}
              onValueChange={(v) => {
                const cat = v as DocumentCategory;
                store.setCategory(p.localId, cat);
                if (p.status === "queued") kickUpload({ ...p, category: cat });
              }}
              disabled={locked || p.status === "uploading" || p.status === "uploaded"}
            >
              <SelectTrigger className="w-56"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={p.docLabel}
              onChange={(e) => store.setDocLabel(p.localId, e.target.value)}
              className="w-48"
              disabled={locked || p.status === "uploaded"}
              placeholder="Label"
            />

            {!locked && (
              <Button variant="ghost" size="icon" onClick={() => store.removeFile(p.localId)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function labelForStatus(p: PendingFile): string {
  switch (p.status) {
    case "queued": return "Waiting for category";
    case "uploading": return "Uploading...";
    case "uploaded": return "Uploaded — ready for extraction";
    case "failed": return "Failed";
  }
}
