import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PendingFile } from "@/stores/prefillStore";
import type { PrefillJob, QuestionPrefill, SessionDocument, SourceRef } from "@/lib/prefill/types";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { categorizeFromFilename } from "@/lib/prefill/categorize";

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
      console.log("[upload-document] start", { name: pending.file.name, mime: pending.file.type, size: pending.file.size });

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error("Not authenticated");

      // Fast path: parse PDFs/DOCX text in the browser and upload the
      // extracted text. The Supabase edge-runtime's wall-clock limit (60s in
      // v1.70.3) kills server-side PDF parsing + Anthropic calls on large
      // docs; browser V8/WASM handles it in ~2-5s.
      //
      // Fallback path (PDF only): when browser extraction fails or yields
      // almost nothing (scanned, image-only, signed/encrypted-but-openable
      // Deloitte-style docs), upload the raw PDF and let Claude read it
      // server-side as a native document block. No server-side parsing — the
      // Anthropic API does the OCR work.
      let uploadBlob: Blob = pending.file;
      let uploadMime = pending.file.type;
      let uploadSize = pending.file.size;
      let uploadExt = pending.file.name.split(".").pop() ?? "bin";

      const MIN_PDF_TEXT_CHARS = 200;

      if (pending.file.type === "application/pdf") {
        let extracted: string | null = null;
        try {
          console.log("[upload-document] step: extract PDF text in browser");
          const { getDocumentProxy, extractText } = await import("unpdf");
          const buffer = await pending.file.arrayBuffer();
          const pdf = await getDocumentProxy(new Uint8Array(buffer));
          const { text } = await extractText(pdf, { mergePages: true });
          const combined = Array.isArray(text) ? text.join("\n\n") : text;
          extracted = (combined ?? "").trim();
        } catch (err) {
          // pdf.js throws PasswordException for password-protected PDFs.
          // Claude can't read encrypted PDFs either, so fail fast with a
          // clear instruction instead of silently uploading bytes the
          // server-side fallback won't be able to OCR.
          const msg = (err as { message?: string })?.message ?? "";
          const name = (err as { name?: string })?.name ?? "";
          const isPwd =
            name === "PasswordException" ||
            /password/i.test(msg) ||
            /encrypted/i.test(msg);
          if (isPwd) {
            console.warn("[upload-document] PDF is password-protected, rejecting", { name, msg });
            throw new Error(
              "This PDF is password-protected. Open it in Preview or Acrobat, save it without a password, and upload again.",
            );
          }
          console.warn("[upload-document] browser PDF extract threw, will fall back to server OCR", err);
          extracted = null;
        }

        if (extracted && extracted.length >= MIN_PDF_TEXT_CHARS) {
          uploadBlob = new Blob([extracted], { type: "text/plain" });
          uploadMime = "text/plain";
          uploadSize = uploadBlob.size;
          uploadExt = "txt";
          console.log("[upload-document] step: extracted PDF text", { chars: extracted.length });
        } else {
          console.log("[upload-document] step: PDF text was thin or unreadable, uploading raw PDF for server OCR", {
            extracted_chars: extracted?.length ?? 0,
          });
          // Keep the original file — uploadBlob/uploadMime/uploadSize/uploadExt
          // already point at the raw PDF.
        }
      } else if (
        pending.file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        try {
          console.log("[upload-document] step: extract DOCX text in browser");
          const mammothMod = await import("mammoth");
          const buffer = await pending.file.arrayBuffer();
          const result = await mammothMod.extractRawText({ arrayBuffer: buffer });
          const combined = (result.value ?? "").trim();
          if (!combined) {
            throw new Error("Could not extract any text from this Word document.");
          }
          uploadBlob = new Blob([combined], { type: "text/plain" });
          uploadMime = "text/plain";
          uploadSize = uploadBlob.size;
          uploadExt = "txt";
          console.log("[upload-document] step: extracted DOCX text", { chars: combined.length });
        } catch (err) {
          console.error("[upload-document] step failed: docx-extract", err);
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
            category: pending.category ?? categorizeFromFilename(pending.file.name),
            category_source: pending.category ? "user" : "filename",
            storage_path: storagePath,
            mime_type: uploadMime,
            size_bytes: uploadSize,
            relevance_note: null,
          })
          .select()
          .single();
        if (insErr) throw insErr;
        inserted = data;
      } catch (err) {
        console.error("[upload-document] step failed: db-insert", err);
        throw err;
      }

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
    mutationFn: async ({ text, category, label, relevanceNote }: { text: string; category: string; label: string; relevanceNote?: string }) => {
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
          category_source: "filename",
          storage_path: storagePath,
          mime_type: "text/plain",
          size_bytes: blob.size,
          relevance_note: (relevanceNote ?? "").trim() || null,
        })
        .select()
        .single();
      if (insErr) {
        console.error("[upload-text] step failed: db-insert", insErr);
        throw insErr;
      }

      console.log("[upload-text] done", { docId });
      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
    },
  });
}

/**
 * Client-orchestrated swarm: each question gets its own Edge Function call,
 * fired in parallel with a small concurrency cap. This avoids the per-isolate
 * wall-clock limit that killed the previous server-side swarm.
 */
export function useStartAnalyze(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session id");

      // 1. Build the documents bundle via the shared helper. Text-extractable
      //    docs go into the prompt as <document> XML; images travel as refs
      //    that the edge function fetches and base64-encodes as Anthropic
      //    image content blocks (Claude native vision, no OCR step).
      const { textBlock: documentsBlock, imageRefs, pdfRefs, taxpayerName, fiscalYear } = await buildDocumentsBlock(sessionId);
      if (!documentsBlock && imageRefs.length === 0 && pdfRefs.length === 0) throw new Error("No documents to analyze");

      // 2. Atomic claim — insert prefill_jobs row.
      const { error: jobErr } = await supabase
        .from("atad2_prefill_jobs")
        .insert({
          session_id: sessionId,
          status: "stage2_running",
          started_at: new Date().toISOString(),
          stage1_finished_at: new Date().toISOString(),
          locked_at: new Date().toISOString(),
        });
      if (jobErr && !`${jobErr.message}`.toLowerCase().includes("duplicate")) {
        throw jobErr;
      }

      // 3. Load distinct questions.
      const { data: rawQuestions } = await supabase
        .from("atad2_questions")
        .select("question_id, question, question_explanation");
      const uniq = new Map<string, { question_id: string; question: string; question_explanation: string | null }>();
      for (const q of rawQuestions ?? []) {
        if (!uniq.has(q.question_id)) uniq.set(q.question_id, q as never);
      }
      const questions = Array.from(uniq.values());

      // 4. Cache-warmup: fire ONE call first so the prompt-cache prefix is
      //    written before we slam Anthropic with N parallel requests.
      const failures: string[] = [];
      const queue = [...questions];
      const work = async (q: typeof questions[number]) => {
        try {
          await invokePrefillFn({
            action: "analyze_one",
            session_id: sessionId,
            question_id: q.question_id,
            question_text: q.question,
            question_explanation: q.question_explanation ?? "",
            documents_block: documentsBlock,
            image_refs: imageRefs,
            pdf_refs: pdfRefs,
            taxpayer_name: taxpayerName,
            fiscal_year: fiscalYear,
          });
        } catch (e) {
          failures.push(`${q.question_id}: ${(e as Error).message}`);
        }
      };

      const warmup = queue.shift();
      if (warmup) await work(warmup);

      // 5. Fan out with concurrency cap. Each call is ~5-15s and fits the
      //    edge-runtime wall-clock budget on its own; the browser owns the
      //    overall coordination, so total time = max single-call latency.
      //
      //    When PDFs are attached, each call ships the PDF base64 (3-5 MB)
      //    and the edge isolate has to encode + serialize it. Twelve parallel
      //    calls overran the Deno CPU soft limit and supervisors started
      //    cancelling requests mid-flight (observed: ~45 500s, only 4 calls
      //    completed). Cap concurrency much lower when raw PDFs are in play.
      const CONCURRENCY = pdfRefs.length > 0 ? 4 : 12;
      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
        workers.push((async () => {
          while (queue.length > 0) {
            const q = queue.shift();
            if (q) await work(q);
          }
        })());
      }
      await Promise.allSettled(workers);

      // 6. Finalize the job row.
      await supabase.from("atad2_prefill_jobs").update({
        status: failures.length === questions.length ? "failed" : "completed",
        stage2_finished_at: new Date().toISOString(),
        error_message: failures.length === questions.length ? `All ${failures.length} questions failed` : null,
      }).eq("session_id", sessionId);

      return { ok: true, prefill_count: questions.length - failures.length, failure_count: failures.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prefill-job", sessionId] });
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
    },
  });
}

export function useClassifyDocument(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId }: { documentId: string }) => {
      const { data, error } = await supabase.functions.invoke("classify-document", {
        body: { document_id: documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
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

export function useDeleteDocument(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase
        .from("atad2_session_documents")
        .delete()
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}

export function useUpdateDocumentCategory(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category, category_source: "user" })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}

export function useUpdateDocumentMetadata(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docId,
      category,
      relevanceNote,
    }: {
      docId: string;
      category?: string | null;
      relevanceNote?: string | null;
    }) => {
      const patch: Record<string, string | null> = {};
      if (category !== undefined) patch.category = category;
      if (relevanceNote !== undefined) patch.relevance_note = relevanceNote && relevanceNote.trim().length > 0 ? relevanceNote.trim() : null;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("atad2_session_documents")
        .update(patch)
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}

export function useUpdatePrefillAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      prefillId,
      action,
      committedText,
    }: {
      prefillId: string;
      action: QuestionPrefill["user_action"];
      // Pass on Accept/Edit so the UI can later render the locked AI block.
      // Pass null on Edit-reopen to clear a previous commit.
      committedText?: string | null;
    }) => {
      // Split into two updates: user_action is the load-bearing write (it's
      // what hides the SuggestionCard). committed_text lives on a column added
      // by a later migration; if that migration hasn't reached this DB yet, a
      // combined PATCH would fail entirely and the rollback un-hides the card.
      // Fire committed_text as a separate, failure-tolerant follow-up.
      const { data, error } = await supabase
        .from("atad2_question_prefills")
        .update({ user_action: action, actioned_at: new Date().toISOString() })
        .eq("id", prefillId)
        .select()
        .single();
      if (error) throw error;
      if (committedText !== undefined) {
        const { error: ctErr } = await supabase
          .from("atad2_question_prefills")
          .update({ committed_text: committedText })
          .eq("id", prefillId);
        if (ctErr) {
          console.warn(
            "[useUpdatePrefillAction] committed_text update failed (column may be missing)",
            ctErr,
          );
        }
      }
      return data as unknown as QuestionPrefill;
    },
    // Optimistically flip user_action + committed_text in the cache so the
    // Assessment page's textarea binding switches to "user-only" mode the
    // instant the user clicks Accept — no flicker waiting for the round trip.
    onMutate: async ({ prefillId, action, committedText }) => {
      const keys = qc.getQueriesData<QuestionPrefill[]>({ queryKey: ["question-prefills"] });
      const snapshots = keys.map(([key, value]) => ({ key, value }));
      const now = new Date().toISOString();
      for (const [key, value] of keys) {
        if (!value) continue;
        const next = value.map((p) =>
          p.id === prefillId
            ? {
                ...p,
                user_action: action,
                actioned_at: now,
                ...(committedText !== undefined ? { committed_text: committedText } : {}),
              }
            : p,
        );
        qc.setQueryData(key, next);
      }
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      const snapshots = context?.snapshots ?? [];
      for (const { key, value } of snapshots) qc.setQueryData(key, value);
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
