import { describe, it, expect } from 'vitest';
import { conditionRiskLevel, rowTone } from '@/lib/appendix/conditionPolarity';

describe('conditionRiskLevel', () => {
  it('insufficient -> amber regardless of polarity', () => {
    expect(conditionRiskLevel('Insufficient information', '3.1')).toBe('insufficient');
    expect(conditionRiskLevel('Insufficient information', '2.3')).toBe('insufficient');
  });

  it('risk_if_met (default): Met is unfavourable, Not met is favourable', () => {
    expect(conditionRiskLevel('Triggered', '3.1')).toBe('unfavourable'); // primary-rule mismatch
    expect(conditionRiskLevel('Not triggered', '3.1')).toBe('favourable');
    expect(conditionRiskLevel('Triggered', 'unknown-row')).toBe('unfavourable'); // default
  });

  it('structured arrangement (2.2) Not met is favourable (the user example)', () => {
    expect(conditionRiskLevel('Not triggered', '2.2')).toBe('favourable');
    expect(conditionRiskLevel('Triggered', '2.2')).toBe('unfavourable');
  });

  it('risk_if_not_met inverts: absence is the risk (e.g. dual-inclusion income 2.3)', () => {
    expect(conditionRiskLevel('Not triggered', '2.3')).toBe('unfavourable');
    expect(conditionRiskLevel('Triggered', '2.3')).toBe('favourable');
  });

  it('neutral scope/precondition rows carry no risk colour either way', () => {
    expect(conditionRiskLevel('Triggered', '1.1')).toBe('neutral');
    expect(conditionRiskLevel('Not triggered', '1.1')).toBe('neutral');
    expect(conditionRiskLevel('Triggered', '2.1')).toBe('neutral'); // the 25% test
  });
});

describe('rowTone', () => {
  it('a satisfied scope/precondition gate reads clear, never an alarm', () => {
    // The user complaint: in scope (1.1), cross-border (1.2), related party (2.1)
    // being "Triggered" is the normal baseline, so it must be a calm check.
    expect(rowTone('Triggered', '1.1')).toBe('clear');
    expect(rowTone('Triggered', '1.2')).toBe('clear');
    expect(rowTone('Triggered', '2.1')).toBe('clear');
    expect(rowTone('Not triggered', '1.1')).toBe('clear');
  });

  it('a substantive mismatch that fires still reads risk (amber)', () => {
    expect(rowTone('Triggered', '3.1')).toBe('risk');
    expect(rowTone('Not triggered', '3.1')).toBe('clear');
    expect(rowTone('Triggered', '2.2')).toBe('risk'); // structured arrangement present
  });

  it('N/A is muted and Insufficient information is amber on any row', () => {
    expect(rowTone('N/A', '1.1')).toBe('na');
    expect(rowTone('N/A', '3.1')).toBe('na');
    expect(rowTone('Insufficient information', '1.1')).toBe('caution'); // scope gate, info missing
    expect(rowTone('Insufficient information', '2.3')).toBe('caution');
  });

  it('null status falls through to clear', () => {
    expect(rowTone(null, '3.1')).toBe('clear');
  });

  it('risk_if_not_met rows alarm when NOT met, and read clear when met', () => {
    // For these rows the absence is the risk: no dual-inclusion income (2.3),
    // an exception that does not apply (5.3, 8.3), a mismatch not already
    // neutralised (6.5). Keying on the raw label painted the danger green.
    for (const rowId of ['2.3', '5.3', '6.5', '8.3']) {
      expect(rowTone('Not triggered', rowId)).toBe('risk');
      expect(rowTone('Triggered', rowId)).toBe('clear');
    }
  });
});
