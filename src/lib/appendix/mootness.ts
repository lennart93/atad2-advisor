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
 *       associated enterprise); and
 *   (b) a condition DOWNSTREAM of a trigger that is absent: with no hybrid
 *       mismatch the dual-inclusion-income, the secondary-rule inclusion
 *       (art. 12ab), the carve-back, the art. 12af recapture and the
 *       reverse-hybrid threshold/exception rows are moot.
 *
 * DRAFT, pending tax review: the row groupings below encode tax dependencies and
 * should be checked by a specialist, like the polarity map in conditionPolarity.
 * The function never UPgrades a status (it only forces "N/A"); it leaves any row
 * whose trigger is present at whatever the model returned, so a real risk or a
 * genuine gap is never hidden.
 */

/**
 * Scope/definition gates: when satisfied (the gate condition holds) they are N/A.
 * These are the rows the checklist renders as a calm "gate" check rather than a
 * status pill. The art. 12ad relatedness row (6.1) is intentionally NOT here: it
 * stays a normal Section 6 status row, so a met precondition never reads as a
 * contradictory "Not applicable".
 */
const SCOPE_GATES = ['1.1', '1.2', '2.1'];

/**
 * Operative mismatch rows whose firing is the trigger for the moot rows below.
 * A hybrid mismatch is any deduction-without-inclusion or double-deduction row
 * under the primary rule (art. 12aa) or dual residence (art. 12ae, row 5.2).
 */
const MISMATCH_ROWS = ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.9', '3.10', '3.11', '5.2'];

/**
 * The subset of primary-rule mismatches the secondary rule (art. 12ab) can back up.
 * Art. 12ab(1) applies, with the Netherlands as recipient state, ONLY to art. 12aa
 * sub-paragraphs (a), (b), (c), (e) and (f), never (d) or (g), and it does not reach
 * a dual-residence double deduction (art. 12ae, row 5.2). So row 4.1 is a live
 * question only when one of these deduction-without-inclusion rows fired; a dossier
 * with only a (d)/(g) or dual-residence mismatch leaves 4.1 moot. This mirrors the
 * legal text carried on row 4.1 itself. DRAFT, pending tax review.
 */
const SECONDARY_ELIGIBLE = ['3.1', '3.2', '3.3', '3.5', '3.6', '3.10', '3.11'];

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
  // Secondary rule (art. 12ab) backs up only the (a), (b), (c), (e), (f)
  // deduction-without-inclusion mismatches; with none of those firing the
  // Netherlands has nothing to include, so 4.1 is moot (even if a (d)/(g) or
  // dual-residence mismatch is present).
  const anySecondaryEligible = SECONDARY_ELIGIBLE.some(triggered);
  if (present('4.1') && !anySecondaryEligible) out.add('4.1');

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
