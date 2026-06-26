import type { Status } from './types';

/**
 * Deterministic backstop for the "N/A" reclassification.
 *
 * The appendix prompt is asked to emit "N/A" itself, but the rule is nuanced and
 * a model can slip. This pure function re-derives, from the full set of row
 * statuses, which conditions are NOT a live question on this dossier and must
 * therefore read "N/A" rather than "Not triggered", "Triggered" or, worst of all,
 * "Insufficient information". It runs on the freshly generated rows in the edge
 * function (before advisor edits are merged back), so it recurs on every dossier.
 *
 * Two grounds make a condition N/A:
 *   (a) a scope/definition gate that is SATISFIED, so it only puts the structure
 *       in scope and is not itself a risk (subject to CIT, cross-border element,
 *       associated enterprise, relatedness under art. 12ad); and
 *   (b) a condition DOWNSTREAM of a trigger that is absent: with no hybrid
 *       mismatch the dual-inclusion-income, carve-back, art. 12af recapture and
 *       reverse-hybrid threshold/exception rows are moot.
 *
 * DRAFT, pending tax review: the row groupings below encode tax dependencies and
 * should be checked by a specialist, like the polarity map in conditionPolarity.
 * The function never UPgrades a status (it only forces "N/A"); it leaves any row
 * whose trigger is present at whatever the model returned, so a real risk or a
 * genuine gap is never hidden.
 */

/** Scope/definition gates: when satisfied (the gate condition holds) they are N/A. */
const SCOPE_GATES = ['1.1', '1.2', '2.1', '6.1'];

/**
 * Operative mismatch rows whose firing is the trigger for the moot rows below.
 * A hybrid mismatch is any deduction-without-inclusion or double-deduction row
 * under the primary rule (art. 12aa) or dual residence (art. 12ae, row 5.2).
 */
const MISMATCH_ROWS = ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.9', '3.10', '3.11', '5.2'];

/** Rows whose firing means a deduction was denied / income included (recapture trigger). */
const DENIAL_ROWS = [...MISMATCH_ROWS, '4.1'];

/**
 * Given every present row and its status, return the set of rowIds that should be
 * forced to "N/A". Triggers are read from the ORIGINAL statuses, so the result
 * does not depend on iteration order.
 */
export function mootNaRowIds(rows: ReadonlyArray<{ rowId: string; status: Status | null }>): Set<string> {
  const statusById = new Map(rows.map((r) => [r.rowId, r.status]));
  const present = (id: string) => statusById.has(id);
  const triggered = (id: string) => statusById.get(id) === 'Triggered';
  const out = new Set<string>();

  // (a) A satisfied scope/definition gate puts the structure in scope but is not
  // itself a risk. "Satisfied" = the gate condition holds (the model said it
  // fires); a gate that is genuinely not met is left alone (out of scope).
  for (const id of SCOPE_GATES) if (present(id) && triggered(id)) out.add(id);

  // (b) Downstream of an absent trigger -> moot.
  const anyMismatch = MISMATCH_ROWS.some(triggered);
  // Dual-inclusion income only matters when there is a mismatch to absorb.
  if (present('2.3') && !anyMismatch) out.add('2.3');

  // Dual residence (5.x): the double-deduction and set-off rows hang off 5.1.
  if (!triggered('5.1')) for (const id of ['5.2', '5.3']) if (present(id)) out.add(id);

  // Imported mismatch (art. 12ad): the carve-back rows need both a mismatch
  // elsewhere in the chain (6.2) AND the Dutch payment funding it (6.3).
  const importedMismatch = triggered('6.2') && triggered('6.3');
  if (!importedMismatch) for (const id of ['6.4', '6.5']) if (present(id)) out.add(id);

  // Carry-forward / recapture (art. 12af): moot unless a deduction was denied.
  const anyDenial = DENIAL_ROWS.some(triggered);
  if (!anyDenial) for (const id of ['7.1', '7.2']) if (present(id)) out.add(id);

  // Reverse hybrid (art. 2): the >=50% threshold and the collective-investment
  // exception only matter once a reverse-hybrid classification conflict (8.1) fires.
  if (!triggered('8.1')) for (const id of ['8.2', '8.3']) if (present(id)) out.add(id);

  return out;
}
