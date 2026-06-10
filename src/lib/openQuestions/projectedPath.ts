/**
 * Projected questionnaire path.
 *
 * Walks the questionnaire AS IF the AI suggestions were the answers, with
 * real recorded answers taking precedence. The result is the set of question
 * ids that can still come up: every question reachable under at least one way
 * the remaining unknowns could turn out. Questions outside this set cannot be
 * reached no matter how the unknowns resolve, so the panel can hide them by
 * default (a toggle still reveals them).
 *
 * This walks the SAME data the real flow walks: atad2_questions rows, one row
 * per (question_id, answer_option) with a next_question_id pointing at the
 * next question, "end", or null. See the replay loop in Assessment.tsx. There
 * is no second copy of the questionnaire tree here.
 */

/** One atad2_questions row, reduced to the three branching columns. */
export interface QuestionBranchRow {
  question_id: string;
  answer_option: string;
  next_question_id: string | null;
}

/** The questionnaire always starts at question "1". */
export const PATH_ROOT_QUESTION_ID = "1";

/**
 * Computes the set of question ids on the projected path.
 *
 * Per question, the effective answer is decided in this order:
 * 1. A recorded answer from atad2_answers (capitalized "Yes"/"No"/"Unknown").
 *    A recorded "Unknown" is a real answer: it follows the Unknown branch row,
 *    exactly like the resume replay does.
 * 2. Otherwise the AI suggestion from atad2_question_prefills (lowercase
 *    "yes"/"no"). A suggested "unknown" or missing suggestion does NOT steer.
 * 3. Otherwise the answer is a wildcard: we keep the question on the path and
 *    explore ALL of its branches, because any of them could still happen.
 *
 * Matching against answer_option is case-insensitive, so the lowercase
 * suggestion values line up with the capitalized rows without hand-mapping.
 *
 * Fail open: if an answer matches no branch row (bad data), we fall back to
 * exploring all branches instead of stopping. Bad data may widen the view but
 * can never hide questions.
 */
export function computeProjectedPath(
  branches: QuestionBranchRow[],
  recordedAnswers: Map<string, string>,
  suggestedAnswers: Map<string, string | null>,
): Set<string> {
  // Group the rows per question so we can look up all options of a question.
  const branchesByQuestion = new Map<string, QuestionBranchRow[]>();
  for (const row of branches) {
    const list = branchesByQuestion.get(row.question_id);
    if (list) {
      list.push(row);
    } else {
      branchesByQuestion.set(row.question_id, [row]);
    }
  }

  const onPath = new Set<string>();
  const queue: string[] = [PATH_ROOT_QUESTION_ID];

  while (queue.length > 0) {
    const qid = queue.shift()!;
    // Each question is handled once, so loops in the data cannot run forever.
    if (onPath.has(qid)) continue;

    const rows = branchesByQuestion.get(qid);
    // A question id that has no rows does not exist in the questionnaire.
    if (!rows || rows.length === 0) continue;

    onPath.add(qid);

    // Decide which answer to walk with: recorded first, then a yes/no
    // suggestion. Anything else (no answer, suggested unknown) is a wildcard.
    const recorded = recordedAnswers.get(qid);
    const suggestion = suggestedAnswers.get(qid)?.toLowerCase();
    const effective =
      recorded ??
      (suggestion === "yes" || suggestion === "no" ? suggestion : undefined);

    let nextIds: (string | null)[];
    if (effective !== undefined) {
      const match = rows.find(
        (row) => row.answer_option.toLowerCase() === effective.toLowerCase(),
      );
      // Known answer: follow its single branch. No matching row means the
      // data is off; fail open and explore every branch instead.
      nextIds = match ? [match.next_question_id] : rows.map((row) => row.next_question_id);
    } else {
      // Wildcard: any answer could still be given, so every branch counts.
      nextIds = rows.map((row) => row.next_question_id);
    }

    for (const next of nextIds) {
      if (next && next !== "end" && !onPath.has(next)) {
        queue.push(next);
      }
    }
  }

  return onPath;
}
