import { describe, it, expect } from 'vitest';
import { fillActingTemplate, joinNames, actingBasisLabel, isActingBasis } from '@/lib/appendix/facts/actingBasis';

describe('joinNames', () => {
  it('reads as a natural list', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinNames(['A', '', '  '])).toBe('A'); // blanks dropped
  });
});

describe('fillActingTemplate', () => {
  it('family: fills the first two members and the target', () => {
    const t = fillActingTemplate('family', { members: ['Anna Jansen', 'Bram Jansen'], target: 'HoldCo B.V.' });
    expect(t).toContain('Anna Jansen and Bram Jansen are held within the same family group.');
    expect(t).toContain('voting rights and capital of HoldCo B.V.');
  });

  it("shareholders' agreement: fills the full parties list and target", () => {
    const t = fillActingTemplate('shareholders_agreement', { members: ['A', 'B', 'C'], target: 'T' });
    expect(t).toContain("A, B and C have entered into a shareholders'/voting arrangement in respect of T.");
    expect(t).toContain('25%/50% related-party thresholds');
  });

  it('fund structure: first member is the fund/GP, the rest are the investors', () => {
    const t = fillActingTemplate('fund_structure', { members: ['GP Fund', 'LP One', 'LP Two'], target: 'PortCo' });
    expect(t).toContain('GP Fund and the participating LP One and LP Two act together in respect of PortCo');
  });

  it('coordinated management: fills [entities] and renders [board/management] as prose', () => {
    const t = fillActingTemplate('coordinated_management', { members: ['X', 'Y'], target: 'T' });
    expect(t).toContain('X and Y are managed on a coordinated basis (common/overlapping board/management)');
    expect(t).not.toContain('[');
  });

  it('other: no suggestion text (free text basis)', () => {
    expect(fillActingTemplate('other', { members: ['A', 'B'], target: 'T' })).toBe('');
  });

  it('falls back gracefully when the target is missing', () => {
    const t = fillActingTemplate('family', { members: ['A', 'B'], target: null });
    expect(t).toContain('voting rights and capital of the taxpayer');
    expect(t).not.toContain('[target]');
  });
});

describe('actingBasisLabel / isActingBasis', () => {
  it('labels every known basis and defaults unknown to Other', () => {
    expect(actingBasisLabel('family')).toBe('Family relationship');
    expect(actingBasisLabel('nonsense')).toBe('Other');
    expect(isActingBasis('fund_structure')).toBe(true);
    expect(isActingBasis('nope')).toBe(false);
    expect(isActingBasis(null)).toBe(false);
  });
});
