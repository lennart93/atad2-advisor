import type { AppendixFacts, AppendixSectionKey } from '@/lib/appendix/types';

/** The Part A exhibits, in display order, with their labels. */
export const APPENDIX_SECTIONS: ReadonlyArray<{ key: AppendixSectionKey; label: string }> = [
  { key: 'entityRegister', label: 'Entity register' },
  { key: 'relatedness', label: 'Relatedness' },
  { key: 'actingTogether', label: 'Acting together' },
  { key: 'classification', label: 'Classification' },
  { key: 'transactions', label: 'Transaction map' },
];

/** True when the advisor has dropped this whole section from the client export. */
export function isSectionExcluded(
  facts: Pick<AppendixFacts, 'excludedSections'> | null | undefined,
  key: AppendixSectionKey,
): boolean {
  return !!facts?.excludedSections?.includes(key);
}

/** Immutably toggle a whole section in/out of the client export. */
export function withSectionExcluded(
  facts: AppendixFacts,
  key: AppendixSectionKey,
  excluded: boolean,
): AppendixFacts {
  const set = new Set(facts.excludedSections ?? []);
  if (excluded) set.add(key);
  else set.delete(key);
  return { ...facts, excludedSections: [...set] };
}
