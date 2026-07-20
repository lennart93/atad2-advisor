// Client for the admin Prompt Tuner: paste an improved AI output, find the
// original, and get a sharpened-prompt suggestion. Talks to the
// `analyze-prompt-improvement` edge function. Nothing is persisted.

import { supabase } from "@/integrations/supabase/client";
import type { PromptKey } from "@/lib/admin/promptKeys";
import { parseAnalyzeResponseText } from "@/lib/admin/promptTunerStream";

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

export type TunerOutputType = "memo" | "appendix";

/** Which prompt each output type's suggestion targets. */
export const OUTPUT_TYPE_TO_KEY: Record<TunerOutputType, PromptKey> = {
  memo: "memo_system",
  appendix: "appendix_system",
};

export const OUTPUT_TYPE_LABEL: Record<TunerOutputType, string> = {
  memo: "Memo",
  appendix: "Technical appendix",
};

export interface MemoCandidate {
  source_row_id: string;
  session_id: string;
  taxpayer_name: string | null;
  fiscal_year: string | null;
  prompt_version: string | null;
  original_text: string;
  snippet: string;
  score: number;
}

export interface AppendixCandidate {
  edit_id: string;
  session_id: string | null;
  taxpayer_name: string | null;
  row_id: string;
  field: string;
  original_text: string;
  improved_text: string;
  edited_at: string;
}

export interface TuningChange {
  what: string;
  inferred_intent: string;
  prompt_gap: string;
}

export interface TuningAnalysis {
  summary_of_changes: string;
  changes: TuningChange[];
  prompt_weaknesses: string[];
  proposed_revised_system_prompt: string;
  suggested_notes: string;
}

/**
 * supabase-js wraps non-2xx edge responses in a FunctionsHttpError whose
 * .context is the raw fetch Response; the server message lives in the JSON
 * body's `error` field. Mirrors useComposeClientLetter.
 */
async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const err = error as { message?: string; context?: Response };
  let msg = err.message || "Prompt Tuner request failed";
  try {
    const body = await err.context?.clone().json();
    if (body?.error) msg = String(body.error);
  } catch {
    // keep err.message
  }
  return msg;
}

export async function findMemoOriginals(improvedText: string): Promise<MemoCandidate[]> {
  const { data, error } = await supabase.functions.invoke("analyze-prompt-improvement", {
    body: { action: "find", output_type: "memo", improved_text: improvedText },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return (data?.candidates ?? []) as MemoCandidate[];
}

export async function findAppendixEdits(): Promise<AppendixCandidate[]> {
  const { data, error } = await supabase.functions.invoke("analyze-prompt-improvement", {
    body: { action: "find", output_type: "appendix" },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return (data?.candidates ?? []) as AppendixCandidate[];
}

/**
 * Paste flow for the appendix tab, mirroring the memo flow: the pasted improved
 * appendix text is lexically matched server-side against recent appendices
 * (rows flattened to text). Candidates come back in the memo shape.
 */
export async function findAppendixOriginals(improvedText: string): Promise<MemoCandidate[]> {
  const { data, error } = await supabase.functions.invoke("analyze-prompt-improvement", {
    body: { action: "find", output_type: "appendix", improved_text: improvedText },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return (data?.candidates ?? []) as MemoCandidate[];
}

/**
 * Direct fetch instead of supabase.functions.invoke: the analyze call can run
 * for several minutes, so the edge function streams NDJSON heartbeats to keep
 * the connection alive and ends with the payload line. invoke() cannot read
 * that shape; parseAnalyzeResponseText handles both the stream and the plain
 * JSON body of the previously deployed function.
 */
export async function analyzeImprovement(args: {
  outputType: TunerOutputType;
  originalText: string;
  improvedText: string;
}): Promise<TuningAnalysis> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_BASE}/analyze-prompt-improvement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({
      action: "analyze",
      output_type: args.outputType,
      prompt_key: OUTPUT_TYPE_TO_KEY[args.outputType],
      original_text: args.originalText,
      improved_text: args.improvedText,
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = `Prompt Tuner request failed (${r.status})`;
    try {
      const body = JSON.parse(text);
      if (body?.error) msg = String(body.error);
    } catch {
      // Non-JSON error body (e.g. a gateway timeout page); keep the status message.
    }
    throw new Error(msg);
  }
  const payload = parseAnalyzeResponseText(text);
  if (payload.error) throw new Error(String(payload.error));
  if (!payload.analysis) throw new Error("The analyzer returned no result.");
  return payload.analysis as TuningAnalysis;
}
