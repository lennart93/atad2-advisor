import type { AppendixFacts } from '@/lib/appendix/types';
import { visibleFacts } from './visibleFacts';
import { effJurisdiction, effNlTaxStatus } from './entityFields';
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
  likelyActingTogether: number;
}

/** Map the model's free-form local classification to the NL qualification vocabulary. */
export function localQualification(homeClass: string | null | undefined): NlQualification {
  const c = (homeClass ?? '').trim().toLowerCase();
  if (c === 'transparent') return 'transparent';
  if (c === 'opaque' || c === 'non-transparent') return 'non-transparent';
  return 'undetermined';
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

  // One count per entity: flagged hybrid by the model, or NL view vs local view
  // both determined and different.
  const hybridIds = new Set<string>();
  for (const c of f.classifications) {
    if (!byId.has(c.entityId)) continue;
    if (c.excludedFromClient) continue;
    if (c.hybrid) { hybridIds.add(c.entityId); continue; }
    const e = byId.get(c.entityId);
    if (!e) continue;
    const nl = nlQualification(effNlTaxStatus(e));
    const local = localQualification(c.homeClass);
    if (nl !== 'undetermined' && local !== 'undetermined' && nl !== local) hybridIds.add(c.entityId);
  }

  const likelyActingTogether = f.actingTogether.filter(
    (a) => !a.excludedFromClient && (a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
  ).length;

  return { crossBorderRelatedFlows, hybridDifferences: hybridIds.size, likelyActingTogether };
}

/**
 * Section 4 scope: the taxpayer (and a fiscal-unity head), every party to a
 * relevant transaction, and every entity with a hybrid-flagged classification.
 */
export function inScopeEntityIds(facts: AppendixFacts): Set<string> {
  const f = visibleFacts(facts);
  const ids = new Set<string>();
  for (const e of f.entities) {
    if (e.role === 'Taxpayer' || e.isFiscalUnity) ids.add(e.id);
  }
  for (const t of relevantTransactions(f)) {
    ids.add(t.fromEntityId);
    ids.add(t.toEntityId);
  }
  for (const c of f.classifications) {
    if (!c.excludedFromClient && c.hybrid) ids.add(c.entityId);
  }
  // Only ids that still exist in the register.
  const known = new Set(f.entities.map((e) => e.id));
  return new Set([...ids].filter((id) => known.has(id)));
}
