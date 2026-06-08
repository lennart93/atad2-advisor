import { describe, it, expect } from 'vitest';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';
import { STATUS_VALUES } from '@/lib/appendix/status';

const byId = Object.fromEntries(APPENDIX_SKELETON.map((r) => [r.rowId, r]));

describe('APPENDIX_SKELETON (v3)', () => {
  it('has unique row ids', () => {
    const ids = APPENDIX_SKELETON.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('section 1 is pure scope (no relatedness or reverse-hybrid rows)', () => {
    const s1 = APPENDIX_SKELETON.filter((r) => r.sectionId === '1').map((r) => r.rowId);
    expect(s1).toEqual(['1.1', '1.2']);
  });

  it('reverse hybrid (art. 2) is its own section 8', () => {
    const s8 = APPENDIX_SKELETON.filter((r) => r.sectionId === '8').map((r) => r.rowId);
    expect(s8).toEqual(['8.1', '8.2', '8.3']);
    expect(s8.every((id) => byId[id].legalBasis.startsWith('Article 2'))).toBe(true);
  });

  it('covers art. 12aa(1)(a)-(g) as the seven core rows in section 3', () => {
    const core = ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7'];
    for (const id of core) expect(byId[id].sectionId).toBe('3');
  });

  it('only the art. 3 inbound rows are conditional on Q2', () => {
    const conditional = APPENDIX_SKELETON.filter((r) => r.renderIfQuestionEquals);
    expect(conditional.length).toBeGreaterThan(0);
    expect(conditional.every((r) => r.renderIfQuestionEquals?.questionId === 'Q2')).toBe(true);
  });

  it('uses English citations without the year, never Dutch terms', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.legalBasis.includes('1969')).toBe(false);
      expect(r.legalBasis.includes('Wet Vpb')).toBe(false);
      expect(/\blid\b/.test(r.legalBasis)).toBe(false);
      expect(r.legalBasis === 'N/A' || r.legalBasis.includes('CIT Act')).toBe(true);
    }
  });

  it('row 1.2 (cross-border element) has no statutory citation', () => {
    expect(byId['1.2'].legalBasis).toBe('N/A');
  });

  it('grounds relatedness in art. 12ac par. 2, never in art. 10a(6)', () => {
    expect(byId['2.1'].legalBasis).toContain('12ac par. 2');
    for (const r of APPENDIX_SKELETON) expect(r.legalBasis.includes('10a(6)')).toBe(false);
  });

  it('fills the reverse-hybrid leden (art. 2 par. 11 / par. 12) and 15e par. 9', () => {
    expect(byId['8.2'].legalBasis).toContain('par. 11');
    expect(byId['8.3'].legalBasis).toContain('par. 12');
    expect(byId['3.4'].legalBasis).toContain('15e par. 9');
  });

  it('only operative rows get the traffic-light colour', () => {
    expect(byId['3.2'].kind).toBe('operative');
    expect(byId['5.2'].kind).toBe('operative');
    expect(byId['4.1'].kind).toBe('operative');
    expect(byId['1.1'].kind).toBe('gate');
    expect(byId['2.1'].kind).toBe('gate');
    expect(byId['8.1'].kind).toBe('gate');
    for (const r of APPENDIX_SKELETON) expect(['gate', 'operative']).toContain(r.kind);
  });

  it('surfaces related parties: inline on 2.1, popover on 6.1 and 8.2', () => {
    expect(byId['2.1'].relatedView).toBe('inline');
    expect(byId['6.1'].relatedView).toBe('popover');
    expect(byId['8.2'].relatedView).toBe('popover');
    const withView = APPENDIX_SKELETON.filter((r) => r.relatedView !== 'none').map((r) => r.rowId);
    expect(withView.sort()).toEqual(['2.1', '6.1', '8.2']);
  });

  it('contains no FKR remnants and no art. 12ag documentation section', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(`${r.legalBasis} ${r.conditionTested}`.includes('FKR')).toBe(false);
      expect(r.legalBasis.includes('12ag')).toBe(false);
    }
  });

  it('uses one controlled status vocabulary, with non-empty text', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.allowedStates.every((s) => STATUS_VALUES.includes(s))).toBe(true);
      expect(r.legalBasis.length).toBeGreaterThan(0);
      expect(r.conditionTested.length).toBeGreaterThan(0);
    }
  });
});
