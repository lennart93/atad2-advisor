/**
 * The gate that decides when the "Analyzing your documents" screen may leave
 * the reading stages (bar past 72%) and the worklist may compose its points.
 *
 * It lived inline and DUPLICATED in useAnalyzingStages and useDocumentsWorklist,
 * comparing a prefill ROW count against a suggestion-map DISTINCT count. Those
 * two numbers come from two separate React-Query caches of the same table, each
 * on its own realtime channel, so they can drift; and mixing "rows" with
 * "distinct question ids" meant a single duplicate prefill row could make the
 * gate unsatisfiable forever. Both counts are now DISTINCT question ids, and the
 * predicate is one shared, tested unit.
 */
export interface AnalysisReadyInput {
  /** atad2_prefill_jobs.status for this session. */
  jobStatus: string | null | undefined;
  /** Distinct question_ids that have at least one prefill row. */
  prefillQuestionIdCount: number;
  /** Distinct question_ids present in the suggestion map. */
  suggestionQuestionIdCount: number;
  /** Total distinct questionnaire questions, or null while still loading. */
  totalQuestions: number | null;
}

/**
 * The swarm has finished: either the job row says so, or every question already
 * has a prefill. Uses DISTINCT prefilled question ids, never a raw row count, so
 * duplicate rows can't declare full coverage before every question is answered.
 */
export function isSwarmDone(input: AnalysisReadyInput): boolean {
  return (
    input.jobStatus === "completed" ||
    (input.totalQuestions != null &&
      input.prefillQuestionIdCount >= input.totalQuestions)
  );
}

/**
 * Ready to leave the reading stages / compose the points: the swarm is done AND
 * the suggestion map (which drives the projected path) has caught up to every
 * prefilled question. The suggestion map holds one entry per prefilled
 * question_id, so once both caches read the same snapshot the counts are equal;
 * a shortfall means the suggestion cache is lagging (a dropped realtime event),
 * which the caller reconciles by refetching rather than by hanging here.
 */
export function isAnalysisReady(input: AnalysisReadyInput): boolean {
  return (
    isSwarmDone(input) &&
    input.prefillQuestionIdCount > 0 &&
    input.suggestionQuestionIdCount >= input.prefillQuestionIdCount
  );
}
