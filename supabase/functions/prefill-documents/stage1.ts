import type { SupabaseClient } from "supabase";
import { toAnthropicBlock } from "./converters.ts";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { Stage1Output } from "./schemas.ts";

const BUCKET = "session-documents";

export async function runSummarize(
  serviceClient: SupabaseClient,
  sessionId: string,
  documentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const started = Date.now();
  const { data: doc, error: docErr } = await serviceClient
    .from("atad2_session_documents")
    .select("id, session_id, filename, doc_label, category, storage_path, mime_type")
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
    const userHeader = renderTemplate(prompt.user_prompt_template, {
      category: doc.category,
      doc_label: doc.doc_label,
      filename: doc.filename,
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
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient.from("atad2_session_documents")
      .update({ status: "failed", error_message: message }).eq("id", documentId);
    console.error(JSON.stringify({
      level: "error", event: "stage1_failed",
      session_id: sessionId, document_id: documentId, error: message,
    }));
    return { ok: false, error: message };
  }
}
