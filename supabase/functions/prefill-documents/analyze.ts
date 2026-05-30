import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate, type PromptKey } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { SwarmPrefill } from "./schemas.ts";
import { type AnthropicBlock, toAnthropicBlock } from "./converters.ts";

export interface ImageRef {
  doc_label: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

const BAD_LEAD_INS = [
  "based on", "according to", "from the document", "from the documents",
  "the document concern", "the documents concern",
  "the document suggests", "the documents suggest", "the document indicates", "the documents indicate",
  "the document shows", "the documents show", "the document states", "the documents state",
  "the financial statements", "the local file", "the master file", "the tax return",
  "the trial balance", "the general ledger", "the previous", "the linklaters memorandum",
  "the memorandum", "the memo", "the advisory letter", "the analysis",
  "it appears that", "it seems that",
  "the uploaded", "in the attached", "the attached",
  "as set out in", "as described in", "as documented in",
  "op basis van", "volgens het document", "het document suggereert",
  "uit het document blijkt", "blijkens het document",
];

const FORBIDDEN_ANYWHERE = [
  "the memorandum", "the memo ", "the advisory letter",
  "in the document", "in the documents",
  "as analysed in", "as analyzed in", "as discussed in", "as set out in", "as documented in",
  "the local file ", "the master file ", "the financial statement",
  "the trial balance ", "the previous atad2",
];

/**
 * Single-question analysis. The client orchestrates the swarm by firing N of
 * these in parallel — each request fits comfortably in the edge-runtime
 * wall-clock budget because it does ONE Anthropic call.
 */
export async function runAnalyzeOne(
  serviceClient: SupabaseClient,
  sessionId: string,
  questionId: string,
  questionText: string,
  questionExplanation: string,
  documentsBlock: string,
  imageRefs: ImageRef[] = [],
): Promise<{ ok: boolean; error?: string; usage?: Record<string, number> }> {
  const started = Date.now();

  try {
    const prompt = await loadActivePrompt(serviceClient, "prefill_swarm_system" as PromptKey);

    const userText = renderTemplate(prompt.user_prompt_template, {
      documents_block: documentsBlock,
      question_id: questionId,
      question_text: questionText,
      question_explanation: questionExplanation ?? "",
    });

    const splitMarker = "## Question";
    const splitIndex = userText.indexOf(splitMarker);
    const docPrefix = splitIndex >= 0 ? userText.slice(0, splitIndex) : userText;
    const questionSuffix = splitIndex >= 0 ? userText.slice(splitIndex) : "";

    // Fetch image bytes once per request; failures are logged but non-fatal so
    // a single broken image doesn't sink the whole analyze call.
    const imageBlocks = await fetchImageBlocks(serviceClient, sessionId, questionId, imageRefs);

    // Layout: [textPrefix, image header (if any), image blocks…, questionSuffix].
    // The cache marker sits on the LAST prefix block (or on the lone text
    // prefix when there are no images) so the whole document + image context
    // is cached together — written once per session, read by every other
    // question call in the swarm.
    const headerBlock: AnthropicBlock | null = imageBlocks.length > 0
      ? { type: "text", text: buildImageHeader(imageRefs) }
      : null;

    type CacheableBlock = AnthropicBlock & { cache_control?: { type: "ephemeral" } };
    const prefix: CacheableBlock[] = [{ type: "text", text: docPrefix }];
    if (headerBlock) prefix.push(headerBlock);
    for (const ib of imageBlocks) prefix.push(ib);
    prefix[prefix.length - 1].cache_control = { type: "ephemeral" };

    const userContent: CacheableBlock[] = [...prefix, { type: "text", text: questionSuffix }];

    const { text, usage } = await callOpus({
      model: prompt.model,
      systemPrompt: prompt.system_prompt,
      userContent: userContent as unknown as AnthropicBlock[],
      temperature: prompt.temperature,
      maxTokens: prompt.max_tokens,
    });

    const parsed = extractJson(text, SwarmPrefill);

    // Only run lead-in / forbidden-phrase guards against suggested_toelichting,
    // since contextual_hint is allowed to reference documents in advisor voice.
    if (parsed.suggested_toelichting) {
      const lower = parsed.suggested_toelichting.trim().toLowerCase();
      if (BAD_LEAD_INS.some((p) => lower.startsWith(p))) {
        console.warn(JSON.stringify({
          level: "warn", event: "swarm_one_dropped",
          session_id: sessionId, question_id: questionId, reason: "bad lead-in",
        }));
        return { ok: false, error: "bad lead-in", usage: usage as unknown as Record<string, number> };
      }
      if (FORBIDDEN_ANYWHERE.some((p) => lower.includes(p))) {
        console.warn(JSON.stringify({
          level: "warn", event: "swarm_one_dropped",
          session_id: sessionId, question_id: questionId, reason: "forbidden phrase",
        }));
        return { ok: false, error: "forbidden phrase", usage: usage as unknown as Record<string, number> };
      }
    }

    await serviceClient.from("atad2_question_prefills").upsert({
      session_id: sessionId,
      question_id: questionId,
      suggested_toelichting: parsed.suggested_toelichting,
      source_refs: parsed.source_refs,
      suggested_answer: parsed.suggested_answer,
      confidence_pct: parsed.confidence_pct,
      answer_rationale: parsed.answer_rationale,
      contextual_hint: parsed.contextual_hint,
      user_action: "pending",
    }, { onConflict: "session_id,question_id" });

    console.log(JSON.stringify({
      level: "info", event: "swarm_one_completed",
      session_id: sessionId, question_id: questionId,
      duration_ms: Date.now() - started,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_create: usage.cache_creation_input_tokens ?? 0,
    }));

    return {
      ok: true,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: "error", event: "swarm_one_failed",
      session_id: sessionId, question_id: questionId, error: message,
    }));
    return { ok: false, error: message };
  }
}

function buildImageHeader(refs: ImageRef[]): string {
  const lines = refs.map((r, i) => {
    const note = r.relevance_note ? ` — ${r.relevance_note}` : "";
    return `  [${i + 1}] ${r.doc_label}${note}`;
  });
  return `\n\nThe following ${refs.length} image document${refs.length === 1 ? " is" : "s are"} attached for visual reference:\n${lines.join("\n")}\n`;
}

export async function fetchImageBlocks(
  serviceClient: SupabaseClient,
  sessionId: string,
  questionId: string,
  refs: ImageRef[],
): Promise<AnthropicBlock[]> {
  if (refs.length === 0) return [];
  const blocks: AnthropicBlock[] = [];
  for (const ref of refs) {
    try {
      const { data, error } = await serviceClient.storage
        .from("session-documents")
        .download(ref.storage_path);
      if (error || !data) throw error ?? new Error("empty file");
      const bytes = new Uint8Array(await data.arrayBuffer());
      const block = await toAnthropicBlock(bytes, ref.mime_type);
      blocks.push(block);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "image_fetch_failed",
        session_id: sessionId, question_id: questionId,
        storage_path: ref.storage_path,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }
  return blocks;
}
