import { describe, it, expect } from 'vitest';
import { actingTogetherCandidateEntities, actingTogetherCandidateCount } from '@/lib/appendix/facts/actingCandidates';
import type { FactEntity } from '@/lib/appendix/types';

function ent(partial: Partial<FactEntity> & Pick<FactEntity, 'id' | 'role'>): FactEntity {
  return {
    chartEntityId: `chart-${partial.id}`,
    name: partial.id,
    jurisdiction: null,
    entityType: null,
    ownershipPct: null,
    related: false,
    nlTaxStatus: null,
    ...partial,
  };
}

describe('actingTogether candidate helper', () => {
  it('counts parents and AI-flagged direct shareholders, not the taxpayer or subsidiaries', () => {
    const entities: FactEntity[] = [
      ent({ id: 'E1', role: 'Taxpayer' }),
      ent({ id: 'E2', role: 'Parent' }),
      ent({ id: 'E3', role: 'Parent' }),
      ent({ id: 'E4', role: 'Subsidiary' }),
      ent({ id: 'E5', role: 'Group entity', shareholderOfTaxpayer: true }),
      ent({ id: 'E6', role: 'Group entity' }),
    ];
    expect(actingTogetherCandidateEntities(entities).map((e) => e.id)).toEqual(['E2', 'E3', 'E5']);
    expect(actingTogetherCandidateCount(entities)).toBe(3);
  });

  it('excludes advisor-hidden entities', () => {
    const entities: FactEntity[] = [
      ent({ id: 'E2', role: 'Parent' }),
      ent({ id: 'E3', role: 'Parent', hidden: true }),
    ];
    expect(actingTogetherCandidateCount(entities)).toBe(1);
  });

  it('returns fewer than two when only a single shareholder exists', () => {
    const entities: FactEntity[] = [
      ent({ id: 'E1', role: 'Taxpayer' }),
      ent({ id: 'E2', role: 'Parent' }),
      ent({ id: 'E3', role: 'Subsidiary' }),
    ];
    expect(actingTogetherCandidateCount(entities)).toBe(1);
  });
});
