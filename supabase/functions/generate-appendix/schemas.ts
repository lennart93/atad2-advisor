import { z } from "zod";

export const AppendixModelOutput = z.object({
  rows: z.array(z.object({
    rowId: z.string().min(1),
    status: z.string().min(1),     // one of the row's allowedStates
    reasoning: z.string().min(1),  // fact + legal consequence in one (export-safe)
    provenance: z.string(),        // internal trail (answer ids, edges); may be empty
  })).min(1),
});
export type AppendixModelOutputT = z.infer<typeof AppendixModelOutput>;
