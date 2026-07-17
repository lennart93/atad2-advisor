import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

// ---------------------------------------------------------------------------
// Managing the transaction set by hand: the AI identifies flows from the dossier,
// but the advisor can add one it missed and delete any flow again. The
// counterpart of entitySet.ts for section 3. A hand-added flow is stamped
// `manual: true` + `source: 'edited'`, so mergeFacts carries it across
// regeneration instead of rebuilding it from the AI output. Deleting an
// AI-identified flow records its merge key in `removedTxKeys`, so the next
// regeneration does not resurrect it (the counterpart of `removedChartEntityIds`
// for entities).
// ---------------------------------------------------------------------------

/** The next free "T{n}" id, one past the highest numeric suffix in use. */
export function nextTransactionId(facts: AppendixFacts): string {
  let max = 0;
  for (const t of facts.transactions) {
    const m = /^T(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `T${max + 1}`;
}

/**
 * Both sides of a flow reference the same entity: an invalid record. The form
 * and the setters refuse to create one; an existing one (bad AI output or legacy
 * data) is surfaced as a data issue in the list until the counterparty is fixed.
 */
export function isSelfTransaction(t: Pick<TransactionItem, 'fromEntityId' | 'toEntityId'>): boolean {
  return t.fromEntityId === t.toEntityId;
}

export interface NewTransactionInput {
  fromEntityId: string;
  toEntityId: string;
  /** Free-text flow type (e.g. "Interest on intercompany loan"); shortTransactionType tidies it for the row. */
  kind: string;
}

/**
 * Create a hand-added intra-group transaction. Returns the new facts and the
 * assigned id so the caller can open its detail panel. `relevant` is left unset
 * (= relevant), so the new flow lands in "Needs assessment" and the seeds name
 * the open categories for the advisor to work through.
 */
export function addManualTransaction(
  facts: AppendixFacts, input: NewTransactionInput,
): { facts: AppendixFacts; id: string } {
  // Data-layer guard, independent of the form's own exclusion of the picked party.
  if (isSelfTransaction(input)) throw new Error('A transaction needs two different entities.');
  const id = nextTransactionId(facts);
  const tx: TransactionItem = {
    id,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    kind: input.kind.trim(),
    instrument: null,
    note: null,
    articlesTested: [],
    manual: true,
    status: 'proposed',
    excludedFromClient: false,
    source: 'edited',
  };
  // Hand-adding a flow the advisor previously deleted revokes its tombstone, so a
  // later regeneration is free to match this flow again instead of suppressing it.
  const removedTxKeys = facts.removedTxKeys?.filter((k) => k !== txMergeKey(tx));
  return {
    facts: {
      ...facts,
      transactions: [...facts.transactions, tx],
      ...(removedTxKeys ? { removedTxKeys } : {}),
    },
    id,
  };
}

/** The merge key the edge function's mergeFacts uses for edit survival and delete
 *  tombstones. Mirror of txMergeKey in supabase/functions/generate-appendix/factsBuild.ts. */
export function txMergeKey(t: Pick<TransactionItem, 'fromEntityId' | 'toEntityId' | 'kind'>): string {
  return `${t.fromEntityId}|${t.toEntityId}|${t.kind}`;
}

/**
 * Delete a transaction outright. A hand-added flow is simply removed (it has no AI
 * counterpart that could bring it back); an AI-identified flow additionally records
 * its merge key in `removedTxKeys` so the next regeneration does not resurrect it.
 * Same limitation as every merge-key mechanism here: a later run that names the
 * parties or the kind differently produces a new key the tombstone cannot match.
 */
export function deleteTransaction(facts: AppendixFacts, id: string): AppendixFacts {
  const target = facts.transactions.find((t) => t.id === id);
  if (!target) return facts;
  const transactions = facts.transactions.filter((t) => t.id !== id);
  if (target.manual) return { ...facts, transactions };
  const key = txMergeKey(target);
  const removedTxKeys = facts.removedTxKeys?.includes(key)
    ? facts.removedTxKeys
    : [...(facts.removedTxKeys ?? []), key];
  return { ...facts, transactions, removedTxKeys };
}
