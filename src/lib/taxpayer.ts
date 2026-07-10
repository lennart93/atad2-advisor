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

/**
 * Deduplicate the taxpayer-subject names before counting or listing them. The
 * stored list can repeat the same entity (e.g. a name entered twice at intake);
 * matching is case-insensitive on the trimmed name, and the first spelling wins.
 */
export function dedupeEntityNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * The subject as one short plain-text sentence: the lead entity plus a count of
 * the rest ("Acme B.V. and 2 others", "Acme B.V. and 1 other"). The string twin
 * of the TaxpayerSubject component, for places JSX cannot reach: aria-labels
 * and other flat strings. Names are deduplicated first so the count always
 * matches the roster surfaces.
 */
export function taxpayerSubjectLabel(stored: string | null | undefined): string {
  const names = dedupeEntityNames(parseTaxpayerNames(stored));
  const lead = names[0] ?? "";
  const extra = names.length - 1;
  if (extra <= 0) return lead;
  return `${lead} and ${extra} ${extra === 1 ? "other" : "others"}`;
}
