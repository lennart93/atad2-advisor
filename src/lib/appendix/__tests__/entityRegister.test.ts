import { describe, it, expect } from 'vitest';
import { buildEntityRegister } from '@/lib/appendix/facts/entityRegister';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';
import type { StructureGroup } from '@/lib/structure/types';

const ent = (id: string, name: string, taxpayer = false, jur = 'NL'): StructureEntity =>
  ({ id, name, is_taxpayer: taxpayer, jurisdiction_iso: jur, entity_type: 'corp' } as unknown as StructureEntity);
const edge = (from: string, to: string, pct: number | null): StructureEdge =>
  ({ from_entity_id: from, to_entity_id: to, ownership_pct: pct, kind: 'ownership' } as unknown as StructureEdge);

describe('buildEntityRegister', () => {
  it('puts the taxpayer first as E1 and numbers the rest deterministically', () => {
    const entities = [ent('c2', 'Sub Inc', false, 'US'), ent('c1', 'TaxPayer BV', true), ent('c3', 'Parent Coop')];
    const edges = [edge('c3', 'c1', 33), edge('c1', 'c2', 100)];
    const reg = buildEntityRegister(entities, edges);
    expect(reg[0].id).toBe('E1');
    expect(reg[0].role).toBe('Taxpayer');
    expect(reg[0].name).toBe('TaxPayer BV');
    const parent = reg.find((e) => e.name === 'Parent Coop')!;
    expect(parent.role).toBe('Parent');
    expect(parent.ownershipPct).toBe(33);
    expect(parent.related).toBe(true); // > 25%
    const sub = reg.find((e) => e.name === 'Sub Inc')!;
    expect(sub.role).toBe('Subsidiary');
    expect(sub.ownershipPct).toBe(100);
  });

  it('is stable: same input yields the same ids', () => {
    const entities = [ent('c1', 'TaxPayer BV', true), ent('c2', 'Sub', false, 'US')];
    const edges = [edge('c1', 'c2', 60)];
    expect(buildEntityRegister(entities, edges).map((e) => `${e.id}:${e.name}`))
      .toEqual(buildEntityRegister(entities, edges).map((e) => `${e.id}:${e.name}`));
  });

  it('returns empty when there is no taxpayer', () => {
    expect(buildEntityRegister([ent('c1', 'X')], [])).toEqual([]);
  });
});

const grp = (id: string, kind: string, members: string[]): StructureGroup =>
  ({ id, chart_id: 'ch', kind, label: 'Fiscale eenheid Acme c.s.', member_ids: members } as unknown as StructureGroup);

describe('buildEntityRegister fiscal unity', () => {
  it('collapses a fiscal unity that contains the taxpayer into a single E1', () => {
    const entities = [
      ent('c1', 'Acme Holding BV', true),
      ent('c2', 'Acme BV'),
      ent('c3', 'Parent Coop'),
      ent('c4', 'Sub Inc', false, 'US'),
    ];
    const edges = [edge('c3', 'c1', 40), edge('c1', 'c4', 100)];
    const reg = buildEntityRegister(entities, edges, [grp('g1', 'fiscal_unity', ['c1', 'c2'])]);
    const e1 = reg[0];
    expect(e1.id).toBe('E1');
    expect(e1.isFiscalUnity).toBe(true);
    expect(e1.role).toBe('Taxpayer');
    expect(e1.name).toBe('Fiscale eenheid Acme c.s.');
    expect(e1.memberEntityIds).toEqual(['c1', 'c2']);
    const members = reg.filter((r) => r.memberOfUnityId === 'E1');
    expect(members.map((m) => m.name).sort()).toEqual(['Acme BV', 'Acme Holding BV']);
    expect(members.every((m) => m.related === false)).toBe(true);
    const parent = reg.find((r) => r.name === 'Parent Coop')!;
    expect(parent.role).toBe('Parent');
    expect(parent.related).toBe(true);
    const sub = reg.find((r) => r.name === 'Sub Inc')!;
    expect(sub.role).toBe('Subsidiary');
  });

  it('without a fiscal unity, behaves exactly as before (taxpayer is E1)', () => {
    const entities = [ent('c1', 'TaxPayer BV', true), ent('c2', 'Sub', false, 'US')];
    const reg = buildEntityRegister(entities, [edge('c1', 'c2', 60)], []);
    expect(reg[0].id).toBe('E1');
    expect(reg[0].isFiscalUnity).toBeUndefined();
  });
});
