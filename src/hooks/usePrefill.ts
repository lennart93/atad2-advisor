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

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const ext = pending.file.name.split(".").pop() ?? "bin";
      const docId = crypto.randomUUID();
      const storagePath = `${userId}/${sessionId}/${docId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("session-documents")
        .upload(storagePath, pending.file, { contentType: pending.file.type });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from("atad2_session_documents")
        .insert({
          id: docId,
          session_id: sessionId,
          filename: pending.file.name,
          doc_label: pending.docLabel,
          category: pending.category,
          storage_path: storagePath,
          mime_type: pending.file.type,
          size_bytes: pending.file.size,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
        .catch((e) => console.error("summarize failed", e));

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
