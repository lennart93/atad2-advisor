import { describe, it, expect } from 'vitest';
import { parseTaxpayerNames, formatTaxpayerNames, taxpayerDisplayName } from '@/lib/taxpayer';

describe('parseTaxpayerNames', () => {
  it('returns one name for a single-entity (legacy) value', () => {
    expect(parseTaxpayerNames('Acme Holding B.V.')).toEqual(['Acme Holding B.V.']);
  });

  it('keeps a comma inside a single legal name intact', () => {
    expect(parseTaxpayerNames('Company, Inc.')).toEqual(['Company, Inc.']);
  });

  it('splits a multi-entity value on newlines and trims blanks', () => {
    expect(parseTaxpayerNames('Foo B.V.\nBar GmbH\n\n')).toEqual(['Foo B.V.', 'Bar GmbH']);
  });

  it('handles CRLF and null/undefined', () => {
    expect(parseTaxpayerNames('A\r\nB')).toEqual(['A', 'B']);
    expect(parseTaxpayerNames(null)).toEqual([]);
    expect(parseTaxpayerNames(undefined)).toEqual([]);
  });
});

describe('formatTaxpayerNames', () => {
  it('joins names with newlines and drops blank rows', () => {
    expect(formatTaxpayerNames(['Foo B.V.', '', '  ', 'Bar GmbH'])).toBe('Foo B.V.\nBar GmbH');
  });

  it('round-trips with parse', () => {
    const names = ['Company, Inc.', 'Holding B.V.'];
    expect(parseTaxpayerNames(formatTaxpayerNames(names))).toEqual(names);
  });

  it('stores a single entity without a newline', () => {
    expect(formatTaxpayerNames(['Solo B.V.'])).toBe('Solo B.V.');
  });
});

describe('taxpayerDisplayName', () => {
  it('shows one name verbatim', () => {
    expect(taxpayerDisplayName('Solo B.V.')).toBe('Solo B.V.');
  });

  it('joins multiple names with commas', () => {
    expect(taxpayerDisplayName('Foo B.V.\nBar GmbH')).toBe('Foo B.V., Bar GmbH');
  });

  it('is empty for an empty value', () => {
    expect(taxpayerDisplayName('')).toBe('');
    expect(taxpayerDisplayName(null)).toBe('');
  });
});
