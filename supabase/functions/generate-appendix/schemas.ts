import { z } from "zod";

export const AppendixModelOutput = z.object({
  rows: z.array(z.object({
    rowId: z.string().min(1),
    decision: z.string().min(1),
    reasoning: z.string().min(1),
    reference: z.string(), // may be empty string
  })).min(1),
});
export type AppendixModelOutputT = z.infer<typeof AppendixModelOutput>;
