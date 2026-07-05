import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';
import { actingLikelyByDefault } from './actingAnnex';
import { fillActingTemplate, type ActingBasis } from './actingBasis';

function patch(
  facts: AppendixFacts,
  id: string,
  fn: (c: ActingTogetherCluster) => ActingTogetherCluster,
): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.map((c) => (c.id === id ? fn(c) : c)) };
}

// --- template context helpers ----------------------------------------------

/** The member names, in selection order, for filling a suggestion template. */
function memberNames(facts: AppendixFacts, memberEntityIds: string[]): string[] {
  return memberEntityIds.map((id) => facts.entities.find((e) => e.id === id)?.name ?? id);
}

/** The target entity's name, or null when no target is set. */
function targetName(facts: AppendixFacts, targetEntityId: string | null | undefined): string | null {
  if (!targetEntityId) return null;
  return facts.entities.find((e) => e.id === targetEntityId)?.name ?? targetEntityId;
}

/** The suggestion text a cluster would carry for a given basis/member/target set. */
function templateFor(facts: AppendixFacts, c: Pick<ActingTogetherCluster, 'memberEntityIds' | 'targetEntityId'>, basis: ActingBasis): string {
  return fillActingTemplate(basis, {
    members: memberNames(facts, c.memberEntityIds),
    target: targetName(facts, c.targetEntityId),
  });
}

/**
 * True when the cluster's reasoning is still the untouched suggestion text (or
 * empty), so a member/basis/target change may safely refresh it. A hand-edited
 * paragraph is left alone.
 */
function reasoningUnedited(facts: AppendixFacts, c: ActingTogetherCluster): boolean {
  const current = c.reasoning.trim();
  if (!current) return true;
  return current === templateFor(facts, c, c.basis ?? 'other').trim();
}

/** The next free "A#" cluster id (labels are display-only; the register keys by entity id). */
function nextClusterId(facts: AppendixFacts): string {
  const nums = facts.actingTogether
    .map((a) => Number(String(a.id).replace(/^A/, '')))
    .filter((n) => Number.isFinite(n));
  return `A${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

// --- manual group builder ---------------------------------------------------

export interface NewActingGroup {
  memberEntityIds: string[];
  basis: ActingBasis;
  name?: string;
  targetEntityId?: string | null;
}

/**
 * Append a manually-built acting-together group. The reasoning is pre-filled from
 * the category template (placeholders filled from the members + target) and stays
 * editable. Manual groups are advisor-owned (source 'edited', origin 'manual'), so
 * they survive regeneration and reach the client appendix + memo by default.
 */
export function addActingGroup(facts: AppendixFacts, input: NewActingGroup): AppendixFacts {
  const targetEntityId = input.targetEntityId ?? null;
  const reasoning = fillActingTemplate(input.basis, {
    members: memberNames(facts, input.memberEntityIds),
    target: targetName(facts, targetEntityId),
  });
  const cluster: ActingTogetherCluster = {
    id: nextClusterId(facts),
    memberEntityIds: input.memberEntityIds,
    combinedPct: null,
    // Manual groups are asserted to act together; the level is kept coherent for
    // any legacy reader, but it no longer drives client inclusion (origin does).
    likelihood: 'highly_likely',
    reasoning,
    excludedFromClient: false,
    origin: 'manual',
    basis: input.basis,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    targetEntityId,
    source: 'edited',
  };
  return { ...facts, actingTogether: [...facts.actingTogether, cluster] };
}

/**
 * Adopt an AI suggestion (a non-binding hint) as a manual group: keep its members
 * and drafted reasoning, tag it manual so it now leads and reaches the client.
 */
export function adoptActingSuggestion(facts: AppendixFacts, id: string): AppendixFacts {
  return patch(facts, id, (c) => ({
    ...c,
    origin: 'manual',
    basis: c.basis ?? 'other',
    excludedFromClient: false,
    includeInClient: undefined,
    source: 'edited',
  }));
}

/** Remove a grouping outright (manual group or dismissed hint). */
export function removeActingCluster(facts: AppendixFacts, id: string): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.filter((c) => c.id !== id) };
}

/** Change the group name (manual groups). */
export function withClusterName(facts: AppendixFacts, id: string, name: string): AppendixFacts {
  return patch(facts, id, (c) => {
    const next = name.trim();
    const out = { ...c, source: 'edited' as const };
    if (next) out.name = next;
    else delete out.name;
    return out;
  });
}

/**
 * Change the legal-basis category. When the reasoning is still the untouched
 * suggestion text, it refreshes to the new category's template; a hand-edited
 * paragraph is kept (use resetClusterReasoning to force a refill).
 */
export function withClusterBasis(facts: AppendixFacts, id: string, basis: ActingBasis): AppendixFacts {
  return patch(facts, id, (c) => ({
    ...c,
    basis,
    reasoning: reasoningUnedited(facts, c) ? templateFor(facts, c, basis) : c.reasoning,
    source: 'edited',
  }));
}

/** Change the target entity ([target] in the suggestion text); refills if untouched. */
export function withClusterTarget(facts: AppendixFacts, id: string, targetEntityId: string | null): AppendixFacts {
  return patch(facts, id, (c) => {
    const refill = reasoningUnedited(facts, c) && c.basis;
    const reasoning = refill
      ? fillActingTemplate(c.basis!, { members: memberNames(facts, c.memberEntityIds), target: targetName(facts, targetEntityId) })
      : c.reasoning;
    return { ...c, targetEntityId, reasoning, source: 'edited' };
  });
}

/** Overwrite the reasoning with a fresh fill from the current category/members/target. */
export function resetClusterReasoning(facts: AppendixFacts, id: string): AppendixFacts {
  return patch(facts, id, (c) => ({
    ...c,
    reasoning: templateFor(facts, c, c.basis ?? 'other'),
    source: 'edited',
  }));
}

/** Show or hide a manual group in the client appendix + memo. */
export function withClusterVisibility(facts: AppendixFacts, id: string, visible: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: !visible }));
}

// --- legacy AI-cluster helpers (kept for hint cards + backward compat) -------

/**
 * Pick the likelihood level. When the AI prepared a text for that level, the
 * displayed reasoning swaps along; without one the current text is kept. The
 * annex outcome follows the fresh assessment again: any manual switch override
 * is cleared, so likely (or higher) puts the grouping in the client annex and
 * anything lower keeps it internal, until the advisor flips the switch anew.
 */
export function withClusterLikelihood(facts: AppendixFacts, id: string, level: ActingLikelihood): AppendixFacts {
  return patch(facts, id, (c) => ({
    ...c,
    likelihood: level,
    reasoning: c.rationales?.[level]?.trim() || c.reasoning,
    includeInClient: undefined,
    excludedFromClient: !actingLikelyByDefault(level),
    source: 'edited',
  }));
}

/**
 * Advisor-curated membership. The AI's combinedPct no longer describes the new
 * set, so it is cleared; a manual group's untouched suggestion text refreshes to
 * the new members, and the per-level texts are kept as a starting point otherwise.
 */
export function withClusterMembers(facts: AppendixFacts, id: string, memberEntityIds: string[]): AppendixFacts {
  return patch(facts, id, (c) => {
    let reasoning = c.reasoning;
    if (c.origin === 'manual' && c.basis && reasoningUnedited(facts, c)) {
      reasoning = fillActingTemplate(c.basis, { members: memberNames(facts, memberEntityIds), target: targetName(facts, c.targetEntityId) });
    }
    return { ...c, memberEntityIds, combinedPct: null, reasoning, source: 'edited' };
  });
}

/** Hand-edit the assessment text. */
export function withClusterText(facts: AppendixFacts, id: string, reasoning: string): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, reasoning, source: 'edited' }));
}

/** Toggle exclude-from-client (a scope flag, not a content edit). */
export function withClusterExclude(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: excluded }));
}

/**
 * The advisor's explicit annex decision (the outcome bar's Include / Leave out
 * toggle), overriding the likelihood-derived default. excludedFromClient is kept
 * in sync so any reader not yet routed through actingInClientAnnex stays correct.
 */
export function withClusterAnnex(facts: AppendixFacts, id: string, include: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, includeInClient: include, excludedFromClient: !include }));
}
