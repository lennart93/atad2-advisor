import { describe, it, expect } from 'vitest';
import {
  effJurisdiction, effEntityType, effNlTaxStatus, effNlQualification, effNlQualificationReason,
  DEFAULT_NL_NON_TRANSPARENT_REASON, withEntityEdit,
} from '@/lib/appendix/facts/entityFields';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { FactEntity } from '@/lib/appendix/types';

const base: FactEntity = {
  id: 'E2', chartEntityId: 'c2', name: 'Foreign Co', jurisdiction: 'DE', entityType: 'corporation',
  role: 'Subsidiary', ownershipPct: 100, related: true, nlTaxStatus: 'resident',
};

// A Dutch corporation with no status set: the default should apply.
const nlCorp: FactEntity = {
  id: 'E5', chartEntityId: 'c5', name: 'S4 Energy Nederland B.V.', jurisdiction: 'NL',
  entityType: 'corporation', role: 'Subsidiary', ownershipPct: 100, related: true, nlTaxStatus: null,
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

describe('effNlQualification - deterministic NL default', () => {
  it('defaults a Dutch corporation with no status to non-transparent', () => {
    expect(effNlQualification(nlCorp)).toBe('non-transparent');
    expect(effNlQualificationReason(nlCorp)).toBe(DEFAULT_NL_NON_TRANSPARENT_REASON);
  });
  it('defaults the Dutch taxpayer and fiscal-unity members to non-transparent', () => {
    const taxpayer: FactEntity = { ...nlCorp, id: 'E1', role: 'Taxpayer', entityType: 'corporation' };
    const fu: FactEntity = { ...nlCorp, id: 'E1', name: 'Fiscal unity', entityType: 'Fiscal unity', role: 'Taxpayer', isFiscalUnity: true };
    const member: FactEntity = { ...nlCorp, role: 'Group entity', memberOfUnityId: 'E1' };
    expect(effNlQualification(taxpayer)).toBe('non-transparent');
    expect(effNlQualification(fu)).toBe('non-transparent');
    expect(effNlQualification(member)).toBe('non-transparent');
  });
  it('does NOT default a Dutch partnership or hybrid form (the FKR/CV judgment calls)', () => {
    expect(effNlQualification({ ...nlCorp, entityType: 'partnership' })).toBe('undetermined');
    expect(effNlQualification({ ...nlCorp, entityType: 'hybrid_partnership' })).toBe('undetermined');
    expect(effNlQualification({ ...nlCorp, entityType: 'reverse_hybrid' })).toBe('undetermined');
    expect(effNlQualificationReason({ ...nlCorp, entityType: 'partnership' })).toBeNull();
  });
  it('does NOT default a foreign entity', () => {
    expect(effNlQualification(base)).toBe('non-transparent'); // base has nlTaxStatus 'resident' -> explicit
    expect(effNlQualification({ ...base, nlTaxStatus: null })).toBe('undetermined'); // DE corp, no status -> open
  });
  it('lets an explicit status (or advisor edit) win over the default', () => {
    expect(effNlQualification({ ...nlCorp, nlTaxStatus: 'transparent' })).toBe('transparent');
    expect(effNlQualification({ ...nlCorp, edits: { nlTaxStatus: 'transparent' } })).toBe('transparent');
    // An explicit status carries no synthesized default reason.
    expect(effNlQualificationReason({ ...nlCorp, nlTaxStatus: 'transparent' })).toBeNull();
  });
  it('prefers an AI/advisor reason over the synthesized default reason', () => {
    expect(effNlQualificationReason({ ...nlCorp, nlTaxStatusReason: 'Custom reason.' })).toBe('Custom reason.');
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
