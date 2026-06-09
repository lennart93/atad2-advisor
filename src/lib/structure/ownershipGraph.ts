// Ownership-graph walk shared by the appendix entity register and the
// related-parties overview. An ownership edge runs from the OWNER (from_entity_id)
// to the OWNED entity (to_entity_id); ownership_pct is the share the owner holds in
// the child. Everything here works on a light {from,to,pct} shape so the same
// algorithm can be mirrored verbatim in the Deno edge function
// (supabase/functions/generate-appendix/factsBuild.ts). Keep the two in sync.

export interface OwnershipEdgeLite {
  from: string;
  to: string;
  pct: number | null;
}

export interface OwnershipGraph {
  /** owner id -> outgoing ownership edges (the entities it owns). */
  childrenByOwner: Map<string, OwnershipEdgeLite[]>;
  /** every entity id that appears on either end of an ownership edge. */
  nodes: Set<string>;
}

/** Keep only ownership edges and project them onto the light {from,to,pct} shape. */
export function toOwnershipEdges(
  edges: ReadonlyArray<{ from_entity_id: string; to_entity_id: string; ownership_pct: number | null; kind?: string | null }>,
): OwnershipEdgeLite[] {
  return edges
    .filter((e) => (e.kind ?? 'ownership') === 'ownership')
    .map((e) => ({ from: e.from_entity_id, to: e.to_entity_id, pct: e.ownership_pct ?? null }));
}

export function buildOwnershipGraph(edges: OwnershipEdgeLite[]): OwnershipGraph {
  const childrenByOwner = new Map<string, OwnershipEdgeLite[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to) continue; // ignore self-loops outright
    const list = childrenByOwner.get(e.from) ?? [];
    list.push(e);
    childrenByOwner.set(e.from, list);
    nodes.add(e.from);
    nodes.add(e.to);
  }
  return { childrenByOwner, nodes };
}

/**
 * Can `src` reach ANY id in `targets` by following ownership edges downward
 * (owner -> owned)? Pure connectivity, ignores percentages. Cycle-safe.
 */
export function reaches(src: string, targets: Set<string>, g: OwnershipGraph): boolean {
  if (targets.has(src)) return false; // src is itself a target, not "above" it
  const seen = new Set<string>([src]);
  const stack = [src];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of g.childrenByOwner.get(cur) ?? []) {
      if (targets.has(e.to)) return true;
      if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return false;
}

/**
 * Effective fraction (0..1) that `src` indirectly owns `dst`: the sum over every
 * simple ownership path src -> ... -> dst of the product of the edge fractions.
 * Paths that traverse an edge with an unknown percentage are skipped (they cannot
 * contribute a number), so the result is 0 when the only connection is via unknown
 * edges. Cycle-safe (a node is never revisited within a single path).
 */
export function effectiveFraction(src: string, dst: string, g: OwnershipGraph): number {
  const visiting = new Set<string>();
  const walk = (node: string): number => {
    if (node === dst) return 1;
    if (visiting.has(node)) return 0;
    visiting.add(node);
    let sum = 0;
    for (const e of g.childrenByOwner.get(node) ?? []) {
      if (e.pct == null) continue;
      sum += (e.pct / 100) * walk(e.to);
    }
    visiting.delete(node);
    return sum;
  };
  return walk(src);
}

/**
 * The effective ownership percentage `src` holds in `dst`, summed against a whole
 * target set (used so a fiscal-unity parent/subsidiary is measured against the unity
 * as a whole). Returns null when the entities are connected only through
 * unknown-percentage edges (so the caller can render "?" rather than a false 0),
 * and never exceeds 100.
 */
export function effectivePctToSet(src: string, targets: Iterable<string>, g: OwnershipGraph): number | null {
  let sum = 0;
  for (const t of targets) sum += effectiveFraction(src, t, g);
  if (sum <= 0) return null;
  return roundPct(Math.min(sum, 1) * 100);
}

/** Same as effectivePctToSet but measuring how much the target set holds in `dst`. */
export function effectivePctFromSet(sources: Iterable<string>, dst: string, g: OwnershipGraph): number | null {
  let sum = 0;
  for (const s of sources) sum += effectiveFraction(s, dst, g);
  if (sum <= 0) return null;
  return roundPct(Math.min(sum, 1) * 100);
}

/** At most two decimals, dropping a trailing .00 so whole percentages stay clean. */
export function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}
