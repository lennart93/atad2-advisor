// The Dutch tax status of an entity, and the entity classification (transparent
// vs non-transparent) that follows from it. The advisor picks the status from a
// fixed list; the NL qualification is then fully derived - a Dutch resident
// taxpayer, a non-resident with a Dutch PE and an entity outside Dutch CIT are
// all treated as non-transparent, only "transparent for NL" yields transparent.

export type NlTaxStatusKey =
  | 'resident'        // Dutch resident taxpayer (binnenlands belastingplichtig)
  | 'nonresident_pe'  // non-resident taxpayer with a Dutch PE (buitenlands, NL VI)
  | 'outside_cit'     // outside the scope of Dutch CIT (buiten NL Vpb)
  | 'transparent'     // transparent for NL (fiscaal transparant)
  | 'non_transparent' // non-transparent for NL, no finer detail recorded (advisor pick)
  | 'reverse_hybrid'  // reverse hybrid (art. 2(12) Wet Vpb)
  | 'unknown';

export const NL_TAX_STATUSES: ReadonlyArray<{ key: NlTaxStatusKey; label: string }> = [
  { key: 'resident',        label: 'Resident taxpayer' },
  { key: 'nonresident_pe',  label: 'Non-resident taxpayer (NL PE)' },
  { key: 'outside_cit',     label: 'Outside NL CIT' },
  { key: 'transparent',     label: 'Transparent for NL' },
  { key: 'non_transparent', label: 'Non-transparent' },
  { key: 'reverse_hybrid',  label: 'Reverse hybrid' },
  { key: 'unknown',         label: 'Unknown' },
];

export type NlQualification = 'transparent' | 'non-transparent' | 'reverse-hybrid' | 'undetermined';

/**
 * The advisor-facing classification select (register detail): one option per
 * qualification, each mapped to the tax-status key it stores. The richer status
 * keys (resident, PE, ...) remain valid stored values; this list is only what
 * the select offers when the advisor changes the value by hand.
 */
export const NL_CLASSIFICATION_OPTIONS: ReadonlyArray<{
  qual: NlQualification; statusKey: NlTaxStatusKey; label: string;
}> = [
  { qual: 'non-transparent', statusKey: 'non_transparent', label: 'Non-transparent' },
  { qual: 'transparent',     statusKey: 'transparent',     label: 'Transparent' },
  { qual: 'reverse-hybrid',  statusKey: 'reverse_hybrid',  label: 'Reverse hybrid' },
  { qual: 'undetermined',    statusKey: 'unknown',         label: 'To be determined' },
];

const KNOWN_KEYS = new Set<string>(NL_TAX_STATUSES.map((s) => s.key));

export function isNlTaxStatusKey(value: string | null | undefined): value is NlTaxStatusKey {
  return value != null && KNOWN_KEYS.has(value);
}

/**
 * The NL entity classification implied by a tax status. Resident, non-resident
 * with a PE and outside-CIT all imply a non-transparent (opaque) entity for NL;
 * only an explicitly transparent status yields transparent. Anything unknown or
 * unrecognised stays undetermined.
 */
export function nlQualification(status: string | null | undefined): NlQualification {
  switch (status) {
    case 'transparent':
      return 'transparent';
    case 'resident':
    case 'nonresident_pe':
    case 'outside_cit':
    case 'non_transparent':
      return 'non-transparent';
    case 'reverse_hybrid':
      return 'reverse-hybrid';
    default:
      return 'undetermined';
  }
}

/** Human label for a status key; falls back to the raw value, then "Unknown". */
export function nlTaxStatusLabel(status: string | null | undefined): string {
  const hit = NL_TAX_STATUSES.find((s) => s.key === status);
  if (hit) return hit.label;
  return status && status.trim() ? status : 'Unknown';
}

export function nlQualificationLabel(q: NlQualification): string {
  switch (q) {
    case 'transparent':
      return 'Transparent';
    case 'non-transparent':
      return 'Non-transparent';
    case 'reverse-hybrid':
      return 'Reverse hybrid';
    default:
      return 'To be determined';
  }
}
