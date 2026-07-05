// Shared helpers for the multi-year tax selection.
//
// An assessment can cover one or more fiscal years. The selected years are
// stored in the existing `fiscal_year` TEXT column as a sorted, comma-joined
// list (e.g. "2023, 2024, 2025"). These helpers parse that stored value back
// into numbers and render a clean display label that collapses contiguous runs
// into ranges ("2023-2025") while leaving gaps as a list ("2023, 2025").

/**
 * Parse a stored fiscal_year value into a sorted, de-duplicated list of years.
 * Accepts both the legacy single-year form ("2024") and the multi-year list
 * ("2023, 2024, 2025"). Non-numeric tokens are dropped.
 */
export function parseFiscalYears(value: string | null | undefined): number[] {
  if (!value) return [];
  const years = value
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => Number.parseInt(token, 10))
    .filter((year) => Number.isFinite(year));
  return Array.from(new Set(years)).sort((a, b) => a - b);
}

/**
 * Render a stored fiscal_year value for display. Contiguous years collapse into
 * a hyphen range; non-contiguous selections stay a comma list. A single year is
 * returned as-is. Falls back to the trimmed raw value when it holds no parseable
 * years (defensive, should not happen for real data).
 */
export function formatFiscalYears(value: string | null | undefined): string {
  const years = parseFiscalYears(value);
  if (years.length === 0) return value?.trim() ?? "";

  const parts: string[] = [];
  let runStart = years[0];
  let prev = years[0];

  for (let i = 1; i <= years.length; i++) {
    const year = years[i];
    if (year === prev + 1) {
      prev = year;
      continue;
    }
    parts.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);
    runStart = year;
    prev = year;
  }

  return parts.join(", ");
}
