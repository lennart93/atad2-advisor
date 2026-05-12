// Pure, dependency-free helpers usable from both Deno (Edge Function) and
// Node (vitest cross-import). Do NOT add Deno- or Supabase-specific imports
// here.

export interface QaAnswerRow {
  question_id: string;
  question_text: string;
  answer: string;
  explanation: string | null;
}

/**
 * Format Q&A answers as the multi-line block embedded in the prompt
 * <qa_answers> section. The explanation line is omitted when blank or null.
 */
export function formatQaBlock(rows: QaAnswerRow[]): string {
  return rows
    .map((r) => {
      const exp = (r.explanation ?? '').trim();
      const expLine = exp ? `\n  Explanation: ${exp}` : '';
      return `Q ${r.question_id} (${r.question_text})\n  Answer: ${r.answer}${expLine}`;
    })
    .join('\n\n');
}

/**
 * Prepended to every Phase-B prompt. Tells Claude to treat the Q&A as
 * authoritative and never re-classify mismatches against the user's yes/no.
 */
export const QA_PRIMACY_HEADER = `\
The <qa_answers> block below is the user's authoritative testimony about their corporate structure. Treat every Q&A answer and explanation as ground truth. The <documents> block is background — use it only to fill factual gaps (legal names, ISO codes, amounts) the Q&A does not specify. Where Q&A and documents conflict, the Q&A wins. Never re-classify an ATAD2 mismatch contrary to the user's yes/no answer.

`;
