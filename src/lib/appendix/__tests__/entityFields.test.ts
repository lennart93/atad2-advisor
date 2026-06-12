import { describe, it, expect } from 'vitest';
import { effJurisdiction, effEntityType, effNlTaxStatus, withEntityEdit } from '@/lib/appendix/facts/entityFields';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { FactEntity } from '@/lib/appendix/types';

const base: FactEntity = {
  id: 'E2', chartEntityId: 'c2', name: 'Foreign Co', jurisdiction: 'DE', entityType: 'corporation',
  role: 'Subsidiary', ownershipPct: 100, related: true, nlTaxStatus: 'resident',
};

describe('effective field accessors', () => {
  it('return the base value when there is no edit', () => {
    expect(effJurisdiction(base)).toBe('DE');
    expect(effEntityType(base)).toBe('corporation');
    expect(effNlTaxStatus(base)).toBe('resident');
  });
  it('let an advisor edit win over the base', () => {
    const edited: FactEntity = { ...base, edits: { jurisdiction: 'LU', nlTaxStatus: 'transparent' } };
    expect(effJurisdiction(edited)).toBe('LU');
    expect(effEntityType(edited)).toBe('corporation'); // untouched -> base
    expect(effNlTaxStatus(edited)).toBe('transparent');
  });
});

describe('withEntityEdit', () => {
  it('sets one override on the matching entity without touching others', () => {
    const f = { ...emptyFacts(), entities: [base, { ...base, id: 'E3', chartEntityId: 'c3' }] };
    const out = withEntityEdit(f, 'E2', 'jurisdiction', 'LU');
    expect(out.entities[0].edits).toEqual({ jurisdiction: 'LU' });
    expect(out.entities[1].edits).toBeUndefined();
    // base is left intact; only the override changed
    expect(out.entities[0].jurisdiction).toBe('DE');
  });
  it('merges successive edits rather than replacing them', () => {
    const f = { ...emptyFacts(), entities: [base] };
    const out = withEntityEdit(withEntityEdit(f, 'E2', 'jurisdiction', 'LU'), 'E2', 'nlTaxStatus', 'transparent');
    expect(out.entities[0].edits).toEqual({ jurisdiction: 'LU', nlTaxStatus: 'transparent' });
  });
});
