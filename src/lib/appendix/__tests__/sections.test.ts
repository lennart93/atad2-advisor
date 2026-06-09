import { describe, it, expect } from 'vitest';
import { isSectionExcluded, withSectionExcluded, APPENDIX_SECTIONS } from '@/lib/appendix/facts/sections';
import { emptyFacts, normalizeFacts } from '@/lib/appendix/facts/emptyFacts';

describe('appendix section exclusion', () => {
  it('toggles a section in and out immutably', () => {
    const f0 = emptyFacts();
    expect(isSectionExcluded(f0, 'actingTogether')).toBe(false);
    const f1 = withSectionExcluded(f0, 'actingTogether', true);
    expect(isSectionExcluded(f1, 'actingTogether')).toBe(true);
    expect(isSectionExcluded(f0, 'actingTogether')).toBe(false); // original untouched
    const f2 = withSectionExcluded(f1, 'actingTogether', false);
    expect(isSectionExcluded(f2, 'actingTogether')).toBe(false);
  });

  it('does not duplicate a key when excluded twice', () => {
    let f = withSectionExcluded(emptyFacts(), 'transactions', true);
    f = withSectionExcluded(f, 'transactions', true);
    expect(f.excludedSections).toEqual(['transactions']);
  });

  it('survives a load round-trip through normalizeFacts', () => {
    const f = withSectionExcluded(emptyFacts(), 'relatedness', true);
    const reloaded = normalizeFacts(JSON.parse(JSON.stringify(f)));
    expect(reloaded.excludedSections).toEqual(['relatedness']);
  });

  it('covers exactly the five Part A exhibits', () => {
    expect(APPENDIX_SECTIONS.map((s) => s.key)).toEqual([
      'entityRegister', 'relatedness', 'actingTogether', 'classification', 'transactions',
    ]);
  });
});
