import { supabase } from "@/integrations/supabase/client";
import { FactsheetSchema, type Factsheet } from "./schema";

export type FactsheetGenerationStatus = "idle" | "generating" | "complete" | "error";

export interface StoredFactsheet {
  session_id: string;
  factsheet: Factsheet | null;
  version: number;
  generation_status: FactsheetGenerationStatus;
  error: string | null;
  source_document_ids: string[] | null;
  model: string | null;
  prompt_version: number | null;
  built_at: string | null;
  updated_at: string;
}

export interface DocFactsStatusRow {
  document_id: string;
  status: "pending" | "complete" | "error";
  updated_at: string;
}

/** Read the session fact sheet. The stored JSON is re-validated leniently so a
 *  legacy/off-shape row still renders (never throws for display). */
export async function loadFactsheet(sessionId: string): Promise<StoredFactsheet | null> {
  const { data } = await supabase
    .from("atad2_session_factsheet")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data) return null;
  const parsed = data.factsheet ? FactsheetSchema.safeParse(data.factsheet) : null;
  return {
    session_id: data.session_id as string,
    factsheet: parsed && parsed.success ? parsed.data : null,
    version: (data.version as number | null) ?? 0,
    generation_status: (data.generation_status as FactsheetGenerationStatus) ?? "idle",
    error: (data.error as string | null) ?? null,
    source_document_ids: (data.source_document_ids as string[] | null) ?? null,
    model: (data.model as string | null) ?? null,
    prompt_version: (data.prompt_version as number | null) ?? null,
    built_at: (data.built_at as string | null) ?? null,
    updated_at: (data.updated_at as string) ?? new Date(0).toISOString(),
  };
}

export async function loadDocFactsStatuses(sessionId: string): Promise<DocFactsStatusRow[]> {
  const { data } = await supabase
    .from("atad2_document_facts")
    .select("document_id, status, updated_at")
    .eq("session_id", sessionId);
  return (data ?? []) as unknown as DocFactsStatusRow[];
}

/** Fire per-document extraction. doc_text is an optional optimisation for text
 *  docs; when omitted the edge function downloads the file itself. Fire-and-log:
 *  never blocks the caller. */
export async function startDocFactsExtraction(
  sessionId: string,
  documentId: string,
  docText?: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke("extract-docfacts", {
    body: { session_id: sessionId, document_id: documentId, ...(docText ? { doc_text: docText } : {}) },
  });
  if (error) throw error;
}

export async function startFactsheetBuild(sessionId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("build-factsheet", {
    body: { session_id: sessionId },
  });
  if (error) throw error;
}

/**
 * Best-effort gate used right before the swarm starts (useStartAnalyze): give the
 * dossier fact sheet a bounded chance to finish so the swarm runs ONCE, grounded,
 * instead of racing the factsheet build and re-doing weak questions. Fires
 * extraction for any document without a facts row, triggers the build, and polls
 * until the factsheet is complete or `capMs` elapses.
 *
 * NEVER throws and NEVER blocks indefinitely: on timeout (or any error) it returns
 * null and the caller runs the swarm without the block, exactly as before, with
 * the progressive re-run as the safety net. Keep capMs comfortably under the
 * AnalyzingScreen stall watchdog (120s) so the wait itself never trips a stall.
 */
export async function ensureFactsheetReady(
  sessionId: string,
  capMs = 60_000,
): Promise<StoredFactsheet | null> {
  const deadline = Date.now() + capMs;
  try {
    // 1. Kick off extraction for any document that has no facts row yet (a fast
    //    upload where the prewarm had no time). Idempotent per document.
    const { data: docs } = await supabase
      .from("atad2_session_documents").select("id").eq("session_id", sessionId);
    const docIds = (docs ?? []).map((d) => d.id as string);
    if (docIds.length === 0) return null;
    const statuses0 = await loadDocFactsStatuses(sessionId);
    const haveRow = new Set(statuses0.map((s) => s.document_id));
    await Promise.all(
      docIds.filter((id) => !haveRow.has(id)).map((id) => startDocFactsExtraction(sessionId, id).catch(() => {})),
    );

    // 2. Wait for every document to reach a terminal facts status (complete/error).
    while (Date.now() < deadline) {
      const statuses = await loadDocFactsStatuses(sessionId);
      const terminal = docIds.filter((id) => {
        const s = statuses.find((x) => x.document_id === id);
        return s && (s.status === "complete" || s.status === "error");
      });
      if (terminal.length === docIds.length) break;
      await sleep(2500);
    }

    // 3. Trigger the build and poll until it completes (or the cap hits).
    await startFactsheetBuild(sessionId).catch(() => {});
    while (Date.now() < deadline) {
      const fs = await loadFactsheet(sessionId);
      if (fs?.generation_status === "complete" && fs.factsheet) return fs;
      if (fs?.generation_status === "error") return null;
      await sleep(2500);
    }
    return null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
