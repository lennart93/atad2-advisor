import { describe, it, expect } from 'vitest';
import { combinedInterest, crossesThreshold } from '@/lib/appendix/facts/actingTogether';
import type { FactEntity } from '@/lib/appendix/types';

const fe = (id: string, pct: number | null): FactEntity =>
  ({ id, chartEntityId: id, name: id, jurisdiction: 'NL', entityType: 'fund',
     role: 'Parent', ownershipPct: pct, related: false, nlTaxStatus: null });

describe('acting-together math', () => {
  it('sums member interests, treating unknowns as 0', () => {
    expect(combinedInterest(['E3', 'E4'], [fe('E3', 33.76), fe('E4', 28.86)])).toBeCloseTo(62.62);
    expect(combinedInterest(['E3', 'E5'], [fe('E3', 10), fe('E5', null)])).toBe(10);
  });
  it('flags when the combined interest crosses 25%', () => {
    expect(crossesThreshold(['E5', 'E6'], [fe('E5', 9.18), fe('E6', 9.74)])).toBe(false);
    expect(crossesThreshold(['E3', 'E4'], [fe('E3', 20), fe('E4', 10)])).toBe(true);
  });
});
