import { describe, it, expect } from 'vitest';
// The memo review core lives in the edge function but is pure (no Deno / network),
// so it is imported here by relative path and unit-tested under vitest.
import {
  runGuard,
  sanitize,
  buildAppendixSummary,
  buildReviewContext,
  reviewMemo,
  type ReviewContext,
  type RawAppendix,
} from '../../../../supabase/functions/review-memo/reviewMemo';

const DRAFT = `**Introduction**

ATAD2 concerns hybrid mismatches. This memo assesses S4 Energy BV.

---

**Executive summary**

Since 5 January 2023, S4 Energy BV is held 100% by Castleton Commodities International LLC. A D/NI or DD outcome under art. 12aa cannot be ruled out. The parent injected EUR 5 million.

---

**Conclusion and next steps**

A potential ATAD2 risk has been identified for S4 Energy BV.`;

// A faithful rewrite: every header, divider, number, citation, entity name and
// critical keyword is preserved; only the prose is reworded.
const FAITHFUL_POLISH = `**Introduction**

ATAD2 targets hybrid mismatches. This memo assesses S4 Energy BV.

---

**Executive summary**

S4 Energy BV has been held 100% by Castleton Commodities International LLC since 5 January 2023. Under art. 12aa a D/NI or DD outcome cannot be ruled out. The parent injected EUR 5 million into the company. ATAD2 applies.

---

**Conclusion and next steps**

A potential ATAD2 risk has been identified for S4 Energy BV.`;

const CTX: ReviewContext = {
  taxpayerName: 'S4 Energy BV',
  entityNames: ['S4 Energy BV', 'Castleton Commodities International LLC'],
  appendix: null,
};

describe('runGuard', () => {
  it('passes a faithful rewrite', () => {
    const r = runGuard(DRAFT, FAITHFUL_POLISH, CTX);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('fails when a number is dropped', () => {
    const polish = FAITHFUL_POLISH.replace('5 January 2023', 'January last year');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('missing numbers');
    expect(r.failures.join(' ')).toContain('2023');
  });

  it('fails when a section header is renamed', () => {
    const polish = FAITHFUL_POLISH.replace('**Executive summary**', '**Summary of findings**');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('headers changed');
  });

  it('fails when a --- divider is removed', () => {
    const polish = FAITHFUL_POLISH.replace('\n---\n', '\n');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('dividers');
  });

  it('fails when a statutory reference is dropped', () => {
    const polish = FAITHFUL_POLISH.replace('art. 12aa', 'the relevant article');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('12aa');
  });

  it('fails when an entity name is dropped', () => {
    const polish = FAITHFUL_POLISH.replace(/Castleton Commodities International LLC/g, 'the US parent');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('missing entity names');
  });

  it('fails when a critical keyword is dropped', () => {
    const polish = FAITHFUL_POLISH.replace('D/NI or DD', 'a mismatch');
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('missing terms');
  });

  it('fails on a placeholder leak', () => {
    const polish = FAITHFUL_POLISH + '\n\n{{appendicesXml}}';
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('placeholder');
  });

  it('fails when the rewrite is truncated', () => {
    const polish = DRAFT.slice(0, 40);
    const r = runGuard(DRAFT, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('length');
  });
});

describe('runGuard with <u> headers (the real memo style)', () => {
  const uDraft = `**ATAD2 assessment memorandum**

<u>Introduction</u>

ATAD2 targets hybrid mismatches for S4 Energy BV.

<u>Executive summary</u>

Held 100% since 5 January 2023. A D/NI outcome under art. 12aa cannot be ruled out.

<u>Conclusion and next steps</u>

A potential ATAD2 risk has been identified for S4 Energy BV.`;

  it('passes when the <u> headers are preserved', () => {
    const polish = uDraft.replace('ATAD2 targets hybrid mismatches', 'ATAD2 concerns hybrid mismatches');
    expect(runGuard(uDraft, polish, CTX).ok).toBe(true);
  });

  it('fails when a <u> header is renamed', () => {
    const polish = uDraft.replace('<u>Executive summary</u>', '<u>Summary</u>');
    const r = runGuard(uDraft, polish, CTX);
    expect(r.ok).toBe(false);
    expect(r.failures.join(' ')).toContain('headers changed');
  });

  it('fails when a <u> header is dropped', () => {
    const polish = uDraft.replace('<u>Conclusion and next steps</u>\n\n', '');
    expect(runGuard(uDraft, polish, CTX).ok).toBe(false);
  });
});

describe('sanitize', () => {
  const ctx: ReviewContext = {
    taxpayerName: 'S4 Energy BV',
    entityNames: ['S4 Energy BV'],
    appendix: {
      factsAttached: true,
      checklistAttached: false,
      entities: [{ id: 'E1', name: 'S4 Energy BV', jurisdiction: 'NL', classification: 'non-transparent' }],
      transactions: [{ id: 'T1', fromName: 'S4 Energy BV', toName: 'US Parent', kind: 'financing' }],
      tally: null,
    },
  };

  it('replaces em dashes', () => {
    expect(sanitize('A — B', ctx)).toBe('A, B');
  });

  it('keeps a valid Appendix 1 reference', () => {
    const out = sanitize('The company (see Appendix 1, no. E1) is Dutch.', ctx);
    expect(out).toContain('(see Appendix 1, no. E1)');
  });

  it('drops an Appendix 1 reference to an unknown id', () => {
    const out = sanitize('The company (see Appendix 1, no. E9) is Dutch.', ctx);
    expect(out).not.toContain('E9');
    expect(out).toBe('The company is Dutch.');
  });

  it('drops an Appendix 2 reference when the checklist is not attached', () => {
    const out = sanitize('This is tested (see Appendix 2, art. 12aa) further.', ctx);
    expect(out).not.toContain('Appendix 2');
  });
});

describe('buildAppendixSummary', () => {
  it('says none are attached when there is no appendix', () => {
    expect(buildAppendixSummary(null)).toContain('No appendices are attached');
  });

  it('lists real entity and transaction ids to reference', () => {
    const summary = buildAppendixSummary({
      factsAttached: true,
      checklistAttached: true,
      entities: [{ id: 'E2', name: 'Castleton Commodities International LLC', jurisdiction: 'US', classification: null }],
      transactions: [{ id: 'T1', fromName: 'S4 Energy BV', toName: 'Castleton Commodities International LLC', kind: 'financing' }],
      tally: { triggered: 2, insufficient: 1 },
    });
    expect(summary).toContain('E2  Castleton Commodities International LLC (US, classification not set)');
    expect(summary).toContain('T1  S4 Energy BV -> Castleton Commodities International LLC (financing)');
    expect(summary).toContain('2 condition(s) triggered');
  });
});

describe('buildReviewContext', () => {
  const raw: RawAppendix = {
    facts: {
      entities: [
        { id: 'E1', name: 'S4 Energy BV', jurisdiction: 'NL', nlTaxStatus: 'non-transparent' },
        { id: 'E2', name: 'Castleton Commodities International LLC', jurisdiction: 'US', nlTaxStatus: null },
        { id: 'E3', name: 'Hidden Co', hidden: true },
      ],
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'financing' },
        { id: 'T2', fromEntityId: 'E1', toEntityId: 'E3', kind: 'service', excludedFromClient: true },
      ],
    },
    rows: [
      { status: 'Triggered' },
      { status: 'Insufficient information' },
      { status: 'Not triggered', excludedFromClient: true },
    ],
    facts_skipped: false,
    checklist_skipped: false,
  };

  it('drops hidden entities and excluded transactions', () => {
    const ctx = buildReviewContext('S4 Energy BV', raw);
    expect(ctx.appendix?.entities.map((e) => e.id)).toEqual(['E1', 'E2']);
    expect(ctx.appendix?.transactions.map((t) => t.id)).toEqual(['T1']);
    expect(ctx.appendix?.transactions[0].toName).toBe('Castleton Commodities International LLC');
  });

  it('sets attach flags and a status tally', () => {
    const ctx = buildReviewContext('S4 Energy BV', raw);
    expect(ctx.appendix?.factsAttached).toBe(true);
    expect(ctx.appendix?.checklistAttached).toBe(true);
    expect(ctx.appendix?.tally).toEqual({ triggered: 1, insufficient: 1 });
  });

  it('collects entity names for the guard, excluding hidden ones', () => {
    const ctx = buildReviewContext('S4 Energy BV', raw);
    expect(ctx.entityNames).toContain('S4 Energy BV');
    expect(ctx.entityNames).toContain('Castleton Commodities International LLC');
    expect(ctx.entityNames).not.toContain('Hidden Co');
  });

  it('returns a null appendix when facts are absent', () => {
    const ctx = buildReviewContext('S4 Energy BV', { facts: null });
    expect(ctx.appendix).toBeNull();
    expect(ctx.entityNames).toEqual(['S4 Energy BV']);
  });

  it('marks Appendix 1 not attached when facts are skipped', () => {
    const ctx = buildReviewContext('S4 Energy BV', { ...raw, facts_skipped: true });
    expect(ctx.appendix?.factsAttached).toBe(false);
  });
});

describe('reviewMemo', () => {
  it('returns the polished text when the rewrite survives the guard', async () => {
    const result = await reviewMemo(DRAFT, CTX, async () => FAITHFUL_POLISH);
    expect(result.status).toBe('polished');
    expect(result.markdown).toBe(FAITHFUL_POLISH);
  });

  it('retries once then keeps the draft when the rewrite keeps failing', async () => {
    let calls = 0;
    const result = await reviewMemo(DRAFT, CTX, async () => {
      calls++;
      return 'I rewrote everything and dropped the numbers.';
    });
    expect(calls).toBe(2);
    expect(result.status).toBe('skipped');
    expect(result.markdown).toBe(DRAFT);
  });

  it('keeps the draft when the model call throws', async () => {
    const result = await reviewMemo(DRAFT, CTX, async () => {
      throw new Error('network down');
    });
    expect(result.status).toBe('skipped');
    expect(result.markdown).toBe(DRAFT);
    expect(result.failures.join(' ')).toContain('network down');
  });

  it('strips a markdown code fence the model may add', async () => {
    const fenced = '```markdown\n' + FAITHFUL_POLISH + '\n```';
    const result = await reviewMemo(DRAFT, CTX, async () => fenced);
    expect(result.status).toBe('polished');
    expect(result.markdown).toBe(FAITHFUL_POLISH);
  });
});
