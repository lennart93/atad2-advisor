import { describe, it, expect } from 'vitest';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';

describe('APPENDIX_SKELETON', () => {
  it('has unique row ids', () => {
    const ids = APPENDIX_SKELETON.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('covers art. 12aa(1)(a)-(g) as seven rows in section 1', () => {
    const limbs = APPENDIX_SKELETON.filter((r) => r.sectionId === '1').map((r) => r.rowId);
    expect(limbs).toEqual(['1.a', '1.b', '1.c', '1.d', '1.e', '1.f', '1.g']);
  });
  it('only the art. 3 inbound section is conditional on Q2', () => {
    const conditional = APPENDIX_SKELETON.filter((r) => r.renderIfQuestionEquals);
    expect(conditional.every((r) => r.sectionId === '1bis')).toBe(true);
    expect(conditional.every((r) => r.renderIfQuestionEquals?.questionId === 'Q2')).toBe(true);
  });
  it('flags the contested and unverified legal points', () => {
    const byId = Object.fromEntries(APPENDIX_SKELETON.map((r) => [r.rowId, r]));
    expect(byId['1.g'].flags).toContain('contested');     // origin requirement on sub g
    expect(byId['6.1'].flags).toContain('unverified');    // art. 12af lid 2/3
  });
  it('every row has a non-empty legal framework and at least one allowed state', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.legalFramework.length).toBeGreaterThan(0);
      expect(r.allowedStates.length).toBeGreaterThan(0);
    }
  });
});
