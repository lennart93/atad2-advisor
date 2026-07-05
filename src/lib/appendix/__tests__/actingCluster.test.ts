import { describe, it, expect } from 'vitest';
import {
  withClusterLikelihood, withClusterText, withClusterExclude,
  addActingGroup, removeActingCluster, withClusterName, withClusterBasis,
  withClusterTarget, resetClusterReasoning, withClusterVisibility,
  adoptActingSuggestion, withClusterMembers,
} from '@/lib/appendix/facts/actingCluster';
import { actingInClientReport } from '@/lib/appendix/facts/actingAnnex';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';

const cluster = {
  id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: 18,
  likelihood: 'unlikely' as const,
  reasoning: 'The Forbion vehicles together hold a minority interest.', excludedFromClient: false, source: 'ai' as const,
};
const facts = (): AppendixFacts => ({ ...emptyFacts(), actingTogether: [cluster] });

describe('acting-cluster patch helpers', () => {
  it('changing the likelihood keeps the single assessment text and marks edited', () => {
    const out = withClusterLikelihood(facts(), 'A1', 'likely');
    expect(out.actingTogether[0].likelihood).toBe('likely');
    expect(out.actingTogether[0].reasoning).toBe('The Forbion vehicles together hold a minority interest.'); // text unchanged
    expect(out.actingTogether[0].source).toBe('edited');
  });
  it('changing the likelihood re-derives the annex outcome, clearing a manual override', () => {
    const withOverride: AppendixFacts = {
      ...emptyFacts(),
      actingTogether: [{ ...cluster, includeInClient: true }],
    };
    const down = withClusterLikelihood(withOverride, 'A1', 'unlikely');
    expect(down.actingTogether[0].includeInClient).toBeUndefined();
    expect(down.actingTogether[0].excludedFromClient).toBe(true);
    const up = withClusterLikelihood(withOverride, 'A1', 'highly_likely');
    expect(up.actingTogether[0].includeInClient).toBeUndefined();
    expect(up.actingTogether[0].excludedFromClient).toBe(false);
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

// ---------------------------------------------------------------------------
// Manual group builder
// ---------------------------------------------------------------------------

const ent = (id: string, name: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: id, name, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Parent', ownershipPct: null, related: false, nlTaxStatus: null, ...patch,
});
const grouped = (): AppendixFacts => ({
  ...emptyFacts(),
  entities: [
    ent('E1', 'HoldCo B.V.', { role: 'Taxpayer' }),
    ent('E2', 'Anna Jansen'),
    ent('E3', 'Bram Jansen'),
    ent('E4', 'Chris Jansen'),
  ],
});

describe('manual acting-together group builder', () => {
  it('addActingGroup builds an advisor-owned, client-facing group with filled reasoning', () => {
    const out = addActingGroup(grouped(), {
      memberEntityIds: ['E2', 'E3'], name: 'The Jansen family', basis: 'family', targetEntityId: 'E1',
    });
    const g = out.actingTogether[0];
    expect(g.id).toBe('A1');
    expect(g.origin).toBe('manual');
    expect(g.source).toBe('edited');
    expect(g.name).toBe('The Jansen family');
    expect(g.basis).toBe('family');
    expect(g.targetEntityId).toBe('E1');
    expect(g.reasoning).toContain('Anna Jansen and Bram Jansen are held within the same family group.');
    expect(g.reasoning).toContain('voting rights and capital of HoldCo B.V.');
    expect(actingInClientReport(g)).toBe(true);
  });

  it('assigns a non-colliding id when a group already exists', () => {
    let f = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    f = addActingGroup(f, { memberEntityIds: ['E2', 'E4'], basis: 'other', targetEntityId: 'E1' });
    expect(f.actingTogether.map((a) => a.id)).toEqual(['A1', 'A2']);
  });

  it('withClusterBasis refills untouched reasoning but keeps a hand-edited paragraph', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    // Untouched: switching category swaps the suggestion text.
    const swapped = withClusterBasis(base, 'A1', 'shareholders_agreement');
    expect(swapped.actingTogether[0].basis).toBe('shareholders_agreement');
    expect(swapped.actingTogether[0].reasoning).toContain("shareholders'/voting arrangement");

    // Hand-edited: the advisor's words survive a category change.
    const edited = withClusterText(base, 'A1', 'My own bespoke reasoning.');
    const swapped2 = withClusterBasis(edited, 'A1', 'shareholders_agreement');
    expect(swapped2.actingTogether[0].reasoning).toBe('My own bespoke reasoning.');
  });

  it('withClusterTarget refills [target] in untouched reasoning', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    const retargeted = withClusterTarget(base, 'A1', 'E4');
    expect(retargeted.actingTogether[0].targetEntityId).toBe('E4');
    expect(retargeted.actingTogether[0].reasoning).toContain('voting rights and capital of Chris Jansen');
  });

  it('withClusterMembers on an untouched manual group refills the member names', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    const more = withClusterMembers(base, 'A1', ['E2', 'E3', 'E4']);
    expect(more.actingTogether[0].memberEntityIds).toEqual(['E2', 'E3', 'E4']);
    // [A] and [B] still take the first two members.
    expect(more.actingTogether[0].reasoning).toContain('Anna Jansen and Bram Jansen are held within the same family group.');
  });

  it('resetClusterReasoning overwrites even a hand-edited paragraph', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    const edited = withClusterText(base, 'A1', 'Scribble.');
    const reset = resetClusterReasoning(edited, 'A1');
    expect(reset.actingTogether[0].reasoning).toContain('are held within the same family group.');
  });

  it('withClusterName sets and clears the name', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    expect(withClusterName(base, 'A1', 'Family A').actingTogether[0].name).toBe('Family A');
    expect(withClusterName(base, 'A1', '   ').actingTogether[0].name).toBeUndefined();
  });

  it('withClusterVisibility toggles client inclusion', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    const hidden = withClusterVisibility(base, 'A1', false);
    expect(hidden.actingTogether[0].excludedFromClient).toBe(true);
    expect(actingInClientReport(hidden.actingTogether[0])).toBe(false);
  });

  it('removeActingCluster drops the group', () => {
    const base = addActingGroup(grouped(), { memberEntityIds: ['E2', 'E3'], basis: 'family', targetEntityId: 'E1' });
    expect(removeActingCluster(base, 'A1').actingTogether).toEqual([]);
  });

  it('adoptActingSuggestion promotes an AI hint into a client-facing manual group', () => {
    const withHint: AppendixFacts = {
      ...grouped(),
      actingTogether: [{
        id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: null, likelihood: 'unclear',
        reasoning: 'AI-drafted note.', excludedFromClient: false, source: 'ai',
      }],
    };
    const adopted = adoptActingSuggestion(withHint, 'A1').actingTogether[0];
    expect(adopted.origin).toBe('manual');
    expect(adopted.source).toBe('edited');
    expect(adopted.reasoning).toBe('AI-drafted note.'); // keeps the drafted text
    expect(actingInClientReport(adopted)).toBe(true);
  });
});
