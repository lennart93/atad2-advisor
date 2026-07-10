import { describe, it, expect } from 'vitest';
import { deriveConclusions, inScopeEntityIds, localQualification, effLocalQualification, displayLocalQualification, foreignDefaultClassification, entityHasQualificationDifference, dutchForeignClassification, isForeignHomeStateOpen, openHomeStateCount } from '@/lib/appendix/facts/conclusions';
import type { AppendixFacts, FactEntity, TransactionItem, ClassificationItem } from '@/lib/appendix/types';

const ent = (id: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: `c-${id}`, name: id, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'resident', ...patch,
});
const tx = (id: string, from: string, to: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind: 'loan', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const cls = (entityId: string, patch: Partial<ClassificationItem> = {}): ClassificationItem => ({
  entityId, homeState: 'US', homeClass: 'opaque', sourceState: 'NL', sourceClass: 'opaque',
  hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const facts = (p: Partial<AppendixFacts>): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions: [], ...p,
});

describe('deriveConclusions', () => {
  it('counts cross-border relevant flows only (both jurisdictions known and different)', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US' }), ent('E3'), ent('E4', { jurisdiction: null })],
      transactions: [
        tx('T1', 'E1', 'E2'),                      // NL -> US, relevant by default: counts
        tx('T2', 'E1', 'E3'),                      // NL -> NL: no
        tx('T3', 'E1', 'E2', { relevant: false }), // cross-border but not relevant: no
        tx('T4', 'E1', 'E4'),                      // unknown jurisdiction: no
      ],
    });
    expect(deriveConclusions(f).crossBorderRelatedFlows).toBe(1);
  });

  it('counts hybrid differences from the hybrid flag and from NL-vs-local divergence, deduped per entity', () => {
    const f = facts({
      entities: [
        ent('E1', { role: 'Taxpayer' }),
        ent('E2', { jurisdiction: 'US', nlTaxStatus: 'transparent' }), // NL view transparent; local (US) opaque -> divergence
        ent('E3'),                                 // NL: non-transparent; local opaque -> no divergence
      ],
      classifications: [
        cls('E2', { homeClass: 'opaque' }),
        cls('E2', { hybrid: true }),               // same entity: still 1
        cls('E3'),
      ],
    });
    expect(deriveConclusions(f).hybridDifferences).toBe(1);
  });

  it('counts advisor-built acting-together groups that are not hidden (AI hints do not count)', () => {
    const f = facts({
      actingTogether: [
        { id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood: 'likely', reasoning: '', origin: 'manual', excludedFromClient: false, source: 'edited' },
        { id: 'A2', memberEntityIds: ['E1', 'E3'], combinedPct: 30, likelihood: 'likely', reasoning: '', origin: 'manual', excludedFromClient: true, source: 'edited' },
        { id: 'A3', memberEntityIds: ['E2', 'E3'], combinedPct: 30, likelihood: 'highly_likely', reasoning: '', origin: 'ai', excludedFromClient: false, source: 'ai' },
      ],
    });
    expect(deriveConclusions(f).actingTogetherGroups).toBe(1);
  });

  it('ignores a hybrid classification row whose entity is no longer in the register', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' })],
      classifications: [cls('E9', { hybrid: true })],
    });
    expect(deriveConclusions(f).hybridDifferences).toBe(0);
  });

  it('reads advisor edits: an edited jurisdiction can make a flow cross-border', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { edits: { jurisdiction: 'US' } })],
      transactions: [tx('T1', 'E1', 'E2')],
    });
    expect(deriveConclusions(f).crossBorderRelatedFlows).toBe(1);
  });

  it('does not count flows or classifications of advisor-hidden entities', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US', hidden: true })],
      transactions: [tx('T1', 'E1', 'E2')],
      classifications: [cls('E2', { hybrid: true })],
    });
    const flags = deriveConclusions(f);
    expect(flags.crossBorderRelatedFlows).toBe(0);
    expect(flags.hybridDifferences).toBe(0);
  });
});

describe('inScopeEntityIds', () => {
  it('includes the taxpayer, parties to relevant flows, and hybrid-flagged entities; nothing else', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US' }), ent('E3'), ent('E4', { jurisdiction: 'US' })],
      transactions: [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E3', { relevant: false })],
      classifications: [cls('E4', { hybrid: true })],
    });
    expect([...inScopeEntityIds(f)].sort()).toEqual(['E1', 'E2', 'E4']);
  });

  it('includes an entity with a derived NL-vs-local divergence even without a hybrid flag or transaction', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US', nlTaxStatus: 'transparent' })],
      classifications: [cls('E2', { homeClass: 'opaque' })], // hybrid: false
    });
    expect(inScopeEntityIds(f).has('E2')).toBe(true);
  });
});

describe('Dutch entities have no separate home-state view', () => {
  it('entityHasQualificationDifference is always false for an NL entity, even with a stale divergent or hybrid classification', () => {
    const nl = ent('E2', { jurisdiction: 'NL', nlTaxStatus: 'transparent' });
    // A US home-state classification on an NL entity is contradictory; it must
    // never surface as a hybrid mismatch.
    expect(entityHasQualificationDifference(nl, cls('E2', { homeClass: 'opaque' }))).toBe(false);
    expect(entityHasQualificationDifference(nl, cls('E2', { hybrid: true }))).toBe(false);
  });

  it('deriveConclusions and inScope ignore a stale hybrid flag on an NL entity', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'NL', nlTaxStatus: 'transparent' })],
      classifications: [cls('E2', { homeClass: 'opaque', hybrid: true })],
    });
    expect(deriveConclusions(f).hybridDifferences).toBe(0);
    expect(inScopeEntityIds(f).has('E2')).toBe(false);
  });
});

describe('a Dutch entity with an advisor-added foreign classification', () => {
  // The NL BV is non-transparent for NL; the advisor records that the US treats
  // it as transparent. That advisor-authored foreign classification IS a hybrid.
  const nlBv = ent('E2', { jurisdiction: 'NL', nlTaxStatus: 'resident' });
  const foreign = cls('E2', { homeState: 'US', homeClass: 'transparent', source: 'edited' });

  it('surfaces the foreign classification (state + qualification)', () => {
    expect(dutchForeignClassification(nlBv, foreign)).toEqual({ state: 'US', qual: 'transparent' });
  });

  it('drives effLocalQualification to the foreign view', () => {
    expect(effLocalQualification(nlBv, foreign)).toBe('transparent');
    // Without a foreign classification it still mirrors the NL view.
    expect(effLocalQualification(nlBv, undefined)).toBe('non-transparent');
  });

  it('counts as a hybrid mismatch and brings the entity into scope', () => {
    expect(entityHasQualificationDifference(nlBv, foreign)).toBe(true);
    const f = facts({ entities: [ent('E1', { role: 'Taxpayer' }), nlBv], classifications: [foreign] });
    expect(deriveConclusions(f).hybridDifferences).toBe(1);
    expect(inScopeEntityIds(f).has('E2')).toBe(true);
  });

  it('ignores an AI-proposed (non-edited) foreign classification on an NL entity', () => {
    const ai = cls('E2', { homeState: 'US', homeClass: 'transparent', source: 'ai' });
    expect(dutchForeignClassification(nlBv, ai)).toBeNull();
    expect(entityHasQualificationDifference(nlBv, ai)).toBe(false);
  });

  it('does not fire while the foreign country is unset or matches NL', () => {
    expect(entityHasQualificationDifference(nlBv, cls('E2', { homeState: '', homeClass: 'transparent', source: 'edited' }))).toBe(false);
    expect(entityHasQualificationDifference(nlBv, cls('E2', { homeState: 'NL', homeClass: 'transparent', source: 'edited' }))).toBe(false);
  });

  it('does not fire when the foreign view matches the NL view', () => {
    const same = cls('E2', { homeState: 'US', homeClass: 'opaque', source: 'edited' });
    expect(entityHasQualificationDifference(nlBv, same)).toBe(false);
  });
});

describe('effLocalQualification', () => {
  it('mirrors the NL qualification for a Dutch entity, ignoring any home-state classification', () => {
    const nlResident = ent('E1', { jurisdiction: 'NL', nlTaxStatus: 'resident' });
    expect(effLocalQualification(nlResident, undefined)).toBe('non-transparent');
    // A stale transparent home-state classification does not override the NL view.
    expect(effLocalQualification(nlResident, cls('E1', { homeClass: 'transparent' }))).toBe('non-transparent');

    const nlTransparent = ent('E2', { jurisdiction: 'NL', nlTaxStatus: 'transparent' });
    expect(effLocalQualification(nlTransparent, undefined)).toBe('transparent');
  });

  it('uses the home-state classification for a foreign entity', () => {
    const us = ent('E3', { jurisdiction: 'US', nlTaxStatus: 'transparent' });
    expect(effLocalQualification(us, cls('E3', { homeClass: 'opaque' }))).toBe('non-transparent');
    // The RAW effective view stays undetermined until something is stored; the
    // deterministic default only feeds displayLocalQualification.
    expect(effLocalQualification(us, undefined)).toBe('undetermined');
  });
});

describe('displayLocalQualification / foreignDefaultClassification', () => {
  it('fills an unset foreign view from the jurisdiction + legal form', () => {
    const hkLtd = ent('E1', { jurisdiction: 'HK', name: 'WMC Group Asia Limited', entityType: 'corporation', nlTaxStatus: null });
    const dac = ent('E2', { jurisdiction: 'IE', name: 'Joshua Energy One Designated Activity Company', entityType: 'corporation', nlTaxStatus: null });
    const usCorp = ent('E3', { jurisdiction: 'US', name: 'WMC Energy Corp.', entityType: 'corporation', nlTaxStatus: null });
    const usLlc = ent('E4', { jurisdiction: 'US', name: 'Delaware Holdings LLC', entityType: 'partnership', nlTaxStatus: null });
    expect(displayLocalQualification(hkLtd, undefined)).toBe('non-transparent');
    expect(displayLocalQualification(dac, undefined)).toBe('non-transparent');
    expect(displayLocalQualification(usCorp, undefined)).toBe('non-transparent');
    expect(displayLocalQualification(usLlc, undefined)).toBe('transparent');
    expect(foreignDefaultClassification(hkLtd, undefined)?.basis).toMatch(/Hong Kong/i);
  });

  it('never overrides a stored home-state view, and leaves a Dutch entity / unknown form open', () => {
    const usLlc = ent('E4', { jurisdiction: 'US', name: 'Delaware Holdings LLC', entityType: 'partnership' });
    // A stored (even unmappable) class wins over the default: mirrors the register.
    expect(displayLocalQualification(usLlc, cls('E4', { homeClass: 'disregarded' }))).toBe('undetermined');
    expect(foreignDefaultClassification(usLlc, cls('E4', { homeClass: 'opaque' }))).toBeNull();
    // Dutch entity: no foreign default; unknown foreign form: stays undetermined.
    const nl = ent('E5', { jurisdiction: 'NL', name: 'Some BV' });
    const unknown = ent('E6', { jurisdiction: 'BE', name: 'Mystery Vorm', entityType: null, nlTaxStatus: null });
    expect(foreignDefaultClassification(nl, undefined)).toBeNull();
    expect(displayLocalQualification(unknown, undefined)).toBe('undetermined');
  });
});

describe('isForeignHomeStateOpen / openHomeStateCount', () => {
  it('is open only for a foreign entity with no determined home-state view', () => {
    // Unknown foreign form, nothing stored: genuinely open.
    const unknown = ent('E1', { jurisdiction: 'BE', name: 'Mystery Vorm', entityType: null, nlTaxStatus: null });
    expect(isForeignHomeStateOpen(unknown, undefined)).toBe(true);

    // A confident jurisdiction + legal-form default satisfies the requirement.
    const usCorp = ent('E2', { jurisdiction: 'US', name: 'WMC Energy Corp.', entityType: 'corporation', nlTaxStatus: null });
    expect(isForeignHomeStateOpen(usCorp, undefined)).toBe(false);

    // A stored home-state view satisfies it too.
    expect(isForeignHomeStateOpen(unknown, cls('E1', { homeState: 'BE', homeClass: 'opaque' }))).toBe(false);
  });

  it('never fires for an NL entity, a jurisdiction-less entity, or the taxpayer / fiscal-unity members', () => {
    expect(isForeignHomeStateOpen(ent('E1', { jurisdiction: 'NL', nlTaxStatus: null }), undefined)).toBe(false);
    expect(isForeignHomeStateOpen(ent('E2', { jurisdiction: null, nlTaxStatus: null }), undefined)).toBe(false);
    expect(isForeignHomeStateOpen(ent('E3', { jurisdiction: 'US', role: 'Taxpayer', nlTaxStatus: null }), undefined)).toBe(false);
    expect(isForeignHomeStateOpen(ent('E4', { jurisdiction: 'US', memberOfUnityId: 'E1', nlTaxStatus: null }), undefined)).toBe(false);
  });

  it('is silenced by an explicit not-relevant dismissal or a demotion out of the relevant set', () => {
    const base = { jurisdiction: 'BE', name: 'Mystery Vorm', entityType: null, nlTaxStatus: null } as const;
    expect(isForeignHomeStateOpen(ent('E1', { ...base, edits: { localNotRelevant: true } }), undefined)).toBe(false);
    expect(isForeignHomeStateOpen(ent('E2', { ...base, edits: { relevanceOverride: 'out' } }), undefined)).toBe(false);
  });

  it('counts every open foreign entity across the register', () => {
    const f = facts({
      entities: [
        ent('E1', { role: 'Taxpayer', jurisdiction: 'NL' }),
        ent('E2', { jurisdiction: 'BE', name: 'Mystery Vorm', entityType: null, nlTaxStatus: null }), // open
        ent('E3', { jurisdiction: 'FR', name: 'Autre Forme', entityType: null, nlTaxStatus: null }),  // open
        ent('E4', { jurisdiction: 'US', name: 'WMC Energy Corp.', entityType: 'corporation', nlTaxStatus: null }), // default satisfies
      ],
    });
    expect(openHomeStateCount(f)).toBe(2);
  });
});

describe('localQualification', () => {
  it('maps the free-form homeClass to a qualification', () => {
    expect(localQualification('transparent')).toBe('transparent');
    expect(localQualification('Opaque')).toBe('non-transparent');
    expect(localQualification('disregarded')).toBe('undetermined');
    expect(localQualification(null)).toBe('undetermined');
  });
  it('recognises the reverse-hybrid spellings', () => {
    expect(localQualification('reverse hybrid')).toBe('reverse-hybrid');
    expect(localQualification('Reverse Hybrid')).toBe('reverse-hybrid');
    expect(localQualification('reverse_hybrid')).toBe('reverse-hybrid');
  });
});
