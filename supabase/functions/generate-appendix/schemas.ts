import { z } from "zod";

export const AppendixModelOutput = z.object({
  rows: z.array(z.object({
    rowId: z.string().min(1),
    status: z.string().min(1),     // one of the row's allowedStates
    reasoning: z.string().min(1),  // fact + legal consequence in one (export-safe)
    provenance: z.string(),        // internal trail (answer ids, edges); may be empty
    // Prompt v5: the named backing sources shown in the per-row source panel
    // (internal-only, like provenance). on_file = a DOCUMENTS_LIST document that
    // supports the deciding fact; missing = the document/fact that holds up an
    // "Insufficient information" outcome. Optional so a v4 prompt still parses.
    // DELIBERATELY tolerant: sources are cosmetic next to status/reasoning, so a
    // model slip here (kind "derived", an empty name, "sources": null) must
    // degrade to a dropped entry via the .catch fallbacks, never fail the whole
    // section parse and wipe its substantive statuses. The real vocabulary and
    // empty-name filtering happens in sanitizeSources (index.ts).
    sources: z.array(
      z.object({
        kind: z.string(),
        name: z.string(),
        note: z.string().nullish(),
      }).nullable().catch(null),
    ).nullish().catch(null),
  })).min(1),
});
export type AppendixModelOutputT = z.infer<typeof AppendixModelOutput>;
