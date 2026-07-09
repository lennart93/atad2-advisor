import { describe, it, expect } from 'vitest';
// The Deno edge-function core, imported by relative path (Deno cannot import src/).
import {
  reviewAppendix,
  runReviewGuard,
  parseReviewJson,
  buildReviewSystemPrompt,
  type ReviewRowInput,
} from '../../../../supabase/functions/generate-appendix/reviewAppendix';

const ctx = {
  taxpayerName: 'WMC Energy BV',
  entityNames: ['WMC Energy BV', 'WMC Group BV', 'WMC Energy Corp'],
  factsBlock: 'E1 WMC Energy BV [NL, Taxpayer]\nE2 WMC Group BV [NL]\nE3 WMC Energy Corp [US]',
};

const row = (over: Partial<ReviewRowInput> & { rowId: string }): ReviewRowInput => ({
  displayCode: `B.${over.rowId}`,
  legalBasis: 'Article 12aa CIT Act',
  conditionTested: 'A hybrid mismatch gives a deduction without inclusion',
  status: 'Not triggered',
  reasoning: 'Some grounded reasoning about WMC Energy BV.',
  editable: true,
  ...over,
});

const rows: ReviewRowInput[] = [
  row({ rowId: '3.2', reasoning: 'WMC Global Services BV and WMC Energy BV are disregarded for US purposes, but their results are allocated to WMC Group BV.' }),
  row({ rowId: '3.5', reasoning: 'WMC Global Services BV and WMC Energy BV are disregarded for US purposes, but their results are allocated to WMC Group BV for US tax purposes.' }),
  row({ rowId: '6.1', reasoning: 'The service recharge that WMC Energy BV pays to WMC Energy Corp is the only cross-border payment.', editable: false }),
];

describe('parseReviewJson', () => {
  it('extracts rows and contradictions from a fenced JSON blob', () => {
    const raw = '```json\n{"rows":[{"rowId":"3.2","reasoning":"Tighter text."}],"contradictions":["2.1 vs 6.1"]}\n```';
    expect(parseReviewJson(raw)).toEqual({ rows: [{ rowId: '3.2', reasoning: 'Tighter text.' }], contradictions: ['2.1 vs 6.1'] });
  });
  it('drops malformed row entries and returns null on non-JSON', () => {
    expect(parseReviewJson('no json here')).toBeNull();
    const r = parseReviewJson('{"rows":[{"rowId":"3.2"},{"reasoning":"x"},{"rowId":"3.5","reasoning":"ok"}]}');
    expect(r?.rows).toEqual([{ rowId: '3.5', reasoning: 'ok' }]);
    expect(r?.contradictions).toEqual([]);
  });
});

describe('runReviewGuard', () => {
  it('passes a faithful tighten that keeps numbers, entities and citations', () => {
    const before = 'WMC Energy BV paid USD 61,667 under art. 12aa.';
    const after = 'WMC Energy BV paid USD 61,667 (art. 12aa).';
    expect(runReviewGuard(before, after, ctx.entityNames).ok).toBe(true);
  });
  it('fails when a number is dropped', () => {
    const g = runReviewGuard('paid USD 61,667', 'paid a service fee', ctx.entityNames);
    expect(g.ok).toBe(false);
    expect(g.failures.join(' ')).toContain('61,667');
  });
  it('fails when an entity name is dropped', () => {
    const g = runReviewGuard('WMC Group BV is the owner', 'the owner is a Dutch company', ctx.entityNames);
    expect(g.ok).toBe(false);
    expect(g.failures.join(' ')).toContain('WMC Group BV');
  });
  it('allows de-duplication to shorten (a fact moved to the referenced row stays in the whole)', () => {
    // The aggregate before/after both contain the number; one row shortened to a cross-ref.
    const before = 'Row A: results allocated to WMC Group BV, USD 61,667.\nRow B: results allocated to WMC Group BV, USD 61,667 again.';
    const after = 'Row A: results allocated to WMC Group BV, USD 61,667.\nRow B: as addressed under art. 12aa(1)(b).';
    expect(runReviewGuard(before, after, ctx.entityNames).ok).toBe(true);
  });
  it('fails a rewrite that guts the text', () => {
    expect(runReviewGuard('a fairly long grounded paragraph about the structure', 'ok', ctx.entityNames).ok).toBe(false);
  });
});

describe('reviewAppendix', () => {
  it('applies tightened reasoning for editable rows that survive the guard', async () => {
    const result = await reviewAppendix(rows, ctx, async () =>
      JSON.stringify({
        rows: [{ rowId: '3.5', reasoning: 'As addressed under art. 12aa(1)(b), the results of WMC Global Services BV and WMC Energy BV are allocated to WMC Group BV, so no shareholder jurisdiction gets an exclusion.' }],
        contradictions: [],
      }),
    );
    expect(result.status).toBe('reviewed');
    expect(result.rows.map((r) => r.rowId)).toEqual(['3.5']);
  });

  it('ignores a rewrite aimed at a non-editable (context) row', async () => {
    const result = await reviewAppendix(rows, ctx, async () =>
      JSON.stringify({ rows: [{ rowId: '6.1', reasoning: 'A rewrite of a context-only row.' }], contradictions: [] }),
    );
    // 6.1 is context-only, so nothing is changed; nothing to ship.
    expect(result.rows).toEqual([]);
  });

  it('surfaces unresolved contradictions as warnings', async () => {
    const result = await reviewAppendix(rows, ctx, async () =>
      JSON.stringify({ rows: [], contradictions: ['2.1 concludes the parties are associated but 6.1 says no related-party payment'] }),
    );
    expect(result.warnings).toHaveLength(1);
  });

  it('keeps the untouched rows when the model call throws', async () => {
    const result = await reviewAppendix(rows, ctx, async () => { throw new Error('boom'); });
    expect(result.status).toBe('skipped');
    expect(result.rows).toEqual([]);
  });

  it('rejects a rewrite that reintroduces a meta/apology sentence', async () => {
    const result = await reviewAppendix(rows, ctx, async () =>
      JSON.stringify({ rows: [{ rowId: '3.2', reasoning: 'The model did not return a grounded answer; confirm manually.' }], contradictions: [] }),
    );
    expect(result.rows).toEqual([]);
  });

  it('skips when there are fewer than two editable rows', async () => {
    const result = await reviewAppendix([rows[0], { ...rows[2] }], ctx, async () => '{"rows":[]}');
    expect(result.status).toBe('skipped');
  });
});

describe('buildReviewSystemPrompt', () => {
  it('carries the wording rules and the grounding facts', () => {
    const p = buildReviewSystemPrompt(ctx);
    expect(p).toContain('blocker entity');
    expect(p).toContain('is allocated to');
    expect(p).toContain('As addressed under art.');
    expect(p).toContain('WMC Energy Corp');
  });
});
