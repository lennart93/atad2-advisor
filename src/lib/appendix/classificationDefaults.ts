// Deterministic home-state classification defaults (WP2 / fix F9b).
//
// DUAL MAINTENANCE — keep IN SYNC with the Deno copy at
// supabase/functions/generate-appendix/classificationDefaults.ts (same rule as
// mootness.ts x2). Byte-identical logic; only the import-less shapes differ.
//
// When the facts model proposes nothing for a well-known legal form, the home
// classification stays "To be determined" (F9b). These defaults fill it from
// the entity's jurisdiction + legal form, but ALWAYS as a proposal that needs
// checking (verify: true) — never a silent confirmation. The advisor confirms.
//
// DRAFT, pending tax review: the rule table below awaits fiscal sign-off.

export interface ClassificationDefault {
  /** Foreign (home-state) qualification, e.g. "non-transparent" or "disregarded". */
  homeClass: "non-transparent" | "transparent" | "disregarded" | "partnership";
  /** Short grounded basis, shown as the reason and carried into to_verify. */
  basis: string;
  /** Always true: a deterministic default is a proposal, never a confirmed fact. */
  verify: true;
}

/** Normalise a legal-form / entity-type string to a comparable token. */
function formToken(form: string | null | undefined): string {
  return String(form ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map (jurisdiction ISO, legal form) to a default home-state classification, or
 * null when no rule applies (the model / advisor must decide). memberCount lets
 * the US LLC rule pick disregarded (single) vs partnership (multi); undefined
 * leaves it to_verify as disregarded-by-default with an explicit note.
 */
export function defaultClassification(
  jurisdictionIso: string | null | undefined,
  legalForm: string | null | undefined,
  memberCount?: number,
): ClassificationDefault | null {
  const jur = String(jurisdictionIso ?? "").toUpperCase().trim();
  const form = formToken(legalForm);

  const isUsCorp = /\b(inc|corp|corporation|incorporated)\b/.test(form);
  const isLlc = /\bllc\b/.test(form) || form === "l l c";
  const isLtd = /\b(ltd|limited)\b/.test(form);
  const isDac = /\bdac\b/.test(form) || /designated activity company/.test(form);
  const isAg = /\bag\b/.test(form) || form === "aktiengesellschaft";

  if (jur === "US") {
    if (isUsCorp) {
      return {
        homeClass: "non-transparent",
        basis: "US state-law Inc./Corp. is a per-se corporation (non-transparent); no check-the-box election is possible.",
        verify: true,
      };
    }
    if (isLlc) {
      if (memberCount === 1) {
        return { homeClass: "disregarded", basis: "US single-member LLC, disregarded by default unless a corporate election is made.", verify: true };
      }
      if (memberCount != null && memberCount >= 2) {
        return { homeClass: "partnership", basis: "US multi-member LLC, a partnership by default unless a corporate election is made.", verify: true };
      }
      return { homeClass: "disregarded", basis: "US LLC, disregarded (single-member) or partnership (multi-member) by default; only an explicit corporate election makes it opaque. Member count unconfirmed.", verify: true };
    }
  }
  if (jur === "HK" && isLtd) {
    return { homeClass: "non-transparent", basis: "Hong Kong Limited company is non-transparent.", verify: true };
  }
  if (jur === "IE" && isDac) {
    return { homeClass: "non-transparent", basis: "Irish Designated Activity Company (DAC) is non-transparent.", verify: true };
  }
  if (jur === "CH" && isAg) {
    return { homeClass: "non-transparent", basis: "Swiss Aktiengesellschaft (AG) is non-transparent.", verify: true };
  }
  return null;
}
