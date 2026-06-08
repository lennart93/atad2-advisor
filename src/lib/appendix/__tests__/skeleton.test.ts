import { describe, it, expect } from 'vitest';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';
import { STATUS_VALUES } from '@/lib/appendix/status';

const byId = Object.fromEntries(APPENDIX_SKELETON.map((r) => [r.rowId, r]));

describe('APPENDIX_SKELETON (v2)', () => {
  it('has unique row ids', () => {
    const ids = APPENDIX_SKELETON.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers art. 12aa(1)(a)-(g) as the seven core rows in section 3', () => {
    const core = ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7'];
    for (const id of core) expect(byId[id]).toBeTruthy();
    expect(core.every((id) => byId[id].sectionId === '3')).toBe(true);
  });

  it('only the art. 3 inbound rows are conditional on Q2', () => {
    const conditional = APPENDIX_SKELETON.filter((r) => r.renderIfQuestionEquals);
    expect(conditional.length).toBeGreaterThan(0);
    expect(conditional.every((r) => r.renderIfQuestionEquals?.questionId === 'Q2')).toBe(true);
  });

  it('grounds relatedness in art. 12ac lid 2, never in art. 10a(6)', () => {
    expect(byId['1.3'].legalBasis).toContain('12ac lid 2');
    expect(byId['2.1'].legalBasis).toContain('12ac lid 2');
    for (const r of APPENDIX_SKELETON) {
      expect(r.legalBasis.includes('10a(6)')).toBe(false);
      expect(r.legalBasis.includes('10a lid 6')).toBe(false);
    }
  });

  it('fills the reverse-hybrid leden (art. 2 lid 11 / lid 12)', () => {
    expect(byId['1.5'].legalBasis).toContain('lid 11');
    expect(byId['1.6'].legalBasis).toContain('lid 12');
    for (const r of APPENDIX_SKELETON) expect(r.legalBasis.includes('verify live lid')).toBe(false);
  });

  it('disapplies the object exemption for a disregarded PE (art. 15e lid 9)', () => {
    expect(byId['3.4'].legalBasis).toContain('15e lid 9');
  });

  it('contains no FKR remnants and no art. 12ag documentation section', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(`${r.legalBasis} ${r.conditionTested}`.includes('FKR')).toBe(false);
      expect(r.legalBasis.includes('12ag')).toBe(false);
    }
  });

  it('uses one controlled status vocabulary for every row', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.allowedStates.length).toBeGreaterThan(0);
      expect(r.allowedStates.every((s) => STATUS_VALUES.includes(s))).toBe(true);
    }
  });

  it('every row has a non-empty legal basis and condition tested', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.legalBasis.length).toBeGreaterThan(0);
      expect(r.conditionTested.length).toBeGreaterThan(0);
    }
  });
});
