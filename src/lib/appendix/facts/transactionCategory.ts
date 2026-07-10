/**
 * The verbose transaction kind (e.g. "Interest receipt on loans") is too long for
 * the one-line collapsed transaction row, so it is mapped to a short category for
 * the table. The full verbose text still lives in the expanded detail, so nothing
 * is lost.
 *
 * Keyword-driven and order-sensitive (most specific first). The "intra-group"
 * nature is checked before "financing", so an intra-group loan reads as
 * Intra-group rather than Financing. Anything unrecognised falls back to the
 * original text rather than a wrong label, so the row never misclassifies a flow
 * it does not understand (the cell ellipsises a long fallback).
 */
export function shortTransactionType(kind: string | null | undefined): string {
  const k = (kind ?? '').trim();
  if (!k) return '';
  const l = k.toLowerCase();
  if (/management fee|mgmt fee/.test(l)) return 'Management fee';
  if (/current.?account|rekening.?courant/.test(l)) return 'Current account';
  if (/service|consult|advisor|secondment/.test(l)) return 'Services';
  if (/intra.?group|inter.?company|fiscal unity|fiscale eenheid/.test(l)) return 'Intra-group';
  if (/interest|loan|financ|debt|credit|note|bond|facilit/.test(l)) return 'Financing';
  if (/royalt|licen|intellectual property/.test(l)) return 'Royalties';
  if (/dividend|equity|share|capital|contribution|distribution/.test(l)) return 'Equity';
  if (/management/.test(l)) return 'Management fee';
  // Unknown: keep the original wording, but tidy raw snake_case / kebab-case into
  // title case so a value like "current_account" never reaches the row verbatim.
  const tidy = k.replace(/[_-]+/g, ' ').trim();
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}
