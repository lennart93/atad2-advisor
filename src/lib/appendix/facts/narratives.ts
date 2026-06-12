import type { AppendixFacts, NarrativeKey } from '@/lib/appendix/types';

/** Funnel section order; matches the FactsPanel and export layout. */
export const NARRATIVE_KEYS: readonly NarrativeKey[] = ['register', 'related', 'flows', 'classification'];

/** Hand-edit a section sentence; an edited sentence survives regeneration. */
export function withNarrative(facts: AppendixFacts, key: NarrativeKey, text: string): AppendixFacts {
  return { ...facts, narratives: { ...facts.narratives, [key]: { text, source: 'edited' } } };
}
