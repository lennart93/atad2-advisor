import { describe, it, expect } from 'vitest';
import { answerSourceRefs } from '@/lib/prefill/answerSource';
import type { SourceRef } from '@/lib/prefill/types';

const refs: SourceRef[] = [
  { document_id: 'd1', doc_label: 'Shareholders register', location: 'p. 2' },
];

// Minimal prefill shape the helper actually reads.
const mk = (over: Partial<{ committed_text: string | null; suggested_toelichting: string | null; source_refs: SourceRef[] }>) => ({
  committed_text: null,
  suggested_toelichting: null,
  source_refs: refs,
  ...over,
});

const AI = 'S4 Energy BV is an associated participant, holding 62.7% since 5 January 2023.';

describe('answerSourceRefs', () => {
  it('shows refs when the explanation is the accepted AI text verbatim', () => {
    expect(answerSourceRefs(AI, mk({ committed_text: AI }))).toEqual(refs);
  });

  it('shows refs when the AI text is accepted with the advisor’s notes appended', () => {
    // The combine flow stores `${ai}\n\n${notes}` (or notes then ai); either way
    // the saved text still contains the AI passage that the refs cite.
    const withNotesAfter = `${AI}\n\nWe will confirm the US check-the-box election.`;
    const withNotesBefore = `Per the loan file:\n\n${AI}`;
    expect(answerSourceRefs(withNotesAfter, mk({ committed_text: AI }))).toEqual(refs);
    expect(answerSourceRefs(withNotesBefore, mk({ committed_text: AI }))).toEqual(refs);
  });

  it('hides refs when the suggestion was dismissed and the advisor hand-wrote a different explanation', () => {
    // Dismiss leaves committed_text null; the fallback is the rejected suggestion,
    // which the hand-written text does not contain.
    const hand = 'Confirmed by management; no associated enterprise treats us as transparent.';
    expect(answerSourceRefs(hand, mk({ committed_text: null, suggested_toelichting: AI }))).toEqual([]);
  });

  it('hides refs for a pending suggestion the advisor typed over', () => {
    const typed = 'Not applicable for this taxpayer.';
    expect(answerSourceRefs(typed, mk({ committed_text: null, suggested_toelichting: AI }))).toEqual([]);
  });

  it('hides refs when the explanation was fully overridden after acceptance (committed_text stale)', () => {
    const overridden = 'On review this is No; the participant is below the threshold.';
    expect(answerSourceRefs(overridden, mk({ committed_text: AI }))).toEqual([]);
  });

  it('falls back to the raw suggestion for legacy rows with no committed_text', () => {
    expect(answerSourceRefs(AI, mk({ committed_text: null, suggested_toelichting: AI }))).toEqual(refs);
  });

  it('returns [] when there is no prefill at all', () => {
    expect(answerSourceRefs(AI, null)).toEqual([]);
    expect(answerSourceRefs(AI, undefined)).toEqual([]);
  });

  it('returns [] when the prefill carries no AI text', () => {
    expect(answerSourceRefs(AI, mk({ committed_text: null, suggested_toelichting: null }))).toEqual([]);
    expect(answerSourceRefs(AI, mk({ committed_text: '   ', suggested_toelichting: null }))).toEqual([]);
  });

  it('drops refs that have no document label', () => {
    const mixed: SourceRef[] = [
      { document_id: 'd1', doc_label: 'Shareholders register', location: 'p. 2' },
      { document_id: 'd2', doc_label: '', location: 'p. 9' },
    ];
    expect(answerSourceRefs(AI, mk({ committed_text: AI, source_refs: mixed }))).toEqual([mixed[0]]);
  });

  it('tolerates surrounding whitespace on the AI text (trimmed before matching)', () => {
    expect(answerSourceRefs(AI, mk({ committed_text: `  ${AI}  ` }))).toEqual(refs);
  });
});
