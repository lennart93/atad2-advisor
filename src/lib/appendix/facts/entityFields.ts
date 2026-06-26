import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { nlQualification, type NlQualification } from './nlTaxStatus';

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
 * The NL qualification to display for an entity. An explicit status (advisor edit
 * or AI) always wins; absent one, a Dutch corporation falls back to non-transparent
 * and everything else stays undetermined.
 */
export function effNlQualification(e: FactEntity): NlQualification {
  const status = effNlTaxStatus(e);
  if (status) return nlQualification(status);
  return defaultsToNonTransparentNl(e) ? 'non-transparent' : 'undetermined';
}

/**
 * The "why" behind the NL classification: the AI/advisor reason when present, else
 * the standard line for a Dutch corporation taken by the default. Null when there
 * is nothing to explain.
 */
export function effNlQualificationReason(e: FactEntity): string | null {
  if (e.nlTaxStatusReason) return e.nlTaxStatusReason;
  if (!effNlTaxStatus(e) && defaultsToNonTransparentNl(e)) return DEFAULT_NL_NON_TRANSPARENT_REASON;
  return null;
}

type EditableField = 'jurisdiction' | 'entityType' | 'nlTaxStatus';

/** Immutably set one advisor override on the entity with the given register id. */
export function withEntityEdit(
  facts: AppendixFacts,
  id: string,
  field: EditableField,
  value: string | null,
): AppendixFacts {
  return {
    ...facts,
    entities: facts.entities.map((e) =>
      e.id === id ? { ...e, edits: { ...e.edits, [field]: value } } : e,
    ),
  };
}
