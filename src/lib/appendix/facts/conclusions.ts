import type { AppendixFacts, ClassificationItem, FactEntity } from '@/lib/appendix/types';
import { visibleFacts } from './visibleFacts';
import { actingInClientReport } from './actingAnnex';
import { effJurisdiction, effEntityType, effNlTaxStatus, effNlQualification } from './entityFields';
import { nlQualification, type NlQualification } from './nlTaxStatus';
import { relevantTransactions } from './relevance';
import { defaultClassification } from '@/lib/appendix/classificationDefaults';

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
  if (c === 'irrelevant' || c.startsWith('irrelevant')) return 'irrelevant';
  return 'undetermined';
}

/** True when an entity's own jurisdiction is the Netherlands (its home state is NL). */
function isDutchEntity(e: FactEntity): boolean {
  return (effJurisdiction(e) ?? '').toUpperCase() === 'NL';
}

type ForeignClsFields = Pick<ClassificationItem, 'homeState' | 'homeClass' | 'source'>;

/**
 * A Dutch entity's own home state IS the Netherlands, so it normally carries no
 * separate home-state view. The advisor can still record how ANOTHER state
 * classifies the entity (a Dutch BV a foreign state treats as transparent, etc.)
 * to bring a hybrid mismatch into scope. That foreign classification is an
 * advisor-authored (source 'edited') classification whose homeState is a real,
 * non-NL country. AI-proposed or stale rows are deliberately NOT read here: a
 * home-state classification the model may have guessed for a Dutch entity is
 * contradictory and must never surface on its own.
 */
export function dutchForeignClassification(
  e: FactEntity,
  c: ForeignClsFields | null | undefined,
): { state: string; qual: NlQualification } | null {
  if (!isDutchEntity(e) || !c || c.source !== 'edited') return null;
  const state = (c.homeState ?? '').trim();
  if (!state || state.toUpperCase() === 'NL') return null;
  return { state, qual: localQualification(c.homeClass) };
}

/**
 * The effective local (home-state) qualification of an entity. A Dutch entity's
 * home state IS the Netherlands, so its local qualification equals the NL
 * qualification by construction: nothing separate is asked for or stored, and a
 * hybrid mismatch is impossible. Every other entity uses the model's / advisor's
 * stored home-state classification (homeClass) verbatim - this is the RAW view the
 * hybrid-mismatch and transaction-risk logic read, so it stays "undetermined" until
 * something is actually recorded. For what to SHOW, see displayLocalQualification.
 */
export function effLocalQualification(
  e: FactEntity,
  c: ForeignClsFields | null | undefined,
): NlQualification {
  if (isDutchEntity(e)) return dutchForeignClassification(e, c)?.qual ?? effNlQualification(e);
  return localQualification(c?.homeClass);
}

/**
 * The deterministic home-state default for a foreign entity whose classification is
 * still unrecorded: derived from its jurisdiction and legal form (a US Inc./Corp. is
 * a per-se corporation, a HK Ltd / Irish DAC / Swiss AG is non-transparent, a US LLC
 * is transparent by default). Returns null for a Dutch entity, one that already
 * carries any stored home-state view, or an unknown form. The legal form is read
 * from the name and the entity type together, since the name usually carries the
 * statutory suffix. A proposal only (its basis is shown as the reasoning, the
 * advisor confirms). DRAFT, pending tax review.
 */
export function foreignDefaultClassification(
  e: FactEntity,
  c: ForeignClsFields | null | undefined,
): { qual: NlQualification; basis: string } | null {
  if (isDutchEntity(e)) return null;
  if ((c?.homeClass ?? '').trim() !== '') return null; // a stored view wins, even one the 4-value vocab cannot map
  const form = `${e.name ?? ''} ${effEntityType(e) ?? ''}`.trim();
  const def = defaultClassification(effJurisdiction(e), form);
  if (!def) return null;
  // A disregarded entity and a partnership are both fiscally transparent; map them
  // straight to the 4-value vocabulary here (localQualification leaves those raw
  // strings undetermined on purpose, for a value the model actually stored).
  const qual: NlQualification = def.homeClass === 'non-transparent' ? 'non-transparent' : 'transparent';
  return { qual, basis: def.basis };
}

/**
 * The local qualification to SHOW for an entity (register + memo): the stored view
 * when there is one, else the deterministic default for a foreign entity's
 * jurisdiction + legal form, so a well-known form never displays a bare "To be
 * determined". Kept separate from effLocalQualification so the hybrid-mismatch and
 * transaction-risk seeding keep reading the raw, stored view; the default is a
 * displayed proposal, overridden by any advisor edit.
 */
export function displayLocalQualification(
  e: FactEntity,
  c: ForeignClsFields | null | undefined,
): NlQualification {
  const explicit = effLocalQualification(e, c);
  if (explicit !== 'undetermined') return explicit;
  return foreignDefaultClassification(e, c)?.qual ?? 'undetermined';
}

/**
 * True when a foreign (non-NL) entity still owes a home-state classification. Every
 * non-NL entity must record how its home state views it before the facts are
 * confirmed; the requirement is met by a stored view OR a confident jurisdiction +
 * legal-form default (so a well-known form is never "open"). An entity dismissed as
 * not relevant, or demoted out of the relevant set, is not counted.
 */
export function isForeignHomeStateOpen(
  e: FactEntity,
  c: ForeignClsFields | null | undefined,
): boolean {
  if (e.role === 'Taxpayer' || e.memberOfUnityId || e.inTaxpayerFiscalUnity) return false;
  if (e.edits?.localNotRelevant) return false;
  if (e.edits?.relevanceOverride === 'out') return false;
  const jur = (effJurisdiction(e) ?? '').toUpperCase();
  if (!jur || jur === 'NL') return false;
  return displayLocalQualification(e, c) === 'undetermined';
}

/** How many foreign entities still owe a home-state classification (gates the step). */
export function openHomeStateCount(facts: AppendixFacts): number {
  const byId = new Map(facts.classifications.map((c) => [c.entityId, c]));
  return facts.entities.filter((e) => isForeignHomeStateOpen(e, byId.get(e.id))).length;
}

/** True when this entity's derived NL qualification and the model's local (home-state) qualification are both determined and differ, or the model flagged the row hybrid. */
export function entityHasQualificationDifference(
  e: FactEntity,
  c: (ForeignClsFields & { hybrid: boolean }) | undefined,
): boolean {
  if (!c) return false;
  // A Dutch entity's home state is the Netherlands, so it carries no automatic
  // hybrid mismatch: a home-state classification the model may have proposed is
  // ignored. Only an advisor-authored foreign classification (a real non-NL
  // country set by hand) brings a Dutch entity's mismatch into play.
  if (isDutchEntity(e)) {
    const foreign = dutchForeignClassification(e, c);
    if (!foreign) return false;
    const nl = effNlQualification(e);
    return isRealQual(nl) && isRealQual(foreign.qual) && nl !== foreign.qual;
  }
  if (c.hybrid) return true;
  const nl = nlQualification(effNlTaxStatus(e));
  const local = localQualification(c.homeClass);
  return isRealQual(nl) && isRealQual(local) && nl !== local;
}

/** A determined qualification that participates in a mismatch. 'undetermined' is
 * unknown; 'irrelevant' is the advisor saying this entity is out of scope, so
 * neither can create a hybrid difference. */
function isRealQual(q: NlQualification): boolean {
  return q !== 'undetermined' && q !== 'irrelevant';
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
