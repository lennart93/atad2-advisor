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
  | 'unknown';

export const NL_TAX_STATUSES: ReadonlyArray<{ key: NlTaxStatusKey; label: string }> = [
  { key: 'resident',       label: 'Resident taxpayer' },
  { key: 'nonresident_pe', label: 'Non-resident taxpayer (NL PE)' },
  { key: 'outside_cit',    label: 'Outside NL CIT' },
  { key: 'transparent',    label: 'Transparent for NL' },
  { key: 'unknown',        label: 'Unknown' },
];

export type NlQualification = 'transparent' | 'non-transparent' | 'undetermined';

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
      return 'non-transparent';
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
    default:
      return 'To be determined';
  }
}
