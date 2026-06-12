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

describe('buildEntityRegister ownership graph (multi-hop)', () => {
  it('labels indirect ancestors Parent and indirect descendants Subsidiary with effective %', () => {
    // top -100-> mid -60-> TP -100-> sub -50-> grandsub
    const entities = [
      ent('tp', 'TaxPayer BV', true),
      ent('top', 'Ultimate Holding', false, 'LU'),
      ent('mid', 'Mid Holding'),
      ent('sub', 'Sub BV'),
      ent('gsub', 'Grand Sub BV'),
    ];
    const edges = [edge('top', 'mid', 100), edge('mid', 'tp', 60), edge('tp', 'sub', 100), edge('sub', 'gsub', 50)];
    const reg = buildEntityRegister(entities, edges);

    const top = reg.find((e) => e.name === 'Ultimate Holding')!;
    expect(top.role).toBe('Parent');
    expect(top.ownershipPct).toBe(60); // 100% * 60%
    expect(top.related).toBe(true);

    const mid = reg.find((e) => e.name === 'Mid Holding')!;
    expect(mid.role).toBe('Parent');
    expect(mid.ownershipPct).toBe(60);

    const gsub = reg.find((e) => e.name === 'Grand Sub BV')!;
    expect(gsub.role).toBe('Subsidiary');
    expect(gsub.ownershipPct).toBe(50); // 100% * 50%
    expect(gsub.related).toBe(true);
  });

  it('flags a sibling related via a common parent and records relatedVia', () => {
    // commonParent owns TP 100% and Sibling 40%; sibling is neither ancestor nor descendant of TP.
    const entities = [
      ent('tp', 'TaxPayer BV', true),
      ent('cp', 'Common Parent BV'),
      ent('sib', 'Sister BV'),
      ent('cousin', 'Far Cousin BV'),
    ];
    const edges = [edge('cp', 'tp', 100), edge('cp', 'sib', 40), edge('cp', 'cousin', 10)];
    const reg = buildEntityRegister(entities, edges);

    const cp = reg.find((e) => e.name === 'Common Parent BV')!;
    expect(cp.role).toBe('Parent');

    const sib = reg.find((e) => e.name === 'Sister BV')!;
    expect(sib.role).toBe('Group entity');
    expect(sib.related).toBe(true);
    expect(sib.relatedVia).toBe(cp.id); // resolved to the register label, not the chart id
    expect(sib.relatedViaPct).toBe(40);

    const cousin = reg.find((e) => e.name === 'Far Cousin BV')!;
    expect(cousin.related).toBe(false); // common parent only holds 10% in it
    expect(cousin.relatedVia ?? null).toBeNull();
  });

  it('ignores non-ownership (transaction) edges when assigning roles', () => {
    const entities = [ent('tp', 'TaxPayer BV', true), ent('cp', 'Lender Co', false, 'US')];
    const txEdge = { from_entity_id: 'cp', to_entity_id: 'tp', ownership_pct: null, kind: 'transaction' } as unknown as StructureEdge;
    const reg = buildEntityRegister(entities, [txEdge]);
    const lender = reg.find((e) => e.name === 'Lender Co')!;
    expect(lender.role).toBe('Group entity'); // a payment flow is not ownership
    expect(lender.ownershipPct).toBeNull();
  });

  it('leaves the percentage null (not 0) when the chain has an unknown holding', () => {
    const entities = [ent('tp', 'TaxPayer BV', true), ent('p', 'Parent NV', false, 'BE')];
    const reg = buildEntityRegister(entities, [edge('p', 'tp', null)]);
    const p = reg.find((e) => e.name === 'Parent NV')!;
    expect(p.role).toBe('Parent'); // still classified by connectivity
    expect(p.ownershipPct).toBeNull();
    expect(p.related).toBe(false); // cannot assert >25% without a number
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

describe('buildEntityRegister direct vs indirect links', () => {
  it('flags direct and indirect subsidiaries and parents', () => {
    // top -100-> TP -100-> sub -50-> gsub
    const entities = [
      ent('tp', 'TaxPayer BV', true),
      ent('top', 'Holding BV'),
      ent('sub', 'Sub BV'),
      ent('gsub', 'Grand Sub BV'),
    ];
    const edges = [edge('top', 'tp', 100), edge('tp', 'sub', 100), edge('sub', 'gsub', 50)];
    const reg = buildEntityRegister(entities, edges);

    expect(reg.find((e) => e.name === 'Holding BV')!.directLink).toBe(true);
    expect(reg.find((e) => e.name === 'Sub BV')!.directLink).toBe(true);
    expect(reg.find((e) => e.name === 'Grand Sub BV')!.directLink).toBe(false);
    expect(reg.find((e) => e.name === 'TaxPayer BV')!.directLink).toBeUndefined();
  });

  it('leaves group entities without the flag', () => {
    // parent owns TP (30%) and sister (40%): sister is a Group entity.
    const entities = [ent('tp', 'TaxPayer BV', true), ent('p', 'Parent BV'), ent('sis', 'Sister BV')];
    const edges = [edge('p', 'tp', 30), edge('p', 'sis', 40)];
    const reg = buildEntityRegister(entities, edges);
    const sister = reg.find((e) => e.name === 'Sister BV')!;
    expect(sister.role).toBe('Group entity');
    expect(sister.directLink).toBeUndefined();
    expect(sister.relatedVia).toBeTruthy();
  });
});

describe('buildEntityRegister natural persons', () => {
  const person = (id: string, name: string): StructureEntity =>
    ({ id, name, is_taxpayer: false, jurisdiction_iso: 'NL', entity_type: 'individual' } as unknown as StructureEntity);

  it('drops unrelated individuals from the register (corporate chain only)', () => {
    const entities = [ent('tp', 'TaxPayer BV', true), ent('co', 'Fund BV'), person('p1', 'C. de Vries')];
    // The person co-invests somewhere irrelevant: no ownership in or from the taxpayer.
    const edges = [edge('tp', 'co', 60), edge('p1', 'co', 1)];
    const reg = buildEntityRegister(entities, edges);
    expect(reg.find((e) => e.name === 'C. de Vries')).toBeUndefined();
    expect(reg.find((e) => e.name === 'Fund BV')).toBeTruthy();
  });

  it('keeps an individual who is a genuine >25% shareholder of the taxpayer', () => {
    const entities = [ent('tp', 'TaxPayer BV', true), person('dga', 'A. Founder')];
    const edges = [edge('dga', 'tp', 100)];
    const reg = buildEntityRegister(entities, edges);
    const dga = reg.find((e) => e.name === 'A. Founder')!;
    expect(dga.role).toBe('Parent');
    expect(dga.related).toBe(true);
  });
});
