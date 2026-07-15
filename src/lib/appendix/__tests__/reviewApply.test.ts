import { describe, it, expect } from 'vitest';
// Cross-import into the Deno file: it must stay dependency-free (same pattern
// as extract-structure/formatters.ts and _shared/effectiveAnswers.ts).
import { applyReviewSafely } from '../../../../supabase/functions/generate-appendix/reviewApply';

const row = (over: Partial<{ rowId: string; source: string; reasoning: string | null; aiReasoning: string | null }> = {}) => ({
  rowId: '3.1', source: 'ai', reasoning: 'Original text.', aiReasoning: 'Original text.', status: 'Not triggered', ...over,
});

describe('applyReviewSafely', () => {
  it('applies the reviewed reasoning to an untouched ai row', () => {
    const written = [row()];
    const current = [row()];
    const out = applyReviewSafely(current, written, new Map([['3.1', 'Polished text.']]));
    expect(out.applied).toBe(1);
    expect(out.rows[0]).toMatchObject({ reasoning: 'Polished text.', aiReasoning: 'Polished text.', status: 'Not triggered' });
  });
  it('never touches a row the advisor edited in the window', () => {
    const written = [row()];
    const current = [row({ source: 'edited', reasoning: 'Advisor wording.' })];
    const out = applyReviewSafely(current, written, new Map([['3.1', 'Polished text.']]));
    expect(out.applied).toBe(0);
    expect(out.rows[0].reasoning).toBe('Advisor wording.');
  });
  it('never touches an ai row whose reasoning changed since the write', () => {
    const written = [row()];
    const current = [row({ reasoning: 'Different by now.' })];
    const out = applyReviewSafely(current, written, new Map([['3.1', 'Polished text.']]));
    expect(out.applied).toBe(0);
    expect(out.rows[0].reasoning).toBe('Different by now.');
  });
  it('ignores review output for unknown rows and leaves other rows untouched', () => {
    const written = [row(), row({ rowId: '4.1', reasoning: 'Row four.', aiReasoning: 'Row four.' })];
    const current = [row(), row({ rowId: '4.1', reasoning: 'Row four.', aiReasoning: 'Row four.' })];
    const out = applyReviewSafely(current, written, new Map([['9.9', 'Ghost.'], ['4.1', 'Row four, polished.']]));
    expect(out.applied).toBe(1);
    expect(out.rows[0].reasoning).toBe('Original text.');
    expect(out.rows[1].reasoning).toBe('Row four, polished.');
  });
});
