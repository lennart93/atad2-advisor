import { describe, it, expect } from 'vitest';
import { withNarrative, NARRATIVE_KEYS } from '@/lib/appendix/facts/narratives';
import { normalizeFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts } from '@/lib/appendix/types';

const base = (): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions: [],
  narratives: { register: { text: 'AI intro.', source: 'ai' } },
});

describe('narratives', () => {
  it('has the four funnel keys in order', () => {
    expect(NARRATIVE_KEYS).toEqual(['register', 'related', 'flows', 'classification']);
  });

  it('withNarrative sets text and marks the key edited, leaving others alone', () => {
    const next = withNarrative(base(), 'register', 'My text.');
    expect(next.narratives?.register).toEqual({ text: 'My text.', source: 'edited' });
    const other = withNarrative(base(), 'flows', 'Flows intro.');
    expect(other.narratives?.flows).toEqual({ text: 'Flows intro.', source: 'edited' });
    expect(other.narratives?.register).toEqual({ text: 'AI intro.', source: 'ai' });
  });

  it('normalizeFacts carries narratives and tolerates their absence', () => {
    expect(normalizeFacts(base()).narratives?.register?.text).toBe('AI intro.');
    expect(normalizeFacts({ entities: [] }).narratives).toBeUndefined();
    expect(normalizeFacts(null).narratives).toBeUndefined();
  });
});
