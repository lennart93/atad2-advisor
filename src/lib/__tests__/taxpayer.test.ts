import { describe, it, expect } from 'vitest';
import {
  parseTaxpayerNames,
  formatTaxpayerNames,
  taxpayerDisplayName,
  dedupeEntityNames,
  taxpayerSubjectLabel,
} from '@/lib/taxpayer';

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

describe('dedupeEntityNames', () => {
  it('collapses case-insensitive duplicates, first spelling wins', () => {
    expect(dedupeEntityNames(['Foo B.V.', 'foo b.v.', 'Bar GmbH'])).toEqual([
      'Foo B.V.',
      'Bar GmbH',
    ]);
  });

  it('drops blank entries and trims', () => {
    expect(dedupeEntityNames([' Foo B.V. ', '  ', 'Foo B.V.'])).toEqual(['Foo B.V.']);
  });
});

describe('taxpayerSubjectLabel', () => {
  it('shows a single entity verbatim', () => {
    expect(taxpayerSubjectLabel('Solo B.V.')).toBe('Solo B.V.');
  });

  it('uses singular "other" for exactly two entities', () => {
    expect(taxpayerSubjectLabel('Foo B.V.\nBar GmbH')).toBe('Foo B.V. and 1 other');
  });

  it('uses plural "others" for three or more', () => {
    expect(taxpayerSubjectLabel('Foo B.V.\nBar GmbH\nBaz Ltd')).toBe('Foo B.V. and 2 others');
  });

  it('counts deduplicated names, not raw rows', () => {
    expect(taxpayerSubjectLabel('Foo B.V.\nFoo B.V.\nBar GmbH')).toBe('Foo B.V. and 1 other');
  });

  it('is empty for blank or missing values', () => {
    expect(taxpayerSubjectLabel(null)).toBe('');
    expect(taxpayerSubjectLabel('  \n ')).toBe('');
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
