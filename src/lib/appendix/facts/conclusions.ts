import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { visibleFacts } from './visibleFacts';
import { actingInClientReport } from './actingAnnex';
import { effJurisdiction, effNlTaxStatus, effNlQualification } from './entityFields';
import { nlQualification, type NlQualification } from './nlTaxStatus';
import { relevantTransactions } from './relevance';

/**
 * The deterministic summary-strip flags. Computed from the facts, never stored
 * and never written by the model: the wording around them may be AI, the
 * numbers may not.
 */
export interface ConclusionFlags {
  crossBorderRelatedFlows: number;
  hybridDifferences: number;
  /** Advisor-built acting-together groups that reach the client report. */
  actingTogetherGroups: number;
}

/** Map the model's free-form local classification to the NL qualification vocabulary. */
export function localQualification(homeClass: string | null | undefined): NlQualification {
  const c = (homeClass ?? '').trim().toLowerCase();
  if (c === 'transparent') return 'transparent';
  if (c === 'opaque' || c === 'non-transparent') return 'non-transparent';
  if (c === 'reverse hybrid' || c === 'reverse-hybrid' || c === 'reverse_hybrid') return 'reverse-hybrid';
  return 'undetermined';
}

/** True when an entity's own jurisdiction is the Netherlands (its home state is NL). */
function isDutchEntity(e: FactEntity): boolean {
  return (effJurisdiction(e) ?? '').toUpperCase() === 'NL';
}

/**
 * The effective local (home-state) qualification of an entity. A Dutch entity's
 * home state IS the Netherlands, so its local qualification equals the NL
 * qualification by construction: nothing separate is asked for or stored, and a
 * hybrid mismatch is impossible. Every other entity uses the model's / advisor's
 * home-state classification (homeClass).
 */
export function effLocalQualification(
  e: FactEntity,
  c: { homeClass: string } | null | undefined,
): NlQualification {
  if (isDutchEntity(e)) return effNlQualification(e);
  return localQualification(c?.homeClass);
}

/** True when this entity's derived NL qualification and the model's local (home-state) qualification are both determined and differ, or the model flagged the row hybrid. */
export function entityHasQualificationDifference(
  e: FactEntity,
  c: { homeClass: string; hybrid: boolean } | undefined,
): boolean {
  if (!c) return false;
  // A Dutch entity's home state is the Netherlands, so its local view equals its
  // NL view by construction; a hybrid mismatch is impossible regardless of any
  // stale home-state classification the model may have proposed.
  if (isDutchEntity(e)) return false;
  if (c.hybrid) return true;
  const nl = nlQualification(effNlTaxStatus(e));
  const local = localQualification(c.homeClass);
  return nl !== 'undetermined' && local !== 'undetermined' && nl !== local;
}

/**
 * One id per entity with a qualification difference: flagged hybrid by the
 * model, or NL view vs local view both determined and different. Skips rows
 * excluded from the client and rows whose entity is no longer in the register.
 */
function hybridEntityIds(f: AppendixFacts, byId: Map<string, FactEntity>): Set<string> {
  const ids = new Set<string>();
  for (const c of f.classifications) {
    if (c.excludedFromClient) continue;
    const e = byId.get(c.entityId);
    if (!e) continue;
    if (entityHasQualificationDifference(e, c)) ids.add(c.entityId);
  }
  return ids;
}

export function deriveConclusions(facts: AppendixFacts): ConclusionFlags {
  const f = visibleFacts(facts);
  const byId = new Map(f.entities.map((e) => [e.id, e]));

  const crossBorderRelatedFlows = relevantTransactions(f).filter((t) => {
    const from = byId.get(t.fromEntityId);
    const to = byId.get(t.toEntityId);
    const a = from ? effJurisdiction(from) : null;
    const b = to ? effJurisdiction(to) : null;
    return !!a && !!b && a !== b;
  }).length;

  const hybridIds = hybridEntityIds(f, byId);

  // The manually-built groups the advisor put forward for the client (AI hints do
  // not count: they are non-binding until adopted).
  const actingTogetherGroups = f.actingTogether.filter(actingInClientReport).length;

  return { crossBorderRelatedFlows, hybridDifferences: hybridIds.size, actingTogetherGroups };
}

/**
 * Section 4 scope: the taxpayer (and a fiscal-unity head), every party to a
 * relevant transaction, and every entity with a qualification difference
 * (hybrid-flagged or derived NL-vs-local divergence), matching the strip count.
 */
export function inScopeEntityIds(facts: AppendixFacts): Set<string> {
  const f = visibleFacts(facts);
  const byId = new Map(f.entities.map((e) => [e.id, e]));
  const ids = new Set<string>();
  for (const e of f.entities) {
    if (e.role === 'Taxpayer' || e.isFiscalUnity) ids.add(e.id);
  }
  for (const t of relevantTransactions(f)) {
    ids.add(t.fromEntityId);
    ids.add(t.toEntityId);
  }
  for (const id of hybridEntityIds(f, byId)) ids.add(id);
  // Only ids that still exist in the register.
  return new Set([...ids].filter((id) => byId.has(id)));
}
