import { describe, it, expect } from 'vitest';
import {
  truncateForTicker,
  buildTickerPool,
  pickTickerLine,
  type TickerInputs,
  type TickerPhase,
} from '../analysisNarrative';

function inputs(overrides: Partial<TickerInputs> = {}): TickerInputs {
  return {
    categories: [],
    prefillCount: 0,
    totalQuestions: null,
    clientQuestionCount: 0,
    teasers: [],
    ...overrides,
  };
}

describe('truncateForTicker', () => {
  it('returns trimmed text unchanged when at or under the limit', () => {
    expect(truncateForTicker('  short text  ')).toBe('short text');
    expect(truncateForTicker('x'.repeat(80))).toBe('x'.repeat(80));
  });

  it('cuts at max minus 3 and appends three ASCII dots when over the limit', () => {
    const long = 'a'.repeat(100);
    const out = truncateForTicker(long);
    expect(out).toBe('a'.repeat(77) + '...');
    expect(out.length).toBe(80);
  });

  it('respects a custom max', () => {
    expect(truncateForTicker('abcdefghij', 8)).toBe('abcde...');
    expect(truncateForTicker('abcdefgh', 8)).toBe('abcdefgh');
  });
});

describe('buildTickerPool: analyzing', () => {
  it('maps known categories to lowercased labels with order-preserving dedupe', () => {
    const pool = buildTickerPool(
      'analyzing',
      inputs({
        categories: [
          'tax_returns',
          'financial_statements',
          'tax_returns',
          'memo',
        ],
      }),
    );
    expect(pool).toEqual([
      'Reading the tax returns...',
      'Reading the financial statements...',
      'Reading the memo...',
    ]);
  });

  it('falls back to the documents label for unknown category values', () => {
    const pool = buildTickerPool(
      'analyzing',
      inputs({ categories: ['something_else'] }),
    );
    expect(pool).toEqual(['Reading the documents...']);
  });

  it('returns an empty pool when there is nothing real to report', () => {
    expect(buildTickerPool('analyzing', inputs())).toEqual([]);
  });

  it('adds the checks counter only when total is known and prefills landed', () => {
    expect(
      buildTickerPool(
        'analyzing',
        inputs({ prefillCount: 7, totalQuestions: 49 }),
      ),
    ).toContain('7 of 49 checks done');
    expect(
      buildTickerPool(
        'analyzing',
        inputs({ prefillCount: 0, totalQuestions: 49 }),
      ),
    ).toEqual([]);
    expect(
      buildTickerPool(
        'analyzing',
        inputs({ prefillCount: 7, totalQuestions: null }),
      ),
    ).toEqual([]);
  });

  it('adds the client question counter with singular and plural forms', () => {
    expect(
      buildTickerPool('analyzing', inputs({ clientQuestionCount: 1 })),
    ).toContain('1 client question so far');
    expect(
      buildTickerPool('analyzing', inputs({ clientQuestionCount: 3 })),
    ).toContain('3 client questions so far');
    expect(
      buildTickerPool('analyzing', inputs({ clientQuestionCount: 0 })),
    ).toEqual([]);
  });

  it('keeps only the last 3 non-empty teasers, truncated, after the fixed prefix', () => {
    const pool = buildTickerPool(
      'analyzing',
      inputs({ teasers: ['one', '', '  ', 'two', 'three', 'c'.repeat(120)] }),
    );
    expect(pool).toEqual([
      'Found something for the client: two',
      'Found something for the client: three',
      'Found something for the client: ' + 'c'.repeat(77) + '...',
    ]);
  });

  it('orders the pool: categories, checks counter, question counter, teasers', () => {
    const pool = buildTickerPool(
      'analyzing',
      inputs({
        categories: ['memo'],
        prefillCount: 2,
        totalQuestions: 10,
        clientQuestionCount: 1,
        teasers: ['Could you confirm the CV is transparent?'],
      }),
    );
    expect(pool).toEqual([
      'Reading the memo...',
      '2 of 10 checks done',
      '1 client question so far',
      'Found something for the client: Could you confirm the CV is transparent?',
    ]);
  });
});

describe('buildTickerPool: wording', () => {
  it('always writes the wording line', () => {
    expect(buildTickerPool('wording', inputs())).toEqual([
      'Writing client questions...',
    ]);
  });

  it('adds the question counter when positive', () => {
    expect(
      buildTickerPool('wording', inputs({ clientQuestionCount: 2 })),
    ).toEqual(['Writing client questions...', '2 client questions so far']);
  });

  it('ignores categories and teasers in the wording phase', () => {
    expect(
      buildTickerPool(
        'wording',
        inputs({ categories: ['memo'], teasers: ['something'] }),
      ),
    ).toEqual(['Writing client questions...']);
  });
});

describe('buildTickerPool: composing', () => {
  it('returns the fixed composing lines regardless of inputs', () => {
    const expected = [
      'Merging shared context...',
      'Drafting your client letter...',
    ];
    expect(buildTickerPool('composing', inputs())).toEqual(expected);
    expect(
      buildTickerPool(
        'composing',
        inputs({
          categories: ['memo'],
          prefillCount: 5,
          totalQuestions: 10,
          clientQuestionCount: 2,
          teasers: ['something'],
        }),
      ),
    ).toEqual(expected);
  });
});

describe('pickTickerLine', () => {
  it('returns null for an empty pool', () => {
    expect(pickTickerLine([], 0)).toBeNull();
    expect(pickTickerLine([], 5)).toBeNull();
  });

  it('rotates through the pool and wraps around', () => {
    const pool = ['a', 'b', 'c'];
    expect(pickTickerLine(pool, 0)).toBe('a');
    expect(pickTickerLine(pool, 1)).toBe('b');
    expect(pickTickerLine(pool, 2)).toBe('c');
    expect(pickTickerLine(pool, 3)).toBe('a');
    expect(pickTickerLine(pool, 7)).toBe('b');
  });
});

describe('ticker never leaks question ids', () => {
  const phases: TickerPhase[] = ['analyzing', 'wording', 'composing'];
  const loaded = inputs({
    categories: ['tax_returns', 'unknown_value', 'memo'],
    prefillCount: 12,
    totalQuestions: 49,
    clientQuestionCount: 4,
    teasers: [
      'We understand that the BV holds the loan. Could you please confirm?',
      'Could you confirm whether the CV is treated as transparent in the US?',
      'Please share the intercompany loan agreement for FY2025.',
    ],
  });

  it('no line in any phase mentions a question followed by an id-like token', () => {
    for (const phase of phases) {
      for (const line of buildTickerPool(phase, loaded)) {
        expect(line).not.toMatch(/question\s+(Q?\d|#|id)/i);
      }
    }
  });

  it('teaser lines only ever embed teaser text after the fixed prefix', () => {
    const pool = buildTickerPool('analyzing', loaded);
    const teaserLines = pool.filter((l) => l.startsWith('Found something'));
    expect(teaserLines.length).toBe(3);
    for (const line of teaserLines) {
      const tail = line.replace('Found something for the client: ', '');
      expect(loaded.teasers).toContain(tail);
    }
  });
});
