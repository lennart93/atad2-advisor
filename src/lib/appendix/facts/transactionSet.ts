import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

// ---------------------------------------------------------------------------
// Managing the transaction set by hand: the AI identifies flows from the dossier,
// but the advisor can add one it missed and delete a hand-added one again. The
// counterpart of entitySet.ts for section 3. A hand-added flow is stamped
// `manual: true` + `source: 'edited'`, so mergeFacts carries it across
// regeneration instead of rebuilding it from the AI output.
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
  return { facts: { ...facts, transactions: [...facts.transactions, tx] }, id };
}

/** Delete a hand-added transaction outright. An AI-identified flow is left alone
 *  (it would only be resurrected by the next regeneration); hide it instead. */
export function deleteManualTransaction(facts: AppendixFacts, id: string): AppendixFacts {
  const target = facts.transactions.find((t) => t.id === id);
  if (!target?.manual) return facts;
  return { ...facts, transactions: facts.transactions.filter((t) => t.id !== id) };
}
