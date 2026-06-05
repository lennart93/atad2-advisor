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

export interface PdfRef {
  doc_label: string;
  storage_path: string;
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
  pdfRefs: PdfRef[] = [],
  taxpayerName: string = "",
  fiscalYear: string = "",
): Promise<{ ok: boolean; error?: string; usage?: Record<string, number> }> {
  const started = Date.now();

  try {
    const prompt = await loadActivePrompt(serviceClient, "prefill_swarm_system" as PromptKey);

    const userText = renderTemplate(prompt.user_prompt_template, {
      documents_block: documentsBlock,
      question_id: questionId,
      question_text: questionText,
      question_explanation: questionExplanation ?? "",
      taxpayer_name: taxpayerName,
      fiscal_year: fiscalYear,
    });

    const splitMarker = "## Question";
    const splitIndex = userText.indexOf(splitMarker);
    const docPrefix = splitIndex >= 0 ? userText.slice(0, splitIndex) : userText;
    const questionSuffix = splitIndex >= 0 ? userText.slice(splitIndex) : "";

    // Fetch image + raw-PDF bytes once per request; failures are logged but
    // non-fatal so a single broken file doesn't sink the whole analyze call.
    const imageBlocks = await fetchImageBlocks(serviceClient, sessionId, questionId, imageRefs);
    const pdfBlocks = await fetchPdfBlocks(serviceClient, sessionId, questionId, pdfRefs);

    // Layout per Anthropic best practice for PDFs/images: attachments FIRST,
    // then text. Order: [pdf blocks…, image blocks…, text(docPrefix +
    // attachment list), text(questionSuffix)]. The cache marker sits on the
    // text-prefix block so everything before the question is cached, written
    // once per session and read by every other question call in the swarm.
    const attachmentList = buildAttachmentList(pdfRefs, imageRefs);
    const cachedTextPrefix = docPrefix + attachmentList;

    type CacheableBlock = AnthropicBlock & { cache_control?: { type: "ephemeral" } };
    const prefix: CacheableBlock[] = [];
    for (const pb of pdfBlocks) prefix.push(pb);
    for (const ib of imageBlocks) prefix.push(ib);
    prefix.push({ type: "text", text: cachedTextPrefix });
    prefix[prefix.length - 1].cache_control = { type: "ephemeral" };

    const userContent: CacheableBlock[] = [...prefix, { type: "text", text: questionSuffix }];

    // Diagnostic: log what we actually shipped to Anthropic. Critical for
    // debugging "PDF was uploaded but model returned no info" cases — proves
    // whether the PDF made it into the request payload at all.
    console.log(JSON.stringify({
      level: "info", event: "swarm_one_request_built",
      session_id: sessionId, question_id: questionId,
      pdf_refs_in: pdfRefs.length, pdf_blocks_attached: pdfBlocks.length,
      image_refs_in: imageRefs.length, image_blocks_attached: imageBlocks.length,
      doc_prefix_chars: docPrefix.length,
      block_types: userContent.map((b) => b.type),
    }));

    const { text, usage } = await callOpus({
      model: prompt.model,
      systemPrompt: prompt.system_prompt,
      userContent: userContent as unknown as AnthropicBlock[],
      temperature: prompt.temperature,
      maxTokens: prompt.max_tokens,
    });

    const parsed = extractJson(text, SwarmPrefill);

    // Route B safety net: Opus consistently drops suggested_toelichting_unknown
    // even when the swarm prompt requires it as a pair with contextual_hint
    // (observed across v9, v10, v11). When the main call returns hint-only,
    // make a small focused follow-up call to derive the unknown-toelichting
    // from the hint. Cheap (Haiku), deterministic, no further prompt-coaxing
    // needed. Only fires when the main call took Route B and dropped the
    // companion; Route A (suggested_toelichting) is unaffected.
    let unknownToelichting = parsed.suggested_toelichting_unknown;
    if (parsed.contextual_hint && !unknownToelichting) {
      try {
        unknownToelichting = await synthesizeUnknownToelichting(parsed.contextual_hint);
        console.log(JSON.stringify({
          level: "info", event: "swarm_unknown_synthesized",
          session_id: sessionId, question_id: questionId,
          hint_chars: parsed.contextual_hint.length,
          unknown_chars: unknownToelichting?.length ?? 0,
        }));
      } catch (err) {
        console.warn(JSON.stringify({
          level: "warn", event: "swarm_unknown_synth_failed",
          session_id: sessionId, question_id: questionId,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }

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
      suggested_toelichting_unknown: unknownToelichting,
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

const UNKNOWN_SYNTH_SYSTEM = `You convert an ATAD2 advisor's contextual_hint into a companion "unknown-toelichting": the user-voice explanation the same advisor would type if they picked "Unknown" for the question.

Output plain text (NO JSON, NO markdown). 2-4 sentences, <=1000 characters.

REQUIRED structure:
1. Open with the Dutch taxpayer entity name (e.g. "Camden B.V. has...", "The taxpayer holds...").
2. State the relevant structural facts from the hint (parties, percentages, jurisdictions, dates).
3. Explicitly state what is unknown using "It is unknown ...", "It is currently unclear ...", or "It has not yet been confirmed ...".
4. Where the hint says "Confirmation is needed on X" / "particularly whether Y", restate as "It is unknown whether X..." / "Specifically, it has not been confirmed whether Y...".

BANNED:
- References to documents ("the documents", "the memo", "based on", "according to", etc.). Speak as the advisor with direct knowledge.
- Meta-language ("I am picking Unknown because...", "this is unknown for ATAD2 purposes").
- Restating the question.
- Em-dashes or en-dashes. Hyphen-minus (-) is fine for compound words.
- Dutch short titles for legislation (use "Dutch Corporate Income Tax Act", not "Wet Vpb").

Output the unknown-toelichting now.`;

async function synthesizeUnknownToelichting(hint: string): Promise<string | null> {
  const { text } = await callOpus({
    model: "claude-haiku-4-5-20251001",
    systemPrompt: UNKNOWN_SYNTH_SYSTEM,
    userContent: `contextual_hint:\n${hint}`,
    temperature: 0,
    maxTokens: 600,
  });
  const cleaned = text.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!cleaned) return null;
  if (cleaned.length > 1000) return cleaned.slice(0, 1000);
  return cleaned;
}

/**
 * Build a short text appendix listing PDF + image attachments. The PDF / image
 * content blocks themselves come FIRST in the user message (Anthropic best
 * practice); this appendix lives in the text prefix to label which attachment
 * is which, so the model can cite them by doc_label in source_refs.
 */
function buildAttachmentList(pdfRefs: PdfRef[], imageRefs: ImageRef[]): string {
  if (pdfRefs.length === 0 && imageRefs.length === 0) return "";
  const parts: string[] = [];
  let n = 1;
  if (pdfRefs.length > 0) {
    const lines = pdfRefs.map((r) => {
      const note = r.relevance_note ? `, ${r.relevance_note}` : "";
      return `  [PDF ${n++}] ${r.doc_label}${note}`;
    });
    parts.push(
      `${pdfRefs.length} PDF document${pdfRefs.length === 1 ? " is" : "s are"} attached above as native PDF blocks (read them directly, they are the primary source for this question):\n${lines.join("\n")}`,
    );
  }
  if (imageRefs.length > 0) {
    const lines = imageRefs.map((r) => {
      const note = r.relevance_note ? `, ${r.relevance_note}` : "";
      return `  [Image ${n++}] ${r.doc_label}${note}`;
    });
    parts.push(
      `${imageRefs.length} image document${imageRefs.length === 1 ? " is" : "s are"} attached above for visual reference:\n${lines.join("\n")}`,
    );
  }
  return `\n\n## Attachments\n\n${parts.join("\n\n")}\n`;
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

export async function fetchPdfBlocks(
  serviceClient: SupabaseClient,
  sessionId: string,
  questionId: string,
  refs: PdfRef[],
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
      const block = await toAnthropicBlock(bytes, "application/pdf");
      blocks.push(block);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "pdf_fetch_failed",
        session_id: sessionId, question_id: questionId,
        storage_path: ref.storage_path,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }
  return blocks;
}
