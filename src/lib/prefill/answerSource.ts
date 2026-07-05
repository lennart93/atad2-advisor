import type { QuestionPrefill, SourceRef } from '@/lib/prefill/types';

/**
 * The document citations that genuinely back an answer's on-screen explanation.
 *
 * `source_refs` are attached to the AI's *suggested* toelichting, so they may
 * only be shown when that AI text is actually present in the saved explanation:
 * accepted verbatim, edited, or accepted alongside the advisor's own notes (the
 * saved text is then a superset that still contains the AI passage). A
 * hand-written, dismissed, or fully overridden explanation cites nothing here,
 * so it gets no Source rail rather than a misattributed one. Refs without a
 * document label are dropped (there is nothing to show).
 *
 * Spec (handoff #43): never fabricate a source; render only what the answer
 * genuinely cites.
 */
export function answerSourceRefs(
  explanationText: string,
  prefill:
    | Pick<QuestionPrefill, 'committed_text' | 'suggested_toelichting' | 'source_refs'>
    | null
    | undefined,
): SourceRef[] {
  const aiText = (prefill?.committed_text ?? prefill?.suggested_toelichting ?? '').trim();
  if (!aiText || !explanationText.includes(aiText)) return [];
  return (prefill?.source_refs ?? []).filter((ref) => !!ref.doc_label);
}
