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

