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

  it('treats an AI fiscal-unity related-flag flip as in sync (the chart did not change)', () => {
    // The facts step stores a document-detected fiscal-unity member with related=false
    // (it is part of the taxpayer, not a separate related party); a pure chart rebuild
    // re-derives related=true. Nothing structural changed, so this must NOT count as
    // "out of date" — otherwise the appendix is flagged stale forever and the structure
    // step keeps re-triggering generation in a loop.
    const stored = [
      ent('E1', { role: 'Taxpayer', ownershipPct: null, related: false }),
      ent('E2', { role: 'Group entity', ownershipPct: null, relatedVia: 'E1', relatedViaPct: 100, related: false, inTaxpayerFiscalUnity: true }),
    ];
    const fromChart = [
      ent('E1', { role: 'Taxpayer', ownershipPct: null, related: false }),
      ent('E2', { role: 'Group entity', ownershipPct: null, relatedVia: 'E1', relatedViaPct: 100, related: true }),
    ];
    expect(registerMatchesChart(stored, fromChart)).toBe(true);
  });

  it('still catches a genuine relatedness change (relatedVia appears)', () => {
    // Dropping `related` from the comparison must not blind it to real structural
    // change: when a common >25% parent newly associates a group entity, relatedVia
    // (which IS compared) appears, so the mismatch is still detected.
    const base = [
      ent('E1', { role: 'Taxpayer', ownershipPct: null }),
      ent('E2', { role: 'Group entity', ownershipPct: null, related: false, relatedVia: null, relatedViaPct: null }),
    ];
    const changed = [
      base[0],
      ent('E2', { role: 'Group entity', ownershipPct: null, related: true, relatedVia: 'E1', relatedViaPct: 40 }),
    ];
    expect(registerMatchesChart(base, changed)).toBe(false);
  });
});
