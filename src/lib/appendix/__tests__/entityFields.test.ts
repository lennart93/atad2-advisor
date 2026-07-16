import { describe, it, expect } from 'vitest';
import {
  effJurisdiction, effEntityType, effNlTaxStatus, effNlQualification, effNlQualificationReason,
  effRelationType, effRelatedPct, effRelationReason, effNlReason, effLocalReason,
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
  it('does NOT default a foreign entity without a recognisable statutory form', () => {
    expect(effNlQualification(base)).toBe('non-transparent'); // base has nlTaxStatus 'resident' -> explicit
    expect(effNlQualification({ ...base, nlTaxStatus: null })).toBe('undetermined'); // DE corp, no suffix -> open
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

describe('effNlQualification - deterministic foreign corporate-form default', () => {
  // The Duhco S.A. case: the AI answered "unknown" while its own reason already
  // concluded non-transparent. A well-known corporate form settles the NL view.
  const luSa: FactEntity = {
    id: 'E7', chartEntityId: 'c7', name: 'Duhco S.A.', jurisdiction: 'LU',
    entityType: 'corporation', role: 'Parent', ownershipPct: 100, related: true, nlTaxStatus: null,
  };
  it('defaults a foreign well-known corporate form to non-transparent, with the list basis as reason', () => {
    expect(effNlQualification(luSa)).toBe('non-transparent');
    expect(effNlQualificationReason(luSa)).toMatch(/comparable to a Dutch N\.V\./);
  });
  it("treats the AI's 'unknown' as an absent answer, not a decision", () => {
    const aiUnknown = { ...luSa, nlTaxStatus: 'unknown', nlTaxStatusReason: 'Appears non-transparent as a foreign corporate entity.' };
    expect(effNlQualification(aiUnknown)).toBe('non-transparent');
    // The AI's own words stay the shown reason when it wrote one.
    expect(effNlQualificationReason(aiUnknown)).toBe('Appears non-transparent as a foreign corporate entity.');
  });
  it("keeps an advisor's explicit 'To be determined' (edit) as undetermined", () => {
    expect(effNlQualification({ ...luSa, edits: { nlTaxStatus: 'unknown' } })).toBe('undetermined');
  });
  it('leaves the year-dependent forms (LLC, SCSp, ...) open', () => {
    expect(effNlQualification({ ...luSa, name: 'Fund SCSp', entityType: 'partnership' })).toBe('undetermined');
    expect(effNlQualification({ ...luSa, name: 'Delaware Holdings LLC', jurisdiction: 'US' })).toBe('undetermined');
  });
  it('follows an advisor jurisdiction edit (a form is only defaulted in its own state system)', () => {
    // Edited to NL: the entity is Dutch now, so the foreign default no longer applies
    // (and the NL-corp default takes over via the chart type).
    expect(effNlQualification({ ...luSa, edits: { jurisdiction: 'NL' } })).toBe('non-transparent');
    expect(effNlQualificationReason({ ...luSa, edits: { jurisdiction: 'NL' } })).toBe(DEFAULT_NL_NON_TRANSPARENT_REASON);
  });
});

describe('relation and reasoning overrides', () => {
  it('effRelatedPct: edit wins, an explicit clear does not fall back to the chart', () => {
    expect(effRelatedPct(base)).toBe(100);
    expect(effRelatedPct({ ...base, edits: { relatedPct: 62.7 } })).toBe(62.7);
    expect(effRelatedPct({ ...base, edits: { relatedPct: null } })).toBeNull();
    // no ownershipPct: falls back to the via-parent stake
    expect(effRelatedPct({ ...base, ownershipPct: null, relatedViaPct: 30 })).toBe(30);
  });
  it('effRelationType is null until the advisor picks one', () => {
    expect(effRelationType(base)).toBeNull();
    expect(effRelationType({ ...base, edits: { relationType: 'Sister company' } })).toBe('Sister company');
  });
  it('reason overrides win over the derived fallback', () => {
    expect(effRelationReason(base, 'derived')).toBe('derived');
    expect(effRelationReason({ ...base, edits: { relationReason: 'mine' } }, 'derived')).toBe('mine');
    expect(effNlReason({ ...nlCorp, edits: { nlReason: 'my nl reason' } })).toBe('my nl reason');
    expect(effNlReason(nlCorp)).toBe(DEFAULT_NL_NON_TRANSPARENT_REASON);
    expect(effLocalReason(base, 'derived local')).toBe('derived local');
    expect(effLocalReason({ ...base, edits: { localReason: 'my local' } }, 'derived local')).toBe('my local');
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
