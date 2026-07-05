import { describe, it, expect } from 'vitest';
import { factsForClient } from '@/lib/appendix/factsExport';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

describe('factsForClient', () => {
  it('keeps proposed transactions and drops only advisor-excluded ones', () => {
    // The generator stores every AI flow as 'proposed' and nothing ever flips a
    // flow to 'confirmed', so filtering 'proposed' silently emptied the client
    // transactions table (handoff 68, fix 3). Only an explicit exclusion drops.
    const f = { ...emptyFacts(),
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { id: 'T2', fromEntityId: 'E1', toEntityId: 'E3', kind: 'fee', instrument: null, note: null, articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai' },
        { id: 'T3', fromEntityId: 'E1', toEntityId: 'E4', kind: 'div', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: true, source: 'ai' },
      ] } as never;
    const out = factsForClient(f);
    expect(out.transactions.map((t) => t.id)).toEqual(['T1', 'T2']);
  });

  it('still drops proposed classifications (the confirm-on-edit path exists there)', () => {
    const f = { ...emptyFacts(),
      classifications: [
        { entityId: 'E1', homeState: 'US', homeClass: 'opaque', sourceState: null, sourceClass: null, hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai' },
        { entityId: 'E2', homeState: 'US', homeClass: 'opaque', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ] } as never;
    expect(factsForClient(f).classifications.map((c) => c.entityId)).toEqual(['E2']);
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
  const cluster = (id: string, origin: 'ai' | 'manual' | undefined, excluded = false) => ({
    id, memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood: 'likely', reasoning: 'r',
    origin, excludedFromClient: excluded, source: origin === 'manual' ? 'edited' : 'ai',
  });
  it('keeps advisor-built groups only; AI hints and hidden groups drop out', () => {
    const facts = {
      entities: [], classifications: [], transactions: [],
      actingTogether: [
        cluster('A1', undefined),       // legacy AI cluster: a hint, out
        cluster('A2', 'ai'),            // AI suggestion: a hint, out
        cluster('A3', 'manual'),        // manual group: in
        cluster('A4', 'manual'),        // manual group: in
        cluster('A5', 'manual', true),  // manual but hidden by the advisor: out
      ],
    } as never;
    expect(factsForClient(facts).actingTogether.map((a) => a.id)).toEqual(['A3', 'A4']);
  });
});
