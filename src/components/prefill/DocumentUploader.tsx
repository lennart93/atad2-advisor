import { useEffect, useRef, useState } from "react";
import { usePrefillStore, type PendingFile } from "@/stores/prefillStore";
import { useUploadDocument, useSessionDocuments, useClassifyDocument, useUpdateDocumentCategory, useDeleteDocument } from "@/hooks/usePrefill";
import {
  FILE_INPUT_ACCEPT, MAX_FILE_BYTES, MAX_SESSION_BYTES, isAcceptedUpload,
} from "@/lib/prefill/types";
import type { DocumentCategory } from "@/lib/prefill/types";
import { CategoryDropdown } from "./CategoryDropdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, Upload, ClipboardPaste } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PasteTextDialog } from "./PasteTextDialog";
import { maybePrewarmPhaseA } from "@/lib/structure/phaseAPrewarm";

interface Props {
  sessionId: string;
  locked: boolean;
}

export function DocumentUploader({ sessionId, locked }: Props) {
  const store = usePrefillStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const upload = useUploadDocument(sessionId);
  const classify = useClassifyDocument(sessionId);
  const updateCategory = useUpdateDocumentCategory(sessionId);
  const deleteDocument = useDeleteDocument(sessionId);
  const { data: uploadedDocs } = useSessionDocuments(sessionId);

  const onFilesSelected = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!isAcceptedUpload(f)) {
        rejected.push(`${f.name}: unsupported format`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name}: exceeds 15 MB`);
        continue;
      }
      accepted.push(f);
    }
    const existingBytes = (uploadedDocs ?? []).reduce((a, d) => a + d.size_bytes, 0);
    const pendingBytes = store.totalBytes();
    const newBytes = accepted.reduce((a, f) => a + f.size, 0);
    if (existingBytes + pendingBytes + newBytes > MAX_SESSION_BYTES) {
      toast({ title: "Total upload limit reached", description: "Session limit is 100 MB.", variant: "destructive" });
      return;
    }
    if (rejected.length > 0) {
      toast({ title: "Some files were skipped", description: rejected.join("\n"), variant: "destructive" });
    }
    store.addFiles(accepted);
  };

  useEffect(() => {
    if (locked) return;
    for (const p of store.pendingFiles) {
      if (p.status !== "queued") continue;
      store.setStatus(p.localId, "uploading");
      // mutateAsync (not mutate + callbacks): one shared mutation hook serves
      // every file, and react-query keeps only the LAST mutate() call's
      // onSuccess/onError. Dropping two files at once would overwrite the first
      // file's onSuccess, leaving its card stuck on "Uploading…" and the
      // server-side card un-deduped (a phantom third card). The promise
      // returned by mutateAsync is scoped to this exact call, so concurrent
      // uploads each resolve to their own result.
      upload
        .mutateAsync({ pending: p })
        .then((doc) => {
          store.setStatus(p.localId, "uploaded", { remoteDocumentId: doc?.id });
          if (doc?.id) {
            classify.mutate({ documentId: doc.id });
          }
          // Start Phase A extraction in the background as soon as a document
          // lands. maybePrewarmPhaseA is fingerprint-guarded so it is a
          // no-op if the same doc set was already extracted.
          maybePrewarmPhaseA(sessionId).catch(() => {});
        })
        .catch((err) => store.setStatus(p.localId, "failed", { errorMessage: (err as Error).message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.pendingFiles, locked]);

  return (
    <div className="space-y-4">
      {!locked && (
        <>
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
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>Upload files</Button>
              <span className="text-xs text-muted-foreground">or</span>
              <Button variant="outline" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste className="h-4 w-4 mr-2" /> Paste text
              </Button>
            </div>
          </div>
          <PasteTextDialog sessionId={sessionId} open={pasteOpen} onOpenChange={setPasteOpen} />
        </>
      )}

      <div className="space-y-2">
        {/* Pending Cards alleen tonen zolang de upload nog niet klaar is.
            Zodra status === 'uploaded' nemen we de server-side Card (met dropdown). */}
        {store.pendingFiles
          .filter((p) => p.status !== 'uploaded')
          .map((p) => (
          <Card key={p.localId} className="p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium break-all" title={p.file.name}>
                {p.file.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(p.file.size)} · {labelForStatus(p)}
              </div>
              {p.errorMessage && <div className="text-xs text-destructive">{p.errorMessage}</div>}
            </div>
            {!locked && (
              <Button variant="ghost" size="icon" onClick={() => store.removeFile(p.localId)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </Card>
        ))}

        {(uploadedDocs ?? [])
          .filter((d) => {
            // Verberg server-side Card alleen als de pending-versie nog in flight is.
            // Eenmaal 'uploaded' nemen we de server-side Card over (met dropdown).
            const matching = store.pendingFiles.find((p) => p.remoteDocumentId === d.id);
            return !matching || matching.status === 'uploaded';
          })
          .map((d) => (
            <Card key={d.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-all flex items-center gap-2" title={d.filename}>
                  {d.mime_type === "text/plain" && <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {d.doc_label || d.filename}
                  {d.is_thin && (
                    <span className="text-[10px] text-amber-700 italic">looks empty</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(d.size_bytes)} · {d.status === "summarized" ? "Ready" : d.status === "summarizing" ? "Analyzing…" : d.status}
                </div>
              </div>
              {!locked && (
                <>
                  <CategoryDropdown
                    value={d.category}
                    onChange={(next: DocumentCategory) =>
                      updateCategory.mutate({ docId: d.id, category: next })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // Wis ook eventuele pending-entry zodat de Card niet
                      // even terugploft naar de in-flight versie.
                      const pending = store.pendingFiles.find((p) => p.remoteDocumentId === d.id);
                      if (pending) store.removeFile(pending.localId);
                      deleteDocument.mutate(d.id);
                    }}
                    aria-label="Remove document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
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
    case "queued": return "Preparing…";
    case "uploading": return "Uploading…";
    case "uploaded": return "Uploaded";
    case "failed": return "Failed";
  }
}
