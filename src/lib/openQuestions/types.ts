import type { Database } from "@/integrations/supabase/types";

/** Row of the atad2_open_questions register (generated type). */
export type OpenQuestionRow =
  Database["public"]["Tables"]["atad2_open_questions"]["Row"];

/** Lifecycle of a register row. Terminal statuses live in the history group. */
export type OpenQuestionStatus =
  | "open"
  | "taken_to_client"
  | "answered"
  | "resolved"
  | "confirmed_unknown"
  | "dismissed";

/** Where the row came from. 'reopen' rows demand advisor attention. */
export type OpenQuestionSource = "swarm" | "advisor" | "reopen";

/**
 * Last-resort question text. client_question is NULL for all production rows
 * today, so callers normally fall back to the official question text first.
 */
export const FALLBACK_QUESTION_SENTENCE =
  "The documents did not provide enough information to answer this question.";
