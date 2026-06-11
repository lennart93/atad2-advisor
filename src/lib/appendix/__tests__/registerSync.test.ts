import { describe, it, expect } from 'vitest';
import { registerMatchesChart } from '@/lib/appendix/facts/registerSync';
import type { FactEntity } from '@/lib/appendix/types';

const ent = (id: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: `c-${id}`, name: id, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Subsidiary', ownershipPct: 100, related: true, nlTaxStatus: null, ...patch,
});

describe('registerMatchesChart', () => {
  it('matches when only AI/advisor fields differ', () => {
    const stored = [ent('E1', { role: 'Taxpayer', nlTaxStatus: 'resident', position: 'x', hidden: true, edits: { jurisdiction: 'US' } })];
    const fromChart = [ent('E1', { role: 'Taxpayer' })];
    expect(registerMatchesChart(stored, fromChart)).toBe(true);
  });

  it('mismatches on an added entity, a changed percentage and a changed role', () => {
    const base = [ent('E1', { role: 'Taxpayer', ownershipPct: null }), ent('E2')];
    expect(registerMatchesChart(base, [...base, ent('E3')])).toBe(false);
    expect(registerMatchesChart(base, [base[0], ent('E2', { ownershipPct: 60 })])).toBe(false);
    expect(registerMatchesChart(base, [base[0], ent('E2', { role: 'Parent' })])).toBe(false);
  });

  it('is order-insensitive', () => {
    const a = [ent('E1', { role: 'Taxpayer', ownershipPct: null }), ent('E2')];
    expect(registerMatchesChart(a, [...a].reverse())).toBe(true);
  });
});
