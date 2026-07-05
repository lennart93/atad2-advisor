/**
 * One assessment can name several entities that are assessed together as the
 * subject (the taxpayer). Like the multi-year fiscal_year column, the list is
 * stored in the existing atad2_sessions.taxpayer_name TEXT column with no schema
 * change, but joined with newlines rather than commas.
 *
 * Newline is the safe delimiter here: the intake name field is a single-line
 * <input>, so a single-entity assessment can never contain one and round-trips
 * unchanged. A comma delimiter would corrupt legal names that already carry a
 * comma (e.g. "Company, Inc."); a newline never appears inside one.
 */
const TAXPAYER_DELIMITER = "\n";

/**
 * Split the stored taxpayer_name value into individual entity names. A legacy or
 * single-entity value (no newline) yields a one-element list; blank lines are
 * dropped. Safe on null/undefined.
 */
export function parseTaxpayerNames(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Join entity names for storage in the taxpayer_name column (one per line).
 * Trims and drops blanks so an empty "add entity" row is never persisted.
 */
export function formatTaxpayerNames(names: string[]): string {
  return names
    .map((s) => s.trim())
    .filter(Boolean)
    .join(TAXPAYER_DELIMITER);
}

/**
 * A single-line, human-readable label for a stored taxpayer_name: the named
 * entities joined with commas. One entity is shown verbatim; the newlines used
 * for storage never reach the screen or a filename. Used everywhere the app
 * displays "the taxpayer" and wherever the stored value seeds an AI prompt.
 */
export function taxpayerDisplayName(stored: string | null | undefined): string {
  return parseTaxpayerNames(stored).join(", ");
}
