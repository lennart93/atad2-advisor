import { describe, it, expect } from 'vitest';
import { defaultClassification, defaultNlClassification } from '@/lib/appendix/classificationDefaults';

// The deterministic corporate-form defaults (home-state view + NL view). The
// statutory suffix normally sits in the entity NAME; callers pass name + chart
// entity type as one string.

describe('defaultClassification - well-known corporate suffixes (home-state view)', () => {
  it('classifies the common European capital forms as non-transparent', () => {
    expect(defaultClassification('LU', 'Duhco S.A. corporation')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('LU', 'D.R.C. S.A.')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('LU', 'Finco S.à r.l.')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('BE', 'Duvel Moortgat N.V. corporation')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('BE', 'Brouwerij BVBA')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('DE', 'Brau GmbH')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('DE', 'Brau AG')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('CN', 'Duvel Moortgat Shanghai Ltd. corporation')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('GB', 'Beer Group Plc')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('IT', 'Birra S.p.A.')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('FR', 'Brasserie SAS')?.homeClass).toBe('non-transparent');
  });

  it('keeps every default a proposal (verify: true) with a grounded basis', () => {
    const d = defaultClassification('LU', 'Duhco S.A.');
    expect(d?.verify).toBe(true);
    expect(d?.basis).toMatch(/S\.A\./);
    expect(d?.basis).toMatch(/non-transparent under its own law/);
  });

  it('never fires on partnership-like or hybrid suffixes, even with a corporate chart type', () => {
    expect(defaultClassification('LU', 'Fund SCS corporation')).toBeNull();
    expect(defaultClassification('LU', 'Fund SCSp')).toBeNull();
    expect(defaultClassification('LU', 'Holdco S.C.A.')).toBeNull();
    expect(defaultClassification('DE', 'Beteiligungs KG')).toBeNull();
    expect(defaultClassification('DE', 'Holding KGaA corporation')).toBeNull();
    expect(defaultClassification('GB', 'Advisors LLP')).toBeNull();
    expect(defaultClassification('KY', 'Feeder LP corporation')).toBeNull();
  });

  it('keeps the specific US rules ahead of the generic fallback', () => {
    // The US per-se rule still fires on the chart entity type alone.
    expect(defaultClassification('US', 'Brewery Ommegang corporation')?.basis).toMatch(/per-se/);
    // A US LLC stays the member-count judgment call, name notwithstanding.
    expect(defaultClassification('US', 'Delaware Holdings LLC corporation')?.homeClass).toBe('disregarded');
  });

  it('does not fire on a bare foreign chart type or an unrecognised form', () => {
    // Lower-case "corporation" is the chart type, not a statutory suffix.
    expect(defaultClassification('DE', 'Foreign Co corporation')).toBeNull();
    expect(defaultClassification('BE', 'Mystery Vorm')).toBeNull();
  });

  it('respects jurisdiction restrictions on the ambiguous short tokens', () => {
    expect(defaultClassification('SE', 'Bryggeri AB')?.homeClass).toBe('non-transparent');
    // "AB" outside SE/FI is too ambiguous to default.
    expect(defaultClassification('US', 'AB Holdings')).toBeNull();
    // "AG" only in the German-speaking jurisdictions.
    expect(defaultClassification('AT', 'Brau AG')?.homeClass).toBe('non-transparent');
    expect(defaultClassification('US', 'Silver AG')).toBeNull();
  });

  it('never fires for a Dutch entity', () => {
    expect(defaultClassification('NL', 'Duhco Nederland B.V. corporation')).toBeNull();
  });
});

describe('defaultNlClassification - NL view (naar Nederlandse maatstaven)', () => {
  it('places a well-known corporate form as non-transparent, with the comparison as basis', () => {
    const lu = defaultNlClassification('LU', 'Duhco S.A. corporation');
    expect(lu?.verify).toBe(true);
    expect(lu?.basis).toMatch(/comparable to a Dutch N\.V\./);
    expect(lu?.basis).toMatch(/non-transparent for Dutch tax purposes/);
    expect(defaultNlClassification('BE', 'Duvel Moortgat N.V.')).not.toBeNull();
    expect(defaultNlClassification('DE', 'Brau GmbH')).not.toBeNull();
    expect(defaultNlClassification('CN', 'Duvel Moortgat Shanghai Ltd.')).not.toBeNull();
  });

  it('leaves the year-dependent and unknown forms to the model and the advisor', () => {
    expect(defaultNlClassification('US', 'Delaware Holdings LLC corporation')).toBeNull();
    expect(defaultNlClassification('LU', 'Fund SCSp')).toBeNull();
    expect(defaultNlClassification('LU', 'Holdco S.C.A.')).toBeNull();
    expect(defaultNlClassification('BE', 'Mystery Vorm')).toBeNull();
    // The bare chart type is not a statutory form.
    expect(defaultNlClassification('US', 'Brewery Ommegang corporation')).toBeNull();
  });

  it('never fires for a Dutch or jurisdiction-less entity', () => {
    expect(defaultNlClassification('NL', 'Duhco Nederland B.V.')).toBeNull();
    expect(defaultNlClassification(null, 'Duhco S.A.')).toBeNull();
    expect(defaultNlClassification('', 'Duhco S.A.')).toBeNull();
  });

  it('does not mistake ordinary words for the ambiguous short suffixes', () => {
    expect(defaultNlClassification('US', 'Salsa Brands corporation')).toBeNull();
    expect(defaultNlClassification('US', 'USA Holdings corporation')).toBeNull();
    expect(defaultNlClassification('BE', 'Inventive Brewing corporation')).toBeNull();
  });
});
