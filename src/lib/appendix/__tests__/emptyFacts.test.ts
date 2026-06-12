import { describe, it, expect } from 'vitest';
import { emptyFacts, normalizeFacts } from '@/lib/appendix/facts/emptyFacts';

describe('facts normalization', () => {
  it('emptyFacts has all four arrays', () => {
    expect(emptyFacts()).toEqual({ entities: [], actingTogether: [], classifications: [], transactions: [] });
  });
  it('normalizeFacts fills missing arrays from partial/legacy data', () => {
    expect(normalizeFacts(null)).toEqual(emptyFacts());
    expect(normalizeFacts({ entities: [{ id: 'E1' }] } as never).actingTogether).toEqual([]);
  });
});
