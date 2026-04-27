import type { SupabaseClient } from "supabase";
import { toAnthropicBlock } from "./converters.ts";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { Stage1Output } from "./schemas.ts";
import { runExtract } from "./stage2.ts";

const BUCKET = "session-documents";

export async function runSummarize(
  serviceClient: SupabaseClient,
  sessionId: string,
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const started = Date.now();
  const { data: doc, error: docErr } = await serviceClient
    .from("atad2_session_documents")
    .select("id, session_id, filename, doc_label, category, storage_path, mime_type, relevance_note")
    .eq("id", documentId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (docErr || !doc) return { ok: false, error: `Document not found: ${docErr?.message ?? documentId}` };

  await serviceClient.from("atad2_session_documents")
    .update({ status: "summarizing" }).eq("id", documentId);

  try {
    const { data: file, error: dlErr } = await serviceClient
      .storage.from(BUCKET).download(doc.storage_path);
    if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message ?? "null file"}`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const block = await toAnthropicBlock(bytes, doc.mime_type);

    const prompt = await loadActivePrompt(serviceClient, "prefill_stage1_system");
    const relevanceLine = (doc as { relevance_note?: string | null }).relevance_note?.trim();
    const userHeader = renderTemplate(prompt.user_prompt_template, {
      category: doc.category,
      doc_label: doc.doc_label,
      filename: doc.filename,
      relevance_note: relevanceLine || "(none provided)",
      document_block: "",
    });

    const userContent = [
      { type: "text" as const, text: userHeader.replace("{{document_block}}", "") },
      block,
    ];

    const { text, usage } = await callOpus({
      model: prompt.model,
      systemPrompt: prompt.system_prompt,
      userContent,
      temperature: prompt.temperature,
      maxTokens: prompt.max_tokens,
    });

    let parsed;
    try {
      parsed = extractJson(text, Stage1Output);
    } catch (_e) {
      const retry = await callOpus({
        model: prompt.model,
        systemPrompt: prompt.system_prompt,
        userContent,
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
      });
      parsed = extractJson(retry.text, Stage1Output);
      usage.input_tokens += retry.usage.input_tokens;
      usage.output_tokens += retry.usage.output_tokens;
    }

    await serviceClient.from("atad2_document_summaries").insert({
      document_id: doc.id,
      summary_json: parsed,
      token_usage: usage,
      prompt_version: prompt.version,
    });
    await serviceClient.from("atad2_session_documents")
      .update({ status: "summarized" }).eq("id", doc.id);

    console.log(JSON.stringify({
      level: "info", event: "stage1_completed",
      session_id: sessionId, document_id: doc.id,
      duration_ms: Date.now() - started,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    }));

    // Self-coordination: if every doc in the session has reached a terminal
    // state (summarized or failed), kick off Stage 2 in this same isolate.
    // The atomic INSERT below guarantees only one summarize call wins and
    // triggers Stage 2 — others observe the row exists and skip.
    await maybeTriggerStage2(serviceClient, sessionId).catch((e) => {
      console.error(JSON.stringify({
        level: "error", event: "stage2_trigger_failed",
        session_id: sessionId, error: e instanceof Error ? e.message : String(e),
      }));
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient.from("atad2_session_documents")
      .update({ status: "failed", error_message: message }).eq("id", documentId);
    console.error(JSON.stringify({
      level: "error", event: "stage1_failed",
      session_id: sessionId, document_id: documentId, error: message,
    }));

    // Even on this doc's failure, others may now all be terminal — try Stage 2.
    await maybeTriggerStage2(serviceClient, sessionId).catch(() => { /* swallow */ });

    return { ok: false, error: message };
  }
}

/**
 * Atomically claim the right to run Stage 2 for a session. Returns true if
 * this caller now owns Stage 2 and should run it; false if another caller
 * already owns it OR Stage 1 isn't done yet.
 */
async function maybeTriggerStage2(serviceClient: SupabaseClient, sessionId: string): Promise<void> {
  const { data: docs } = await serviceClient
    .from("atad2_session_documents")
    .select("id, status")
    .eq("session_id", sessionId);
  if (!docs || docs.length === 0) return;

  const allTerminal = docs.every((d) => d.status === "summarized" || d.status === "failed");
  if (!allTerminal) return;

  const anySummarized = docs.some((d) => d.status === "summarized");
  if (!anySummarized) return; // nothing to run Stage 2 against

  // Atomic claim: try to insert a new prefill_jobs row. Unique constraint on
  // session_id ensures only one caller wins.
  const { error: insertErr } = await serviceClient
    .from("atad2_prefill_jobs")
    .insert({
      session_id: sessionId,
      status: "stage2_running",
      started_at: new Date().toISOString(),
      stage1_finished_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    });

  if (insertErr) {
    // Another caller already created the job (unique violation) — they own it.
    return;
  }

  console.log(JSON.stringify({
    level: "info", event: "stage2_auto_triggered", session_id: sessionId,
  }));
  // Run Stage 2 inline. runExtract handles its own status updates and errors.
  await runExtract(serviceClient, sessionId);
}
