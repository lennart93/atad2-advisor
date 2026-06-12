import { describe, it, expect } from 'vitest';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

const fe = (id: string, hidden = false) =>
  ({ id, chartEntityId: id, name: id, jurisdiction: 'NL', entityType: 'BV', role: 'Group entity', ownershipPct: null, related: false, nlTaxStatus: null, hidden } as const);

describe('visibleFacts', () => {
  it('drops hidden entities and any classification/transaction that references them', () => {
    const f = { ...emptyFacts(),
      entities: [fe('E1'), fe('E2', true)],
      classifications: [
        { entityId: 'E1', homeState: 'NL', homeClass: 'x', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { entityId: 'E2', homeState: 'NL', homeClass: 'y', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ],
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ],
    } as never;
    const out = visibleFacts(f);
    expect(out.entities.map((e) => e.id)).toEqual(['E1']);
    expect(out.classifications.map((c) => c.entityId)).toEqual(['E1']);
    expect(out.transactions).toEqual([]); // T1 referenced hidden E2
  });

  it('clears a relatedVia pointer that dangles to a hidden common parent', () => {
    const f = { ...emptyFacts(),
      entities: [
        fe('E1'),
        { ...fe('E2', true), role: 'Parent' }, // common parent, hidden by the advisor
        { ...fe('E3'), related: true, relatedVia: 'E2', relatedViaPct: 40 }, // sibling related via E2
      ],
    } as never;
    const out = visibleFacts(f);
    const e3 = out.entities.find((e) => e.id === 'E3')!;
    expect(e3.related).toBe(true);       // still a structural associated enterprise
    expect(e3.relatedVia).toBeNull();    // but the dangling id is cleared, never leaked
    expect(e3.relatedViaPct).toBeNull();
  });
});
