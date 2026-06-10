import { describe, it, expect } from 'vitest';
import { factsForClient } from '@/lib/appendix/factsExport';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

describe('factsForClient', () => {
  it('drops proposed and excluded items', () => {
    const f = { ...emptyFacts(),
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { id: 'T2', fromEntityId: 'E1', toEntityId: 'E3', kind: 'fee', instrument: null, note: null, articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai' },
        { id: 'T3', fromEntityId: 'E1', toEntityId: 'E4', kind: 'div', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: true, source: 'ai' },
      ] } as never;
    const out = factsForClient(f);
    expect(out.transactions.map((t) => t.id)).toEqual(['T1']);
  });

  it('also strips advisor-hidden entities (and what references them)', () => {
    const fe = (id: string, hidden = false) =>
      ({ id, chartEntityId: id, name: id, jurisdiction: 'NL', entityType: 'BV', role: 'Group entity', ownershipPct: null, related: false, nlTaxStatus: null, hidden } as const);
    const f = { ...emptyFacts(),
      entities: [fe('E1'), fe('E2', true)],
      classifications: [
        { entityId: 'E1', homeState: 'NL', homeClass: 'x', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { entityId: 'E2', homeState: 'NL', homeClass: 'y', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ],
    } as never;
    const out = factsForClient(f);
    expect(out.entities.map((e) => e.id)).toEqual(['E1']);
    expect(out.classifications.map((c) => c.entityId)).toEqual(['E1']);
  });
});

describe('acting-together export rule', () => {
  const cluster = (id: string, likelihood: string, excluded = false) => ({
    id, memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood, reasoning: 'r',
    excludedFromClient: excluded, source: 'ai',
  });
  it('keeps only likely and highly_likely clusters for the client', () => {
    const facts = {
      entities: [], classifications: [], transactions: [],
      actingTogether: [
        cluster('A1', 'highly_unlikely'), cluster('A2', 'unlikely'), cluster('A3', 'unclear'),
        cluster('A4', 'likely'), cluster('A5', 'highly_likely'), cluster('A6', 'likely', true),
      ],
    } as never;
    expect(factsForClient(facts).actingTogether.map((a) => a.id)).toEqual(['A4', 'A5']);
  });
});
