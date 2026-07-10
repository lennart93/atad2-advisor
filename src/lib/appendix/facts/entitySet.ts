import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';
import { withLocalQualification } from './classificationEdit';

// ---------------------------------------------------------------------------
// Managing the "Related" (relevant) set: add, remove, promote, demote.
//
// Relevance membership is derived (see isRelevantRow in FactsPanel), but the
// advisor can override it per entity: `relevanceOverride: 'in'` forces an entity
// into the relevant list; `'out'` demotes it to "Other". This is deliberately
// separate from `hidden` (client visibility): a demoted entity stays in the
// analysis, a hidden one stays relevant but is left out of the client report.
// ---------------------------------------------------------------------------

type Edits = NonNullable<FactEntity['edits']>;

/** The advisor's explicit relevant-set membership override, if any. */
export function effRelevanceOverride(e: FactEntity): 'in' | 'out' | undefined {
  return e.edits?.relevanceOverride;
}

/** True when the advisor dismissed the home-state flag as not relevant. */
export function effLocalNotRelevant(e: FactEntity): boolean {
  return !!e.edits?.localNotRelevant;
}

/** The next free "E{n}" register id, one past the highest numeric suffix in use. */
export function nextEntityId(facts: AppendixFacts): string {
  let max = 0;
  for (const e of facts.entities) {
    const m = /^E(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `E${max + 1}`;
}

function patchEdits(facts: AppendixFacts, id: string, patch: Partial<Edits>): AppendixFacts {
  return {
    ...facts,
    entities: facts.entities.map((e) => (e.id === id ? { ...e, edits: { ...e.edits, ...patch } } : e)),
  };
}

function dropEdit(facts: AppendixFacts, id: string, key: keyof Edits): AppendixFacts {
  return {
    ...facts,
    entities: facts.entities.map((e) => {
      if (e.id !== id || !e.edits || !(key in e.edits)) return e;
      const next = { ...e.edits };
      delete next[key];
      return { ...e, edits: next };
    }),
  };
}

/** Force an entity into the relevant list (promote from "Other"). */
export function promoteToRelevant(facts: AppendixFacts, id: string): AppendixFacts {
  return patchEdits(facts, id, { relevanceOverride: 'in' });
}

/**
 * Take an entity out of the relevant set. A hand-added (manual) entity is deleted
 * outright, cascading to its classification, any transaction it is a party to, and
 * its acting-together memberships; a chart-derived entity is demoted to "Other" (it
 * stays in the register for completeness, just outside the relevant analysis).
 */
export function removeFromRelevant(facts: AppendixFacts, id: string): AppendixFacts {
  const target = facts.entities.find((e) => e.id === id);
  if (!target) return facts;
  if (target.manual) {
    return {
      ...facts,
      entities: facts.entities.filter((e) => e.id !== id),
      classifications: facts.classifications.filter((c) => c.entityId !== id),
      transactions: facts.transactions.filter((t) => t.fromEntityId !== id && t.toEntityId !== id),
      actingTogether: facts.actingTogether
        .map((a) => ({ ...a, memberEntityIds: a.memberEntityIds.filter((m) => m !== id) }))
        .filter((a) => a.memberEntityIds.length > 0),
    };
  }
  return patchEdits(facts, id, { relevanceOverride: 'out' });
}

/** Explicitly set whether an entity is a related party (true) or unrelated (false).
 *  Unrelated demotes it to the "Other" group; it stays in the register and analysis. */
export function setEntityRelated(facts: AppendixFacts, id: string, related: boolean): AppendixFacts {
  return patchEdits(facts, id, { relevanceOverride: related ? 'in' : 'out' });
}

/**
 * Delete an entity outright (both hand-added and chart-derived), cascading to its
 * classification, any transaction it is a party to, and its acting-together
 * memberships. A chart-derived entity's chartEntityId is remembered in
 * `removedChartEntityIds` so a later regeneration does not resurrect it.
 */
export function deleteEntity(facts: AppendixFacts, id: string): AppendixFacts {
  const target = facts.entities.find((e) => e.id === id);
  if (!target) return facts;
  const removedChartEntityIds = target.manual || !target.chartEntityId
    ? facts.removedChartEntityIds
    : [...(facts.removedChartEntityIds ?? []), target.chartEntityId];
  return {
    ...facts,
    entities: facts.entities.filter((e) => e.id !== id),
    classifications: facts.classifications.filter((c) => c.entityId !== id),
    transactions: facts.transactions.filter((t) => t.fromEntityId !== id && t.toEntityId !== id),
    actingTogether: facts.actingTogether
      .map((a) => ({ ...a, memberEntityIds: a.memberEntityIds.filter((m) => m !== id) }))
      .filter((a) => a.memberEntityIds.length > 0),
    ...(removedChartEntityIds ? { removedChartEntityIds } : {}),
  };
}

export interface NewEntityInput {
  name: string;
  jurisdiction: string | null;
  /** An NL tax-status key (e.g. 'non_transparent'); null leaves it to be determined. */
  nlTaxStatus?: string | null;
}

/**
 * Create a hand-added entity in the relevant list. Returns the new facts and the
 * assigned register id so the caller can open its detail row.
 */
export function addManualEntity(facts: AppendixFacts, input: NewEntityInput): { facts: AppendixFacts; id: string } {
  const id = nextEntityId(facts);
  const entity: FactEntity = {
    id,
    chartEntityId: `manual:${id}`,
    name: input.name.trim(),
    jurisdiction: input.jurisdiction,
    entityType: null,
    role: 'Group entity',
    ownershipPct: null,
    related: false,
    nlTaxStatus: input.nlTaxStatus ?? null,
    manual: true,
    edits: { relevanceOverride: 'in' },
  };
  return { facts: { ...facts, entities: [...facts.entities, entity] }, id };
}

/** The four values offered by the inline "home-state classification required" control. */
export type HomeStateChoice = 'transparent' | 'non-transparent' | 'undetermined' | 'not-relevant';

/**
 * Resolve the inline home-state flag on one entity. 'not-relevant' dismisses the
 * flag without a classification; a real value records the home-state view (and
 * clears any prior dismissal); 'undetermined' clears both, leaving it open (but
 * resetting a previously recorded home-state classification back to unknown).
 */
export function setHomeStateInline(
  facts: AppendixFacts,
  id: string,
  choice: HomeStateChoice,
  homeState: string | null,
): AppendixFacts {
  if (choice === 'not-relevant') {
    return patchEdits(facts, id, { localNotRelevant: true });
  }
  const cleared = dropEdit(facts, id, 'localNotRelevant');
  if (choice === 'undetermined') {
    // Leave it open. Only reset an already-recorded classification back to unknown;
    // don't freeze a fresh confirmed-empty row (that would block a later AI proposal).
    const existing = cleared.classifications.find((c) => c.entityId === id);
    return existing ? withLocalQualification(cleared, id, 'unknown', homeState) : cleared;
  }
  const mapped = choice === 'transparent' ? 'transparent' : 'non-transparent';
  return withLocalQualification(cleared, id, mapped, homeState);
}
