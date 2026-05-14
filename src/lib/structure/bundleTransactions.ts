// src/lib/structure/bundleTransactions.ts
import type { StructureEdge } from './types';

export interface TransactionBundle {
  bundleId: string;
  from_entity_id: string;
  to_entity_id: string;
  transactions: StructureEdge[];
  totalAmount: number | null;
  hasMismatch: boolean;
}

/**
 * Aggregate transaction edges into bundles per (from, to) pair, filtered to
 * those touching the focus set.
 *
 * If focusedEntityIds is empty, returns []. Otherwise returns one bundle per
 * directed pair where either the from or to entity is in the focus set.
 */
export function bundleTransactions(
  transactions: StructureEdge[],
  focusedEntityIds: Set<string>,
): TransactionBundle[] {
  if (focusedEntityIds.size === 0) return [];
  const relevant = transactions.filter(
    (e) =>
      e.kind === 'transaction' &&
      (focusedEntityIds.has(e.from_entity_id) || focusedEntityIds.has(e.to_entity_id)),
  );

  const byPair = new Map<string, StructureEdge[]>();
  for (const t of relevant) {
    const key = `${t.from_entity_id}|${t.to_entity_id}`;
    const list = byPair.get(key) ?? [];
    list.push(t);
    byPair.set(key, list);
  }

  const out: TransactionBundle[] = [];
  for (const [key, txns] of byPair) {
    const [from, to] = key.split('|');
    const amounts = txns.map((t) => t.amount_eur).filter((a): a is number => a != null);
    const totalAmount = amounts.length === 0 ? null : amounts.reduce((s, a) => s + a, 0);
    const hasMismatch = txns.some((t) => t.is_mismatch);
    out.push({
      bundleId: key,
      from_entity_id: from,
      to_entity_id: to,
      transactions: txns,
      totalAmount,
      hasMismatch,
    });
  }
  return out;
}
