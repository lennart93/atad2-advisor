// Server-side mirror of src/lib/appendix/mootness.ts. Keep the two in sync.
//
// Deterministic backstop for the "N/A" reclassification: from the full set of row
// statuses, work out which conditions are not a live question on this dossier and
// must read "N/A" rather than "Not triggered", "Triggered" or "Insufficient
// information". Runs on the freshly generated rows, before advisor edits are
// merged back, so it recurs on every dossier. It only ever forces "N/A"; it never
// upgrades a status, so a real risk or a genuine gap is never hidden.
//
// DRAFT, pending tax review: the row groupings encode tax dependencies.

// 6.1 (art. 12ad relatedness) is a scope gate, in step with GATE_ROWS on the
// frontend: a met precondition reads "Applicable" (a satisfied gate), never a
// risk-coloured "Triggered".
const SCOPE_GATES = ["1.1", "1.2", "2.1", "6.1"];
const MISMATCH_ROWS = ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.9", "3.10", "3.11", "5.2"];
const DENIAL_ROWS = [...MISMATCH_ROWS, "4.1"];

/** rowIds that should be forced to "N/A". Triggers read from the original statuses. */
export function mootNaRowIds(rows: ReadonlyArray<{ rowId: string; status: string | null }>): Set<string> {
  const statusById = new Map(rows.map((r) => [r.rowId, r.status]));
  const present = (id: string) => statusById.has(id);
  const triggered = (id: string) => statusById.get(id) === "Triggered";
  const out = new Set<string>();

  // (a) A satisfied scope/definition gate puts the structure in scope but is not a risk.
  for (const id of SCOPE_GATES) if (present(id) && triggered(id)) out.add(id);

  // (b) Downstream of an absent trigger -> moot.
  const anyMismatch = MISMATCH_ROWS.some(triggered);
  // Structured arrangement is the alternative route for non-associated parties;
  // moot once the parties are associated (2.1). Not associated -> stays live (a
  // third-party arrangement can still be structured).
  if (present("2.2") && triggered("2.1")) out.add("2.2");
  if (present("2.3") && !anyMismatch) out.add("2.3");
  // Secondary rule (art. 12ab, row 4.1) is NOT auto-moot: NL is the recipient
  // state, so it can apply even when no NL primary rule (Section 3) fired (the
  // payer state's primary rule may apply abroad). It stays a live row.

  // Dual residence (art. 12ae): with no dual residence (5.1 not triggered) the
  // double deduction (5.2), the set-off (5.3) AND the EU-carve-out (5.4,
  // art. 12ae(2)) are all moot.
  if (!triggered("5.1")) for (const id of ["5.2", "5.3", "5.4"]) if (present(id)) out.add(id);

  const importedMismatch = triggered("6.2") && triggered("6.3");
  if (!importedMismatch) for (const id of ["6.4", "6.5"]) if (present(id)) out.add(id);

  const anyDenial = DENIAL_ROWS.some(triggered);
  if (!anyDenial) for (const id of ["7.1", "7.2"]) if (present(id)) out.add(id);

  if (!triggered("8.1")) for (const id of ["8.2", "8.3"]) if (present(id)) out.add(id);

  return out;
}
