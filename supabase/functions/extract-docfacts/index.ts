// extract-docfacts — factsheet pipeline, per-document fact extraction.
//
// One Anthropic (Sonnet) call per document, fired by the client
// (useDocFactsPrewarm) as soon as a document is uploaded + classified. Extracts
// the §2-subset of facts (entities/TIN/ownership/loans/flows-with-direction/
// elections/PE-residence/explicit negatives, each with a loc) and upserts them
// into atad2_document_facts. build-factsheet later merges all rows of a session.
//
// Idempotent per document_id (unique row): calling again re-extracts and
// overwrites. Failures are stored as status='error' with the raw output, never
// thrown to the client — a broken doc must not sink the whole prewarm fan-out.
//
// Auth/CORS boilerplate mirrors prefill-documents. The document row is loaded by
// document_id server-side (robust: the client need not resend storage metadata);
// doc_text is an optional optimisation for text docs to skip a storage download.

import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callModel, parseJsonObject } from "./llm.ts";
import { loadActivePrompt, renderTemplate } from "./promptsLoader.ts";
import { type AnthropicBlock, toAnthropicBlock } from "./converters.ts";
import { DocFactsSchema } from "../_shared/factsheetSchema.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const TEXT_MIMES = new Set(["text/plain", "text/csv", "text/markdown"]);
const NATIVE_MIMES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

interface DocRow {
  id: string;
  session_id: string;
  doc_label: string;
  category: string;
  storage_path: string;
  mime_type: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let body: { session_id?: string; document_id?: string; doc_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.session_id || !body.document_id) return json({ error: "Missing session_id or document_id" }, 400);

  const service = createServiceClient();
  const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, service);
  if (!userId) return json({ error: "Forbidden" }, 403);

  // Load the document row (also confirms it belongs to this session).
  const { data: doc } = await service
    .from("atad2_session_documents")
    .select("id, session_id, doc_label, category, storage_path, mime_type")
    .eq("id", body.document_id)
    .maybeSingle();
  if (!doc || (doc as DocRow).session_id !== body.session_id) {
    return json({ error: "Document not found for session" }, 404);
  }
  const docRow = doc as DocRow;

  try {
    const result = await extractOne(service, docRow, body.doc_text);
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", event: "docfacts_failed", document_id: docRow.id, error: message }));
    // Persist the error so the row is not stuck 'pending' forever.
    await upsertFacts(service, docRow, { status: "error", error: message.slice(0, 2000) });
    return json({ ok: false, error: message }, 500);
  }
});

async function extractOne(
  service: SupabaseClient,
  doc: DocRow,
  docText: string | undefined,
): Promise<{ ok: boolean; status: string; error?: string }> {
  const started = Date.now();
  const prompt = await loadActivePrompt(service, "docfacts_extract_system");

  // Build the user content. Text docs go inline; PDF/image docs travel as a
  // native Anthropic block (Anthropic does any OCR), with the text template
  // pointing at "the attached document".
  let userContent: AnthropicBlock[] | string;
  if (docText && docText.trim()) {
    userContent = renderTemplate(prompt.user_prompt_template, {
      DOC_LABEL: doc.doc_label, CATEGORY: doc.category, DOCUMENT_TEXT: docText,
    });
  } else if (TEXT_MIMES.has(doc.mime_type)) {
    const text = await downloadText(service, doc.storage_path);
    userContent = renderTemplate(prompt.user_prompt_template, {
      DOC_LABEL: doc.doc_label, CATEGORY: doc.category, DOCUMENT_TEXT: text,
    });
  } else if (NATIVE_MIMES.has(doc.mime_type)) {
    const block = await downloadBlock(service, doc.storage_path, doc.mime_type);
    const rendered = renderTemplate(prompt.user_prompt_template, {
      DOC_LABEL: doc.doc_label, CATEGORY: doc.category,
      DOCUMENT_TEXT: "(the document is attached above; read it directly)",
    });
    userContent = [block, { type: "text", text: rendered }];
  } else {
    // DOCX/XLSX/PPTX etc. are text-extracted at upload time and stored as
    // text/plain; if one still arrives in its native OOXML form, toAnthropicBlock
    // extracts it to a text block.
    const block = await downloadBlock(service, doc.storage_path, doc.mime_type);
    const blockText = block.type === "text" ? block.text : "(unsupported binary document)";
    userContent = renderTemplate(prompt.user_prompt_template, {
      DOC_LABEL: doc.doc_label, CATEGORY: doc.category, DOCUMENT_TEXT: blockText,
    });
  }

  const { text, usage } = await callModel({
    model: prompt.model,
    systemPrompt: prompt.system_prompt,
    userContent,
    temperature: prompt.temperature,
    maxTokens: prompt.max_tokens,
  });

  // safeParse: on failure store status=error + raw output, never throw.
  let facts: unknown;
  try {
    facts = parseJsonObject(text);
  } catch (err) {
    await upsertFacts(service, doc, {
      status: "error", model: prompt.model, prompt_version: prompt.version,
      error: `parse failed: ${err instanceof Error ? err.message : String(err)}\n\n${text.slice(0, 1500)}`,
    });
    return { ok: false, status: "error", error: "parse failed" };
  }
  const validated = DocFactsSchema.safeParse(facts);
  if (!validated.success) {
    await upsertFacts(service, doc, {
      status: "error", model: prompt.model, prompt_version: prompt.version,
      error: `validation failed: ${validated.error.message.slice(0, 800)}\n\n${text.slice(0, 1200)}`,
    });
    return { ok: false, status: "error", error: "validation failed" };
  }

  await upsertFacts(service, doc, {
    status: "complete", facts: validated.data, model: prompt.model, prompt_version: prompt.version, error: null,
  });

  console.log(JSON.stringify({
    level: "info", event: "docfacts_completed", document_id: doc.id,
    duration_ms: Date.now() - started, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    entities: validated.data.entities.length, flows: validated.data.flows.length,
  }));
  return { ok: true, status: "complete" };
}

async function upsertFacts(
  service: SupabaseClient,
  doc: DocRow,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await service
    .from("atad2_document_facts")
    .upsert({
      session_id: doc.session_id,
      document_id: doc.id,
      updated_at: new Date().toISOString(),
      ...patch,
    }, { onConflict: "document_id" });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "docfacts_upsert_failed", document_id: doc.id, error: error.message }));
    throw error;
  }
}

async function downloadText(service: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await service.storage.from("session-documents").download(storagePath);
  if (error || !data) throw error ?? new Error("empty file");
  return await data.text();
}

async function downloadBlock(service: SupabaseClient, storagePath: string, mimeType: string): Promise<AnthropicBlock> {
  const { data, error } = await service.storage.from("session-documents").download(storagePath);
  if (error || !data) throw error ?? new Error("empty file");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return await toAnthropicBlock(bytes, mimeType);
}
