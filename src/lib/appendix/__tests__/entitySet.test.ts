import { describe, it, expect } from 'vitest';
import {
  nextEntityId, effRelevanceOverride, effLocalNotRelevant,
  promoteToRelevant, removeFromRelevant, addManualEntity, setHomeStateInline,
} from '@/lib/appendix/facts/entitySet';
import { effLocalQualification } from '@/lib/appendix/facts/conclusions';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';

const taxpayer: FactEntity = {
  id: 'E1', chartEntityId: 'c1', name: 'NL Holding B.V.', jurisdiction: 'NL',
  entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident',
};
const foreign: FactEntity = {
  id: 'E2', chartEntityId: 'c2', name: 'Leclanché S.A.', jurisdiction: 'CH',
  entityType: 'corporation', role: 'Group entity', ownershipPct: null, related: false, nlTaxStatus: null,
};

function facts(entities: FactEntity[]): AppendixFacts {
  return { ...emptyFacts(), entities };
}

describe('nextEntityId', () => {
  it('returns one past the highest E-number in use', () => {
    expect(nextEntityId(facts([taxpayer, foreign]))).toBe('E3');
    expect(nextEntityId(facts([taxpayer, { ...foreign, id: 'E7' }]))).toBe('E8');
    expect(nextEntityId(emptyFacts())).toBe('E1');
  });
});

describe('promote / remove relevance override', () => {
  it('promoteToRelevant sets an "in" override without touching other entities', () => {
    const out = promoteToRelevant(facts([taxpayer, foreign]), 'E2');
    expect(effRelevanceOverride(out.entities[1])).toBe('in');
    expect(out.entities[0].edits).toBeUndefined();
  });

  it('removeFromRelevant demotes a chart entity to "out" (kept in the register)', () => {
    const out = removeFromRelevant(facts([taxpayer, foreign]), 'E2');
    expect(out.entities).toHaveLength(2);
    expect(effRelevanceOverride(out.entities[1])).toBe('out');
  });

  it('removeFromRelevant deletes a manual entity outright, cascading its classification', () => {
    const withManual = addManualEntity(facts([taxpayer]), { name: 'Extra Co', jurisdiction: 'DE' });
    const setCls = setHomeStateInline(withManual.facts, withManual.id, 'transparent', 'DE');
    expect(setCls.classifications.some((c) => c.entityId === withManual.id)).toBe(true);
    const removed = removeFromRelevant(setCls, withManual.id);
    expect(removed.entities.some((e) => e.id === withManual.id)).toBe(false);
    expect(removed.classifications.some((c) => c.entityId === withManual.id)).toBe(false);
  });
});

describe('addManualEntity', () => {
  it('creates a hand-added entity in the relevant list with a synthetic chart id', () => {
    const { facts: out, id } = addManualEntity(facts([taxpayer]), { name: '  Foo Ltd  ', jurisdiction: 'GB', nlTaxStatus: 'non_transparent' });
    expect(id).toBe('E2');
    const added = out.entities.find((e) => e.id === 'E2')!;
    expect(added.name).toBe('Foo Ltd'); // trimmed
    expect(added.manual).toBe(true);
    expect(added.chartEntityId).toBe('manual:E2');
    expect(effRelevanceOverride(added)).toBe('in');
    expect(added.nlTaxStatus).toBe('non_transparent');
  });
});

describe('setHomeStateInline', () => {
  it('records a real home-state classification and clears any prior "not relevant"', () => {
    const dismissed = setHomeStateInline(facts([taxpayer, foreign]), 'E2', 'not-relevant', 'CH');
    expect(effLocalNotRelevant(dismissed.entities[1])).toBe(true);
    const set = setHomeStateInline(dismissed, 'E2', 'transparent', 'CH');
    expect(effLocalNotRelevant(set.entities[1])).toBe(false);
    const cls = set.classifications.find((c) => c.entityId === 'E2')!;
    expect(effLocalQualification(set.entities[1], cls)).toBe('transparent');
  });

  it('"not relevant" dismisses the flag without recording a classification', () => {
    const out = setHomeStateInline(facts([taxpayer, foreign]), 'E2', 'not-relevant', 'CH');
    expect(effLocalNotRelevant(out.entities[1])).toBe(true);
    expect(out.classifications.some((c) => c.entityId === 'E2')).toBe(false);
  });

  it('"to be determined" from a clean state writes no confirmed-empty classification', () => {
    const out = setHomeStateInline(facts([taxpayer, foreign]), 'E2', 'undetermined', 'CH');
    expect(out.classifications.some((c) => c.entityId === 'E2')).toBe(false);
  });
});
