import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PendingFile } from "@/stores/prefillStore";
import type { PrefillJob, QuestionPrefill, SessionDocument, SourceRef } from "@/lib/prefill/types";

export function useSessionDocuments(sessionId: string | null) {
  return useQuery({
    enabled: !!sessionId,
    queryKey: ["session-documents", sessionId],
    queryFn: async (): Promise<SessionDocument[]> => {
      const { data, error } = await supabase
        .from("atad2_session_documents")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SessionDocument[];
    },
  });
}

export function usePrefillJob(sessionId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    enabled: !!sessionId,
    queryKey: ["prefill-job", sessionId],
    queryFn: async (): Promise<PrefillJob | null> => {
      const { data, error } = await supabase
        .from("atad2_prefill_jobs")
        .select("*")
        .eq("session_id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PrefillJob | null);
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`prefill-job-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atad2_prefill_jobs", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["prefill-job", sessionId] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atad2_session_documents", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, qc]);

  return query;
}

export function useAllPrefills(sessionId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    enabled: !!sessionId,
    queryKey: ["question-prefills", sessionId],
    queryFn: async (): Promise<QuestionPrefill[]> => {
      const { data, error } = await supabase
        .from("atad2_question_prefills")
        .select("*")
        .eq("session_id", sessionId!);
      if (error) throw error;
      return ((data ?? []) as unknown as { source_refs: unknown; [k: string]: unknown }[])
        .map((row) => ({ ...row, source_refs: row.source_refs as SourceRef[] })) as unknown as QuestionPrefill[];
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`question-prefills-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atad2_question_prefills", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, qc]);

  return query;
}

export function useQuestionPrefill(sessionId: string | null, questionId: string | null) {
  const all = useAllPrefills(sessionId);
  const prefill = all.data?.find((p) => p.question_id === questionId) ?? null;
  return { ...all, data: prefill };
}

export function useUploadDocument(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pending }: { pending: PendingFile }) => {
      if (!sessionId) throw new Error("No session id");
      if (!pending.category) throw new Error("Category required");
      console.log("[upload-document] start", { name: pending.file.name, mime: pending.file.type, size: pending.file.size });

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated");

      // For PDFs, parse text in the browser and upload the extracted text
      // instead of the raw binary. The Supabase edge-runtime's wall-clock
      // limit (60s in v1.70.3) kills server-side PDF parsing + Anthropic
      // calls on large docs. Browser V8/WASM handles it in ~2-5s.
      let uploadBlob: Blob = pending.file;
      let uploadMime = pending.file.type;
      let uploadSize = pending.file.size;
      let uploadExt = pending.file.name.split(".").pop() ?? "bin";

      if (pending.file.type === "application/pdf") {
        try {
          console.log("[upload-document] step: extract PDF text in browser");
          const { getDocumentProxy, extractText } = await import("unpdf");
          const buffer = await pending.file.arrayBuffer();
          const pdf = await getDocumentProxy(new Uint8Array(buffer));
          const { text } = await extractText(pdf, { mergePages: true });
          const combined = Array.isArray(text) ? text.join("\n\n") : text;
          if (!combined || combined.trim().length === 0) {
            throw new Error("Could not extract any text from this PDF. It may be scanned or image-only.");
          }
          uploadBlob = new Blob([combined], { type: "text/plain" });
          uploadMime = "text/plain";
          uploadSize = uploadBlob.size;
          uploadExt = "txt";
          console.log("[upload-document] step: extracted PDF text", { chars: combined.length });
        } catch (err) {
          console.error("[upload-document] step failed: pdf-extract", err);
          throw err;
        }
      }

      const docId = crypto.randomUUID();
      const storagePath = `${userId}/${sessionId}/${docId}.${uploadExt}`;

      try {
        console.log("[upload-document] step: storage upload", { docId, storagePath, mime: uploadMime, size: uploadSize });
        const { error: upErr } = await supabase.storage
          .from("session-documents")
          .upload(storagePath, uploadBlob, { contentType: uploadMime });
        if (upErr) throw upErr;
      } catch (err) {
        console.error("[upload-document] step failed: storage-upload", err);
        throw err;
      }

      let inserted;
      try {
        console.log("[upload-document] step: db insert");
        const { data, error: insErr } = await supabase
          .from("atad2_session_documents")
          .insert({
            id: docId,
            session_id: sessionId,
            filename: pending.file.name,
            doc_label: pending.docLabel,
            category: pending.category,
            storage_path: storagePath,
            mime_type: uploadMime,
            size_bytes: uploadSize,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        inserted = data;
      } catch (err) {
        console.error("[upload-document] step failed: db-insert", err);
        throw err;
      }

      console.log("[upload-document] step: invoke summarize (fire-and-forget)", { docId });
      invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
        .catch((e) => console.error("[upload-document] summarize failed", e));

      console.log("[upload-document] done", { docId });

      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
    },
  });
}

export function useUploadText(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, category, label }: { text: string; category: string; label: string }) => {
      if (!sessionId) throw new Error("No session id");
      if (!text.trim()) throw new Error("Empty text");
      console.log("[upload-text] start", { chars: text.length, category });

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const blob = new Blob([text], { type: "text/plain" });
      const docId = crypto.randomUUID();
      const storagePath = `${userId}/${sessionId}/${docId}.txt`;

      try {
        console.log("[upload-text] step: storage upload", { docId, size: blob.size });
        const { error: upErr } = await supabase.storage
          .from("session-documents")
          .upload(storagePath, blob, { contentType: "text/plain" });
        if (upErr) throw upErr;
      } catch (err) {
        console.error("[upload-text] step failed: storage-upload", err);
        throw err;
      }

      console.log("[upload-text] step: db insert");
      const { data: inserted, error: insErr } = await supabase
        .from("atad2_session_documents")
        .insert({
          id: docId,
          session_id: sessionId,
          filename: `${label}.txt`,
          doc_label: label,
          category,
          storage_path: storagePath,
          mime_type: "text/plain",
          size_bytes: blob.size,
        })
        .select()
        .single();
      if (insErr) {
        console.error("[upload-text] step failed: db-insert", insErr);
        throw insErr;
      }

      console.log("[upload-text] step: invoke summarize (fire-and-forget)", { docId });
      invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
        .catch((e) => console.error("[upload-text] summarize failed", e));

      console.log("[upload-text] done", { docId });
      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
    },
  });
}

export function useStartExtraction(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session id");
      return await invokePrefillFn({ action: "extract", session_id: sessionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prefill-job", sessionId] });
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
    },
  });
}

export function useCleanupDocuments(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session id");
      return await invokePrefillFn({ action: "cleanup", session_id: sessionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
    },
  });
}

export function useUpdateDocumentCategory(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}

export function useUpdatePrefillAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ prefillId, action }: { prefillId: string; action: QuestionPrefill["user_action"] }) => {
      const { data, error } = await supabase
        .from("atad2_question_prefills")
        .update({ user_action: action, actioned_at: new Date().toISOString() })
        .eq("id", prefillId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as QuestionPrefill;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["question-prefills", data.session_id] });
    },
  });
}

async function invokePrefillFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("prefill-documents", { body });
  if (error) throw error;
  return data as { ok: boolean; error?: string };
}
