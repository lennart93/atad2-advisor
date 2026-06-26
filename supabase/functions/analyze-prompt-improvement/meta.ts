// The meta-analysis prompt + helpers for the admin Prompt Tuner.
//
// Kept here (not in atad2_prompts) for v1 so the feature needs no DB migration.
// If it ever needs to be tuned in the admin UI itself, promote it to a
// versioned `prompt_tuner_system` key and load it via loadPrompt instead.

import type { OutputTypeT } from "./schemas.ts";

/**
 * Constant instruction block (the "system" half of the call). Placed in a
 * cache breakpoint by callClaude, so the retry reuses it.
 */
export const META_SYSTEM = `You are an expert prompt engineer working on an ATAD2 Dutch corporate-tax advisory app. An admin took one AI-generated output, rewrote it by hand into a better version, and wants the GENERATING system prompt sharpened so the next output is right the first time.

You are given:
- the current system prompt that produced the ORIGINAL output (this is what you must revise),
- the ORIGINAL output (what the AI produced),
- the IMPROVED output (the human's rewrite, treated as the gold standard).

Infer the general rules behind the human's edits and fold them into the prompt. Do not just describe the diff: change the prompt so the model would have produced the improved output on its own.

Hard rules:
- Only propose changes that GENERALIZE. Never bake in facts specific to this one case (taxpayer names, amounts, this client's structure). Those belong in the data, not the prompt.
- Preserve every {{PLACEHOLDER}} from the current prompt EXACTLY (same names, same spelling). Do not add, rename, or remove placeholders.
- Keep the output contract intact (same format, sections, and any JSON shape the prompt demands). You are tightening guidance, not redesigning the task.
- proposed_revised_system_prompt MUST be the COMPLETE prompt, ready to drop in as a replacement, not a diff or a fragment.
- House style: do not use em dashes or en dashes anywhere; use a comma or rewrite the sentence.
- Return ONLY a single JSON object. No markdown, no code fences, no prose before or after.

Return exactly this JSON shape:
{
  "summary_of_changes": "what the human changed and why, in plain language",
  "changes": [
    { "what": "one concrete change, original vs improved", "inferred_intent": "the general rule behind it", "prompt_gap": "what in the current prompt let the weaker version through" }
  ],
  "prompt_weaknesses": ["short bullet", "..."],
  "proposed_revised_system_prompt": "the full revised system prompt, drop-in ready, all placeholders preserved",
  "suggested_notes": "a one or two sentence change-note for the prompt version log"
}`;

const APPENDIX_NOTE = `
Note on this output type: it is ONE row of the ATAD2 technical appendix, made of three fields (decision, reasoning, reference). The reference field is internal only and never reaches the client export, so do not move client-facing content into it. Improve appendix_system so the decision and reasoning come out like the improved version.`;

/** Soft guard against pathological inputs; memos are well within this. */
function clip(s: string, max = 80_000): string {
  return s.length > max ? s.slice(0, max) + "\n[...truncated...]" : s;
}

export function buildUserMessage(args: {
  outputType: OutputTypeT;
  promptKey: string;
  currentSystemPrompt: string;
  original: string;
  improved: string;
}): string {
  const typeNote = args.outputType === "appendix" ? APPENDIX_NOTE : "";
  return `OUTPUT TYPE: ${args.outputType}
TARGET PROMPT KEY: ${args.promptKey}${typeNote}

=== CURRENT SYSTEM PROMPT (revise this) ===
${args.currentSystemPrompt}

=== ORIGINAL OUTPUT (what the AI produced) ===
${clip(args.original)}

=== IMPROVED OUTPUT (human gold standard) ===
${clip(args.improved)}

Analyze the difference and return the JSON object now.`;
}

// --- Lexical similarity for memo auto-find ---------------------------------
// Original and improved share most of their text, so a cheap bigram-shingle
// Jaccard over the recent-N candidates is enough to surface the right memo at
// the top. No embeddings, no DB extension.

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function shingles(tokens: string[], n = 2): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

export function similarity(a: string, b: string): number {
  const sa = shingles(tokenize(a));
  const sb = shingles(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}
