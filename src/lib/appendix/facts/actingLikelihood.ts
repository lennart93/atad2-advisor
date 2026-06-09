// The likelihood that a candidate cluster qualifies as an acting-together
// group. Five ordered levels with a neutral middle. The AI proposes a default
// and pre-writes a rationale per level so switching the level swaps the text
// without a new AI call.

export type ActingLikelihood =
  | 'highly_unlikely' | 'unlikely' | 'unclear' | 'likely' | 'highly_likely';

export const ACTING_LIKELIHOOD_KEYS = [
  'highly_unlikely', 'unlikely', 'unclear', 'likely', 'highly_likely',
] as const;

export const ACTING_LIKELIHOODS: ReadonlyArray<{ key: ActingLikelihood; label: string }> = [
  { key: 'highly_unlikely', label: 'Highly unlikely' },
  { key: 'unlikely',        label: 'Unlikely' },
  { key: 'unclear',         label: 'Unclear' },
  { key: 'likely',          label: 'Likely' },
  { key: 'highly_likely',   label: 'Highly likely' },
];

const KNOWN = new Set<string>(ACTING_LIKELIHOOD_KEYS);

export function isActingLikelihood(v: string | null | undefined): v is ActingLikelihood {
  return v != null && KNOWN.has(v);
}

export function actingLikelihoodLabel(v: string | null | undefined): string {
  return ACTING_LIKELIHOODS.find((l) => l.key === v)?.label ?? 'Unclear';
}
