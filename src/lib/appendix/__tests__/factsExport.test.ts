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
});
