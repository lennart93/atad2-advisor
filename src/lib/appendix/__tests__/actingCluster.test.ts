import { describe, it, expect } from 'vitest';
import { withClusterLikelihood, withClusterText, withClusterExclude } from '@/lib/appendix/facts/actingCluster';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts } from '@/lib/appendix/types';

const cluster = {
  id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: 18,
  likelihood: 'unlikely' as const, aiLikelihood: 'unlikely' as const,
  rationales: {
    highly_unlikely: 'HU text', unlikely: 'U text', unclear: 'UC text',
    likely: 'L text', highly_likely: 'HL text',
  },
  reasoning: 'U text', excludedFromClient: false, source: 'ai' as const,
};
const facts = (): AppendixFacts => ({ ...emptyFacts(), actingTogether: [cluster] });

describe('acting-cluster patch helpers', () => {
  it('changing the likelihood swaps reasoning to that level text and marks edited', () => {
    const out = withClusterLikelihood(facts(), 'A1', 'likely');
    expect(out.actingTogether[0].likelihood).toBe('likely');
    expect(out.actingTogether[0].reasoning).toBe('L text');
    expect(out.actingTogether[0].source).toBe('edited');
  });
  it('editing the text sets reasoning and marks edited, leaving likelihood', () => {
    const out = withClusterText(facts(), 'A1', 'my own words');
    expect(out.actingTogether[0].reasoning).toBe('my own words');
    expect(out.actingTogether[0].likelihood).toBe('unlikely');
    expect(out.actingTogether[0].source).toBe('edited');
  });
  it('toggling exclude does not touch source', () => {
    const out = withClusterExclude(facts(), 'A1', true);
    expect(out.actingTogether[0].excludedFromClient).toBe(true);
    expect(out.actingTogether[0].source).toBe('ai');
  });
});
