import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { Stage2Output, type Stage2PrefillType } from "./schemas.ts";

export async function runExtract(
  serviceClient: SupabaseClient,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const started = Date.now();

  const { data: existing } = await serviceClient
    .from("atad2_prefill_jobs")
    .select("id, locked_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing) {
    await serviceClient.from("atad2_prefill_jobs")
      .update({
        status: "stage1_running",
        started_at: new Date().toISOString(),
        stage1_finished_at: null,
        stage2_finished_at: null,
        failed_at: null,
        error_message: null,
      })
      .eq("session_id", sessionId);
  } else {
    await serviceClient.from("atad2_prefill_jobs").insert({
      session_id: sessionId,
      status: "stage1_running",
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    });
  }

  try {
    const { data: docs } = await serviceClient
      .from("atad2_session_documents")
      .select("id, doc_label, status")
      .eq("session_id", sessionId);

    const notReady = (docs ?? []).filter((d) => d.status !== "summarized" && d.status !== "failed");
    if (notReady.length > 0) {
      throw new Error(`Documents still processing: ${notReady.map((d) => d.id).join(",")}`);
    }

    const successfulDocIds = (docs ?? []).filter((d) => d.status === "summarized").map((d) => d.id);
    const { data: summaries } = await serviceClient
      .from("atad2_document_summaries")
      .select("document_id, summary_json")
      .in("document_id", successfulDocIds);

    if (!summaries || summaries.length === 0) {
      throw new Error("No successful summaries to run Stage 2 on");
    }

    await serviceClient.from("atad2_prefill_jobs")
      .update({ stage1_finished_at: new Date().toISOString(), status: "stage2_running" })
      .eq("session_id", sessionId);

    const docLabelById = new Map((docs ?? []).map((d) => [d.id, d.doc_label]));
    const documentsJson = summaries.map((s) => ({
      document_id: s.document_id,
      doc_label: docLabelById.get(s.document_id) ?? "",
      summary: s.summary_json,
    }));

    const { data: questionRows } = await serviceClient
      .from("atad2_questions")
      .select("question_id, question, question_explanation");
    const uniq = new Map<string, { question_id: string; question: string; question_explanation: string | null }>();
    for (const q of questionRows ?? []) {
      if (!uniq.has(q.question_id)) uniq.set(q.question_id, q);
    }
    const questionsJson = Array.from(uniq.values());

    const prompt = await loadActivePrompt(serviceClient, "prefill_stage2_system");
    const userText = renderTemplate(prompt.user_prompt_template, {
      documents_json: JSON.stringify(documentsJson, null, 2),
      questions_json: JSON.stringify(questionsJson, null, 2),
    });

    const { text, usage } = await callOpus({
      model: prompt.model,
      systemPrompt: prompt.system_prompt,
      userContent: userText,
      temperature: prompt.temperature,
      maxTokens: prompt.max_tokens,
    });

    let parsed;
    try {
      parsed = extractJson(text, Stage2Output);
    } catch (_e) {
      const retry = await callOpus({
        model: prompt.model,
        systemPrompt: prompt.system_prompt,
        userContent: userText,
        temperature: prompt.temperature,
        maxTokens: prompt.max_tokens,
      });
      parsed = extractJson(retry.text, Stage2Output);
      usage.input_tokens += retry.usage.input_tokens;
      usage.output_tokens += retry.usage.output_tokens;
    }

    const allowedDocIds = new Set(summaries.map((s) => s.document_id));
    // Interpretive / hedging lead-ins that signal the model is summarizing
    // rather than quoting facts. Suggestions starting with these are dropped
    // as a safety net on top of the system-prompt rule.
    const BAD_LEAD_INS = [
      "based on",
      "according to",
      "from the document",
      "from the documents",
      "the document concern",
      "the documents concern",
      "the document is",
      "the documents are",
      "the document suggests",
      "the documents suggest",
      "the document indicates",
      "the documents indicate",
      "the document shows",
      "the documents show",
      "the document states",
      "the documents state",
      "the financial statements",
      "the local file",
      "the master file",
      "the tax return",
      "the trial balance",
      "the general ledger",
      "the previous",
      "the linklaters memorandum",
      "the memorandum",
      "the memo",
      "the advisory letter",
      "the analysis",
      "it appears that",
      "it seems that",
      "the uploaded",
      "in the attached",
      "the attached",
      "as set out in",
      "as described in",
      "as documented in",
      "op basis van",
      "volgens het document",
      "het document suggereert",
      "uit het document blijkt",
      "blijkens het document",
    ];
    const validPrefills: Stage2PrefillType[] = [];
    for (const p of parsed.prefills) {
      const badRef = p.source_refs.find((r) => !allowedDocIds.has(r.document_id));
      if (badRef) {
        console.warn(JSON.stringify({
          level: "warn", event: "stage2_citation_drop",
          session_id: sessionId, question_id: p.question_id,
          reason: `document_id ${badRef.document_id} not in inputs`,
        }));
        continue;
      }
      const lower = p.suggested_toelichting.trim().toLowerCase();
      const matchedBadLeadIn = BAD_LEAD_INS.find((phrase) => lower.startsWith(phrase));
      if (matchedBadLeadIn) {
        console.warn(JSON.stringify({
          level: "warn", event: "stage2_suggestion_dropped",
          session_id: sessionId, question_id: p.question_id,
          reason: `interpretive lead-in: "${matchedBadLeadIn}"`,
        }));
        continue;
      }
      // Also drop suggestions that reference document/memo concepts anywhere
      // in the body. The advisor's voice doesn't mention them.
      const FORBIDDEN_ANYWHERE = [
        "the memorandum",
        "the memo ",
        "the advisory letter",
        "in the document",
        "in the documents",
        "as analysed in",
        "as analyzed in",
        "as discussed in",
        "as set out in",
        "as documented in",
        "the local file ",
        "the master file ",
        "the financial statement",
        "the trial balance ",
        "the previous atad2",
      ];
      const matchedAnywhere = FORBIDDEN_ANYWHERE.find((phrase) => lower.includes(phrase));
      if (matchedAnywhere) {
        console.warn(JSON.stringify({
          level: "warn", event: "stage2_suggestion_dropped",
          session_id: sessionId, question_id: p.question_id,
          reason: `forbidden phrase: "${matchedAnywhere}"`,
        }));
        continue;
      }
      validPrefills.push(p);
    }

    if (validPrefills.length > 0) {
      await serviceClient.from("atad2_question_prefills").upsert(
        validPrefills.map((p) => ({
          session_id: sessionId,
          question_id: p.question_id,
          suggested_toelichting: p.suggested_toelichting,
          source_refs: p.source_refs,
          verbatim_quote: p.verbatim_quote,
          user_action: "pending",
        })),
        { onConflict: "session_id,question_id" },
      );
    }

    // Same lead-in / phrase filter applies to the session-level summary too.
    let cleanAdditionalContext: string | null = parsed.additional_context ?? null;
    if (cleanAdditionalContext) {
      const lower = cleanAdditionalContext.trim().toLowerCase();
      const bad = BAD_LEAD_INS.find((p) => lower.startsWith(p));
      const forbidden = [
        "the memorandum",
        "the memo ",
        "the advisory letter",
        "in the document",
        "in the documents",
        "as analysed in",
        "as analyzed in",
        "as discussed in",
        "as set out in",
        "as documented in",
        "the local file ",
        "the master file ",
        "the financial statement",
      ].find((p) => lower.includes(p));
      if (bad || forbidden) {
        console.warn(JSON.stringify({
          level: "warn", event: "stage2_additional_context_dropped",
          session_id: sessionId,
          reason: bad ? `lead-in: "${bad}"` : `phrase: "${forbidden}"`,
        }));
        cleanAdditionalContext = null;
      }
    }

    await serviceClient.from("atad2_prefill_jobs")
      .update({
        stage2_finished_at: new Date().toISOString(),
        status: "completed",
        total_token_usage: usage,
        stage2_prompt_version: prompt.version,
        suggested_additional_context: cleanAdditionalContext,
      })
      .eq("session_id", sessionId);

    console.log(JSON.stringify({
      level: "info", event: "stage2_completed",
      session_id: sessionId, prefill_count: validPrefills.length,
      duration_ms: Date.now() - started,
    }));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient.from("atad2_prefill_jobs")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("session_id", sessionId);
    console.error(JSON.stringify({
      level: "error", event: "stage2_failed",
      session_id: sessionId, error: message,
    }));
    return { ok: false, error: message };
  }
}
