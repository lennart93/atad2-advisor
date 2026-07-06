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
