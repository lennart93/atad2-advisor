import { describe, it, expect } from 'vitest';
import { cleanReasoning } from '@/lib/appendix/reasoningText';

describe('cleanReasoning', () => {
  it('strips the stock opener and recapitalizes', () => {
    expect(cleanReasoning('Based on the available information, Castleton holds 62.7% of the shares.'))
      .toBe('Castleton holds 62.7% of the shares.');
    expect(cleanReasoning('based on provided documents: the loan is interest-free.'))
      .toBe('The loan is interest-free.');
  });

  it('leaves normal sentences alone', () => {
    expect(cleanReasoning('The taxpayer is a Dutch resident.')).toBe('The taxpayer is a Dutch resident.');
  });

  it('tolerates null and a string that is only the opener', () => {
    expect(cleanReasoning(null)).toBe('');
    expect(cleanReasoning('Based on the available information, ')).toBe('Based on the available information,');
  });
});
