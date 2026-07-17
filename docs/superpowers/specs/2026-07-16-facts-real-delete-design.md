# Real delete for entities and transactions on the Facts page

**Date**: 2026-07-16 · **Status**: implemented same day (working tree)

## Problem

The Facts page (Part A of the technical appendix) lets the advisor hide entities and
transactions from the client report (the eye toggle), but a real delete only exists in
two half-finished forms:

1. **Entities**: `deleteEntity` (entitySet.ts) removes the entity and records its
   `chartEntityId` in `facts.removedChartEntityIds` so a regenerate should not
   resurrect it. But the Deno `mergeFacts` in `generate-appendix` never reads that
   field and does not carry it forward, so the deterministic register rebuild brings
   the entity straight back on the next regeneration.
2. **Transactions**: only a hand-added (`manual`) flow can be deleted. An AI-identified
   flow has no delete at all, precisely because a regenerate would resurrect it.

So in practice nothing can be permanently removed; hiding is the only tool. Lennart
wants a real, subtle delete for both.

## Design

One mechanism, two tombstone lists on `AppendixFacts` (both ride in the existing
`facts` JSONB, no DB migration):

- `removedChartEntityIds?: string[]` — already exists (frontend). A deleted
  chart-derived entity's `chartEntityId` lands here.
- `removedTxKeys?: string[]` — NEW. A deleted AI-identified transaction's merge key
  (`fromEntityId|toEntityId|kind`, identical to the `txKey` mergeFacts already uses
  for edit survival) lands here. Same survival semantics as an assessment edit: if a
  later run renames the parties or the kind, the tombstone no longer matches, which
  is the documented, accepted limitation of the whole merge-key mechanism.

### Frontend (`src/lib/appendix/facts/transactionSet.ts`)

- `txMergeKey(t)` — the shared key builder.
- `deleteTransaction(facts, id)` replaces `deleteManualTransaction`: a manual flow is
  removed outright (no tombstone; it has no AI counterpart); an AI-identified flow is
  removed AND its key is appended to `removedTxKeys` (deduped).
- `addManualTransaction` clears a matching tombstone, so deleting an AI flow and then
  hand-adding the same flow does not leave a tombstone that would eat the manual
  carry-over's fresh twin.

Entity-side delete (`entitySet.deleteEntity`) is unchanged; the fix for entities is
entirely in the merge.

### Deno (`supabase/functions/generate-appendix`)

- `factsBuild.ts` gets the two tombstone fields on its `AppendixFacts` mirror and a
  pure, vitest-importable helper `applyRemovalTombstones(existing, fresh)`:
  - drop fresh entities whose `chartEntityId` is tombstoned;
  - cascade: drop their classifications, drop fresh transactions with a removed
    party, drop their acting-together memberships (and now-empty groups);
  - drop fresh transactions whose merge key is in `removedTxKeys`.
- `mergeFacts` (index.ts) applies the helper to `fresh` FIRST (so all existing merge
  logic runs on the filtered set — in particular the manual-transaction carry-over's
  `freshKeys` check sees the filtered list) and carries both tombstone arrays into
  the merged result.

### UI (`TransactionDetail.tsx`)

The existing two-step delete footer (quiet outline button → terracotta "Confirm
delete" + Cancel) is no longer gated on `tx.manual`: every transaction can be
deleted. Styling and placement identical to the entity panel's delete. No new
affordances; the entity panel already had the right pattern.

### Testing

- `transactionSet.test.ts`: manual delete leaves no tombstone; AI delete records the
  key; re-adding the same flow clears it.
- New `removalTombstones.test.ts` imports `applyRemovalTombstones` from the Deno file
  directly (same pattern as `crossMirror.test.ts`) and covers: entity tombstone
  cascade, tx-key tombstone, empty tombstones = no-op, acting-together pruning.

### Deploy order

1. Frontend (Azure App Service) — delete works immediately, client-side.
2. Edge function `generate-appendix` (VM rsync) — required for deletions to survive a
   regenerate. Until then a regenerate resurrects deleted items (status quo, no
   regression).
