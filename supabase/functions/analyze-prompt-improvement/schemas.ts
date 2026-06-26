import { z } from "zod";

export const OutputType = z.enum(["memo", "appendix"]);
export type OutputTypeT = z.infer<typeof OutputType>;

export const FindRequest = z.object({
  action: z.literal("find"),
  output_type: OutputType,
  // Only used for memo (lexical match against recent reports). Appendix lists
  // recent edits, which already carry the original/improved pair.
  improved_text: z.string().optional(),
});

export const AnalyzeRequest = z.object({
  action: z.literal("analyze"),
  output_type: OutputType,
  prompt_key: z.string().min(1),
  original_text: z.string().min(1),
  improved_text: z.string().min(1),
});

const Change = z.object({
  what: z.string(),            // one concrete change, original -> improved
  inferred_intent: z.string(), // WHY: the rule behind the edit
  prompt_gap: z.string(),      // what in the current prompt allowed the weaker output
});

export const TuningAnalysis = z.object({
  summary_of_changes: z.string(),
  changes: z.array(Change).min(1),
  prompt_weaknesses: z.array(z.string()),
  // FULL drop-in replacement for the target key's system prompt.
  proposed_revised_system_prompt: z.string().min(1),
  // Ready-to-paste change-note line for the versioned insert.
  suggested_notes: z.string(),
});
export type TuningAnalysisT = z.infer<typeof TuningAnalysis>;
