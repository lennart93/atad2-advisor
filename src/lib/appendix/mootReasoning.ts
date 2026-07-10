/**
 * Canonical one-line explanation for each moot N/A row.
 *
 * A row the deterministic backstop (mootNaRowIds) forces to N/A is not reached on
 * this dossier, so its assessment text must be a short "not reached, because ..."
 * line, NOT the long paragraph the model improvised for it. The
 * model, asked to reason about a condition that never comes into play, tends to
 * write a full (and often invented) analysis; that text is misleading on an N/A
 * row. The display surfaces (screen, memo, print) and the source panel all read
 * the reason from here, so the three can never disagree.
 *
 * Every non-gate rowId that mootNaRowIds can emit appears here. Keyed by rowId,
 * phrased to hold whichever branch made the row moot (a satisfied alternative
 * gate or an absent downstream trigger). DRAFT, pending tax review, like the row
 * groupings in mootness.ts.
 */
export const MOOT_REASONING: Record<string, string> = {
  // 2.2 is N/A only when the parties are associated (2.1): the associated-enterprise
  // test already brings the payments within the mismatch rules, so a structured
  // arrangement need not be shown separately. (Not associated -> 2.2 stays live.)
  '2.2': 'The parties are associated enterprises, so the payments are already within the mismatch rules on that basis and a structured arrangement does not need to be shown separately.',
  '2.3': 'No primary-rule mismatch is triggered, so dual-inclusion income does not need to be tested.',
  '5.2': 'The dual-residence condition is not met, so this is not relevant.',
  '5.3': 'The dual-residence condition is not met, so this is not relevant.',
  '5.4': 'The dual-residence condition is not met, so this is not relevant.',
  '6.4': 'No funded mismatch elsewhere in the structure, so the carve-back rows do not apply.',
  '6.5': 'No funded mismatch elsewhere in the structure, so the carve-back rows do not apply.',
  '7.1': 'No deduction was denied, so there is nothing to carry forward or recapture.',
  '7.2': 'No deduction was denied, so there is nothing to carry forward or recapture.',
  '8.2': 'No reverse-hybrid classification conflict, so the threshold and exception rows do not apply.',
  '8.3': 'No reverse-hybrid classification conflict, so the threshold and exception rows do not apply.',
};

/** The short moot explanation for a row, or null if the row is not a known moot row. */
export function mootReasoningFor(rowId: string): string | null {
  return MOOT_REASONING[rowId] ?? null;
}
