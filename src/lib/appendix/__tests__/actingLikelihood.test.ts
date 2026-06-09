import { describe, it, expect } from 'vitest';
import {
  ACTING_LIKELIHOODS, ACTING_LIKELIHOOD_KEYS, actingLikelihoodLabel, isActingLikelihood,
} from '@/lib/appendix/facts/actingLikelihood';

describe('acting-together likelihood', () => {
  it('has five ordered levels', () => {
    expect(ACTING_LIKELIHOOD_KEYS).toEqual([
      'highly_unlikely', 'unlikely', 'unclear', 'likely', 'highly_likely',
    ]);
    expect(ACTING_LIKELIHOODS.map((l) => l.key)).toEqual([...ACTING_LIKELIHOOD_KEYS]);
  });
  it('labels each level and falls back to Unclear', () => {
    expect(actingLikelihoodLabel('likely')).toBe('Likely');
    expect(actingLikelihoodLabel('highly_unlikely')).toBe('Highly unlikely');
    expect(actingLikelihoodLabel('garbage')).toBe('Unclear');
    expect(actingLikelihoodLabel(null)).toBe('Unclear');
  });
  it('recognises valid keys', () => {
    expect(isActingLikelihood('unclear')).toBe(true);
    expect(isActingLikelihood('maybe')).toBe(false);
    expect(isActingLikelihood(null)).toBe(false);
  });
});
