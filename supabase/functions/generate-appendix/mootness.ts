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

// 6.1 (art. 12ad relatedness) is intentionally NOT a scope gate: it stays a normal
// Section 6 status row, so a met precondition never reads "Not applicable".
const SCOPE_GATES = ["1.1", "1.2", "2.1"];
const MISMATCH_ROWS = ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.9", "3.10", "3.11", "5.2"];
// Art. 12ab(1) backs up only art. 12aa (a),(b),(c),(e),(f) deduction-without-inclusion
// mismatches, never (d)/(g) or a dual-residence double deduction (5.2); mirrors row 4.1.
const SECONDARY_ELIGIBLE = ["3.1", "3.2", "3.3", "3.5", "3.6", "3.10", "3.11"];
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
  if (present("2.3") && !anyMismatch) out.add("2.3");
  // Secondary rule (art. 12ab) backs up only the (a),(b),(c),(e),(f) D/NI mismatches.
  const anySecondaryEligible = SECONDARY_ELIGIBLE.some(triggered);
  if (present("4.1") && !anySecondaryEligible) out.add("4.1");

  if (!triggered("5.1")) for (const id of ["5.2", "5.3"]) if (present(id)) out.add(id);

  const importedMismatch = triggered("6.2") && triggered("6.3");
  if (!importedMismatch) for (const id of ["6.4", "6.5"]) if (present(id)) out.add(id);

  const anyDenial = DENIAL_ROWS.some(triggered);
  if (!anyDenial) for (const id of ["7.1", "7.2"]) if (present(id)) out.add(id);

  if (!triggered("8.1")) for (const id of ["8.2", "8.3"]) if (present(id)) out.add(id);

  return out;
}
