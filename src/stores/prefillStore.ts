import { create } from "zustand";
import type { DocumentCategory } from "@/lib/prefill/types";

export type PendingFileStatus = "queued" | "uploading" | "uploaded" | "failed";

export interface PendingFile {
  localId: string;
  file: File;
  category: DocumentCategory | null;
  docLabel: string;
  relevanceNote: string;
  status: PendingFileStatus;
  progress: number;
  errorMessage: string | null;
  remoteDocumentId?: string;
}

interface PrefillState {
  pendingFiles: PendingFile[];
  addFiles: (files: File[]) => void;
  setCategory: (localId: string, cat: DocumentCategory) => void;
  setDocLabel: (localId: string, label: string) => void;
  setRelevanceNote: (localId: string, note: string) => void;
  setStatus: (
    localId: string,
    status: PendingFileStatus,
    opts?: { errorMessage?: string; remoteDocumentId?: string; progress?: number },
  ) => void;
  removeFile: (localId: string) => void;
  reset: () => void;
  totalBytes: () => number;
}

export const usePrefillStore = create<PrefillState>((set, get) => ({
  pendingFiles: [],
  addFiles: (files) => set((s) => ({
    pendingFiles: [
      ...s.pendingFiles,
      ...files.map((f) => ({
        localId: crypto.randomUUID(),
        file: f,
        category: null as DocumentCategory | null,
        docLabel: stripExt(f.name),
        relevanceNote: "",
        status: "queued" as PendingFileStatus,
        progress: 0,
        errorMessage: null,
      })),
    ],
  })),
  setCategory: (localId, cat) => set((s) => ({
    pendingFiles: s.pendingFiles.map((p) => p.localId === localId ? { ...p, category: cat } : p),
  })),
  setDocLabel: (localId, label) => set((s) => ({
    pendingFiles: s.pendingFiles.map((p) => p.localId === localId ? { ...p, docLabel: label } : p),
  })),
  setRelevanceNote: (localId, note) => set((s) => ({
    pendingFiles: s.pendingFiles.map((p) => p.localId === localId ? { ...p, relevanceNote: note } : p),
  })),
  setStatus: (localId, status, opts) => set((s) => ({
    pendingFiles: s.pendingFiles.map((p) =>
      p.localId === localId
        ? {
            ...p,
            status,
            errorMessage: opts?.errorMessage ?? p.errorMessage,
            remoteDocumentId: opts?.remoteDocumentId ?? p.remoteDocumentId,
            progress: opts?.progress ?? p.progress,
          }
        : p
    ),
  })),
  removeFile: (localId) => set((s) => ({
    pendingFiles: s.pendingFiles.filter((p) => p.localId !== localId),
  })),
  reset: () => set({ pendingFiles: [] }),
  totalBytes: () => get().pendingFiles.reduce((acc, p) => acc + p.file.size, 0),
}));

function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}
