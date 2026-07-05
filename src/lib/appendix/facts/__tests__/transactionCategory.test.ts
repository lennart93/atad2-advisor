import { describe, it, expect } from 'vitest';
import { shortTransactionType } from '@/lib/appendix/facts/transactionCategory';

describe('shortTransactionType', () => {
  it('maps verbose financing flows to Financing', () => {
    expect(shortTransactionType('Interest receipt on loans')).toBe('Financing');
    expect(shortTransactionType('Loan I and Loan II')).toBe('Financing');
    expect(shortTransactionType('financing')).toBe('Financing');
  });

  it('maps intra-group flows to Intra-group, before the financing check', () => {
    expect(shortTransactionType('Intra-group financing')).toBe('Intra-group');
    expect(shortTransactionType('Intercompany loan')).toBe('Intra-group');
    expect(shortTransactionType('Within the fiscal unity')).toBe('Intra-group');
  });

  it('maps equity and dividend flows to Equity', () => {
    expect(shortTransactionType('Equity contribution')).toBe('Equity');
    expect(shortTransactionType('Dividend distribution')).toBe('Equity');
    expect(shortTransactionType('dividend')).toBe('Equity');
  });

  it('maps services and management fees', () => {
    expect(shortTransactionType('Service agreement')).toBe('Services');
    expect(shortTransactionType('Consultancy services')).toBe('Services');
    expect(shortTransactionType('Management fee')).toBe('Management fee');
  });

  it('maps royalties', () => {
    expect(shortTransactionType('Royalty payment on IP licence')).toBe('Royalties');
  });

  it('keeps an unrecognised kind rather than inventing a category', () => {
    expect(shortTransactionType('Bespoke arrangement')).toBe('Bespoke arrangement');
  });

  it('returns an empty string for empty or missing input', () => {
    expect(shortTransactionType('')).toBe('');
    expect(shortTransactionType(null)).toBe('');
    expect(shortTransactionType(undefined)).toBe('');
  });
});
