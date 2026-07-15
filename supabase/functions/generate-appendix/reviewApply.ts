// Pure, dependency-vrije apply-stap voor de asynchrone Fable-eindredactie.
// De eindredactie draait NA de "ready"-write; in dat venster kan de adviseur
// al rijen hebben bewerkt. Regel: een gereviewde tekst landt alleen op een rij
// die (a) nog source 'ai' is en (b) waarvan de reasoning nog exact gelijk is
// aan wat deze generatie schreef. Alles daarbuiten blijft onaangeraakt; een
// status wijzigt hier nooit. Cross-import-getest vanuit vitest
// (src/lib/appendix/__tests__/reviewApply.test.ts) — geen Deno-imports.

export interface ReviewApplyRow {
  rowId: string;
  source: string;
  reasoning: string | null;
  aiReasoning: string | null;
  [key: string]: unknown;
}

export function applyReviewSafely(
  currentRows: ReviewApplyRow[],
  writtenRows: ReviewApplyRow[],
  newReasonById: Map<string, string>,
): { rows: ReviewApplyRow[]; applied: number } {
  const writtenById = new Map(writtenRows.map((r) => [r.rowId, r]));
  let applied = 0;
  const rows = currentRows.map((cur) => {
    const newReason = newReasonById.get(cur.rowId);
    if (!newReason) return cur;
    const written = writtenById.get(cur.rowId);
    if (!written) return cur;
    if (cur.source !== 'ai') return cur;
    if ((cur.reasoning ?? '') !== (written.reasoning ?? '')) return cur;
    applied += 1;
    return { ...cur, reasoning: newReason, aiReasoning: newReason };
  });
  return { rows, applied };
}
