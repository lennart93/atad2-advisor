import { describe, it, expect } from 'vitest';
import { computeQuality } from '../qualityMeter';
import type { SessionDocument } from '../types';

function doc(overrides: Partial<SessionDocument> = {}): SessionDocument {
  return {
    id: crypto.randomUUID(),
    session_id: 'sess',
    filename: 'x.pdf',
    doc_label: 'x',
    category: 'financial_statements',
    storage_path: 'x',
    mime_type: 'application/pdf',
    size_bytes: 1000,
    status: 'uploaded',
    error_message: null,
    relevance_note: null,
    created_at: new Date().toISOString(),
    is_thin: false,
    category_source: 'ai',
    ...overrides,
  };
}

describe('computeQuality', () => {
  it('returns Empty when no docs', () => {
    const q = computeQuality([]);
    expect(q.tier).toBe('empty');
    expect(q.segments).toBe(0);
    expect(q.distinctCategories).toEqual([]);
  });

  it('returns Good for 1 qualifying doc', () => {
    const q = computeQuality([doc({ category: 'financial_statements' })]);
    expect(q.tier).toBe('good');
    expect(q.segments).toBe(2);
  });

  it('returns Strong for 2 distinct categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.tier).toBe('strong');
    expect(q.segments).toBe(3);
  });

  it('returns Excellent for 3+ distinct categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
      doc({ category: 'structure_chart' }),
    ]);
    expect(q.tier).toBe('excellent');
    expect(q.segments).toBe(4);
  });

  it('does not double-count duplicate categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'financial_statements' }),
      doc({ category: 'financial_statements' }),
    ]);
    expect(q.tier).toBe('good');
    expect(q.distinctCategories).toEqual(['financial_statements']);
  });

  it('"other" docs still trigger Good (bar always fills on upload)', () => {
    const q = computeQuality([
      doc({ category: 'other' }),
      doc({ category: 'other' }),
    ]);
    expect(q.tier).toBe('good');
    // ...but they don't add diversity, so distinctCategories stays empty
    expect(q.distinctCategories).toEqual([]);
  });

  it('"other" does not push past Good even with multiple essentials', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'other' }),
    ]);
    expect(q.tier).toBe('good');
    expect(q.distinctCategories).toEqual(['financial_statements']);
  });

  it('hint is empty for all-"other" Good (suggestion text was removed)', () => {
    expect(computeQuality([doc({ category: 'other' })]).hint).toBe('');
  });

  it('ignores thin docs', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements', is_thin: true }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.tier).toBe('good');
    expect(q.distinctCategories).toEqual(['tax_returns']);
  });

  it('treats all-thin docs as Empty', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements', is_thin: true }),
      doc({ category: 'tax_returns', is_thin: true }),
    ]);
    expect(q.tier).toBe('empty');
  });

  it('hint at Empty asks for a document', () => {
    expect(computeQuality([]).hint).toMatch(/add a document/i);
  });

  it('hint at Good is empty (no suggestion text)', () => {
    expect(computeQuality([doc({ category: 'financial_statements' })]).hint).toBe('');
  });

  it('hint at Strong is empty (no suggestion text)', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.hint).toBe('');
  });

  it('hint at Excellent is empty (no suggestion text)', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
      doc({ category: 'structure_chart' }),
    ]);
    expect(q.hint).toBe('');
  });

  it('missingTypes at Good excludes already-present', () => {
    const q = computeQuality([doc({ category: 'financial_statements' })]);
    expect(q.missingTypes).not.toContain('financial_statements');
    expect(q.missingTypes.length).toBeGreaterThan(0);
  });
});
