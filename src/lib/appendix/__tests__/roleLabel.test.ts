import { describe, it, expect } from 'vitest';
import { characteriseGroupEntity, roleLabel } from '@/lib/appendix/facts/roleLabel';
import type { FactEntity } from '@/lib/appendix/types';

const ent = (patch: Partial<FactEntity> = {}): FactEntity => ({
  id: 'E1', chartEntityId: 'c-E1', name: 'Some Group Co', jurisdiction: 'NL', entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: false, nlTaxStatus: 'resident', ...patch,
});

describe('characteriseGroupEntity', () => {
  it('gives a short, more specific label than a bare "Other group company"', () => {
    expect(characteriseGroupEntity(ent({ name: '3HB Holding BV' }))).toBe('Holding');
    expect(characteriseGroupEntity(ent({ name: 'Atlas Beheer BV' }))).toBe('Management');
    expect(characteriseGroupEntity(ent({ name: 'Sun Life Lending Corp' }))).toBe('Lender');
    expect(characteriseGroupEntity(ent({ name: 'Atlas Participaties Fonds' }))).toBe('Fund');
    expect(characteriseGroupEntity(ent({ name: 'Stichting Bewaar' }))).toBe('Foundation');
    expect(characteriseGroupEntity(ent({ name: 'Random Co', ownershipPct: 5 }))).toBe('Co-investor');
    // The fallback is short and no longer the old three-word "Other group company".
    expect(characteriseGroupEntity(ent({ name: 'Random Co' }))).toBe('Group company');
  });
});

describe('roleLabel', () => {
  it('keeps a shareholder / subsidiary label and characterises other group entities', () => {
    expect(roleLabel(ent({ role: 'Group entity', shareholderOfTaxpayer: true }))).toBe('Shareholder');
    expect(roleLabel(ent({ role: 'Subsidiary', directLink: true }))).toBe('Subsidiary (direct)');
    expect(roleLabel(ent({ role: 'Group entity', name: '3HB Holding BV' }))).toBe('Holding');
    expect(roleLabel(ent({ role: 'Taxpayer' }))).toBe('Taxpayer');
    // An advisor override wins.
    expect(roleLabel(ent({ role: 'Group entity', edits: { relationType: 'Associate' } }))).toBe('Associate');
    // An explicit label override wins over everything, including the relation type.
    expect(roleLabel(ent({ role: 'Group entity', edits: { roleLabel: 'Customer' } }))).toBe('Customer');
    expect(roleLabel(ent({ role: 'Subsidiary', directLink: true, edits: { roleLabel: 'JV vehicle' } }))).toBe('JV vehicle');
    // "Unrelated" as a relation type is not shown as the label (it is a set membership, not a role).
    expect(roleLabel(ent({ role: 'Group entity', name: 'Random Co', edits: { relationType: 'Unrelated' } }))).toBe('Group company');
  });
});
