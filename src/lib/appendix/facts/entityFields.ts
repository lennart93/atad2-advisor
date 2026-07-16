import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { nlQualification, type NlQualification } from './nlTaxStatus';
import { defaultNlClassification } from '@/lib/appendix/classificationDefaults';

// Effective field accessors: the advisor's edit wins over the chart/AI base.
// Used everywhere the register is read (panel, matrix, exports) so a single
// source of truth governs what an entity's jurisdiction/type/status really is.

export function effJurisdiction(e: FactEntity): string | null {
  return e.edits?.jurisdiction ?? e.jurisdiction;
}

export function effEntityType(e: FactEntity): string | null {
  return e.edits?.entityType ?? e.entityType;
}

export function effNlTaxStatus(e: FactEntity): string | null {
  return e.edits?.nlTaxStatus ?? e.nlTaxStatus;
}

// The standard line shown for a Dutch corporation classified by the mechanical
// default (nobody set a status yet).
export const DEFAULT_NL_NON_TRANSPARENT_REASON =
  'Dutch-resident company; non-transparent for Dutch corporate income tax purposes.';

/**
 * A Dutch entity whose NL classification is non-transparent by construction, even
 * before anyone sets a tax status: a corporation, and the Dutch taxpayer / fiscal
 * unity (both Dutch corporate taxpayers). Partnerships, the hybrid / reverse-hybrid
 * forms, trusts and any foreign entity are deliberately NOT covered - those are the
 * classification calls that need the advisor (CV / Wet FKR, hybrid analysis).
 */
function defaultsToNonTransparentNl(e: FactEntity): boolean {
  if ((effJurisdiction(e) ?? '').toUpperCase() !== 'NL') return false;
  if (e.role === 'Taxpayer' || e.isFiscalUnity || e.inTaxpayerFiscalUnity || e.memberOfUnityId) return true;
  return effEntityType(e) === 'corporation';
}

/**
 * The deterministic foreign-entity NL default: a well-known corporate form
 * (S.A., N.V., GmbH, Ltd, ...) is comparable to a Dutch N.V./B.V. on the Dutch
 * classification lists and therefore non-transparent naar Nederlandse
 * maatstaven, before and after 2025 alike. Null for a Dutch entity or any form
 * that is a genuine judgment call (LLC, LP, SCS(p), KG, CV, ...).
 */
function foreignNlDefault(e: FactEntity) {
  return defaultNlClassification(effJurisdiction(e), `${e.name ?? ''} ${effEntityType(e) ?? ''}`);
}

/**
 * True when no DECIDED status stands for this entity: nothing stored at all, or
 * the AI answered "unknown" (an absent answer, not a decision) with no advisor
 * edit on top. An advisor's explicit pick, including an explicit "To be
 * determined", always counts as decided and blocks the deterministic defaults.
 */
function nlStatusUndecided(e: FactEntity): boolean {
  if (e.edits?.nlTaxStatus !== undefined) return false;
  const status = e.nlTaxStatus;
  return !status || nlQualification(status) === 'undetermined';
}

/**
 * The NL qualification to display for an entity. An explicit status (advisor edit
 * or AI) always wins; absent one, a Dutch corporation falls back to
 * non-transparent, a foreign entity with a well-known corporate form falls back
 * to the classification-list default, and everything else stays undetermined.
 */
export function effNlQualification(e: FactEntity): NlQualification {
  const status = effNlTaxStatus(e);
  if (status && !nlStatusUndecided(e)) return nlQualification(status);
  if (defaultsToNonTransparentNl(e)) return 'non-transparent';
  return foreignNlDefault(e) ? 'non-transparent' : 'undetermined';
}

/**
 * The "why" behind the NL classification: the AI/advisor reason when present, else
 * the standard line for a Dutch corporation taken by the default, else the
 * classification-list basis for a foreign corporate form. Null when there is
 * nothing to explain.
 */
export function effNlQualificationReason(e: FactEntity): string | null {
  if (e.nlTaxStatusReason) return e.nlTaxStatusReason;
  if (!nlStatusUndecided(e)) return null;
  if (defaultsToNonTransparentNl(e)) return DEFAULT_NL_NON_TRANSPARENT_REASON;
  return foreignNlDefault(e)?.basis ?? null;
}

/**
 * The advisor's relation-type override ("Parent", "Sister company", ...); null
 * when the derived role still stands.
 */
export function effRelationType(e: FactEntity): string | null {
  return e.edits?.relationType ?? null;
}

/**
 * The effective related-party percentage: the advisor's override wins, including
 * an explicit clear (relatedPct: null reads as "no percentage", it does NOT fall
 * back to the chart value).
 */
export function effRelatedPct(e: FactEntity): number | null {
  const edited = e.edits?.relatedPct;
  return edited !== undefined ? edited : e.ownershipPct ?? e.relatedViaPct ?? null;
}

/** The advisor's edited relation reasoning, else the given derived fallback. */
export function effRelationReason(e: FactEntity, derived: string | null): string | null {
  return e.edits?.relationReason ?? derived;
}

/** The advisor's edited NL-classification reasoning, else the AI/default line. */
export function effNlReason(e: FactEntity): string | null {
  return e.edits?.nlReason ?? effNlQualificationReason(e);
}

/** The advisor's edited home-state reasoning, else the given derived fallback. */
export function effLocalReason(e: FactEntity, derived: string | null): string | null {
  return e.edits?.localReason ?? derived;
}

type EditableField =
  | 'jurisdiction' | 'entityType' | 'nlTaxStatus'
  | 'relationType' | 'roleLabel' | 'relatedPct' | 'relationReason' | 'nlReason' | 'localReason';

/** Immutably set one advisor override on the entity with the given register id. */
export function withEntityEdit(
  facts: AppendixFacts,
  id: string,
  field: EditableField,
  value: string | number | null,
): AppendixFacts {
  return {
    ...facts,
    entities: facts.entities.map((e) =>
      e.id === id ? { ...e, edits: { ...e.edits, [field]: value } } : e,
    ),
  };
}
