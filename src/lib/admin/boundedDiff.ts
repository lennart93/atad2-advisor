import { diffLines, diffWordsWithSpace, type Change } from "diff";

// Myers diff cost grows with text size times the number of differences. Two
// full memos that are not close relatives (e.g. the wrong original was
// picked) can take minutes of blocking CPU and crash the tab, so every diff
// here runs with a hard time budget.
const DIFF_TIMEOUT_MS = 1500;

/**
 * Word-level diff of original vs improved, bounded in time. Falls back to a
 * coarser line-level diff when the word diff exceeds the budget, and to null
 * when even that is too expensive; the caller then renders the texts plainly.
 */
export function computeBoundedDiff(
  original: string,
  improved: string,
  timeoutMs: number = DIFF_TIMEOUT_MS,
): Change[] | null {
  const words = diffWordsWithSpace(original, improved, { timeout: timeoutMs });
  if (words) return words;
  const lines = diffLines(original, improved, { timeout: timeoutMs });
  return lines ?? null;
}
