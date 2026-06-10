// Smart default placement for ownership-% labels.
//
// One owner → child: the % sits directly above the child (handled in the edge
// component). Several owners → the SAME child: putting every % above that child
// stacks them into one unreadable pile, and the owner sitting straight above
// the child lands its % right on the bus crossing. So when 2+ visible labels
// converge on one child, each edge instead drops its % onto its OWN line, just
// under its own parent — they spread naturally (parents are spaced apart) and
// none sits on a crossing.
//
// computeConvergingLabelCounts only decides the COUNT per target; the edge
// component turns "count >= 2" into the under-parent position.

export interface EdgeLabelInput {
  id: string;
  /** to_entity_id — the child the edge points at. */
  target: string;
  /** Renders a visible label (ownership_pct set and not hidden). */
  hasLabel: boolean;
}

/**
 * edgeId → number of visible % labels that converge on this edge's target
 * (counting itself). >= 2 means siblings would otherwise collide, so the edge
 * should place its label under its own parent. Hidden/empty labels don't count
 * toward convergence (a single visible label among hidden ones has no overlap).
 */
export function computeConvergingLabelCounts(
  edges: EdgeLabelInput[],
): Map<string, number> {
  const perTarget = new Map<string, number>();
  for (const e of edges) {
    if (!e.hasLabel) continue;
    perTarget.set(e.target, (perTarget.get(e.target) ?? 0) + 1);
  }

  const out = new Map<string, number>();
  for (const e of edges) out.set(e.id, perTarget.get(e.target) ?? 0);
  return out;
}
