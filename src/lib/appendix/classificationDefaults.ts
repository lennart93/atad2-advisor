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

interface CorporateFormRule {
  /** Human name of the statutory form, used in the basis texts. */
  label: string;
  /**
   * Matched against the RAW name + legal-form string (the statutory suffix
   * normally sits in the entity name). Deliberately case-sensitive for the
   * short ambiguous tokens (SA, NV, BV, AG, AB, AS, SAS) so a lower-case word
   * inside a trading name never fires; longer unambiguous suffixes match
   * case-insensitively.
   */
  re: RegExp;
  /** Restrict the rule to these jurisdictions (ISO); undefined = any. */
  jur?: string[];
  /** The Dutch corporate form it compares to on the NL classification lists. */
  nlComparable: string;
}

/**
 * Well-known corporate (capital) forms that are non-transparent under their own
 * law AND comparable to a Dutch N.V./B.V. on the Dutch classification lists,
 * before and after the 2025 Wet FKR alike. Partnership-like and hybrid forms
 * (LP, LLP, SCS/SCSp, KG, CV-achtigen, the commandite-op-aandelen restcategorie
 * such as SCA/KGaA, and the US LLC) are deliberately ABSENT: those are the
 * year-dependent judgment calls that stay with the model and the advisor.
 * Order matters: longer/dotted forms come before the short two-letter tokens.
 */
const CORPORATE_FORMS: CorporateFormRule[] = [
  { label: "S.a r.l.", re: /\bS\.?\s?[àa]\.?\s?r\.?\s?l\.?(?![A-Za-z])/i, nlComparable: "B.V." },
  { label: "BVBA", re: /\bBVBA\b/i, nlComparable: "B.V." },
  { label: "SPRL", re: /\bSPRL\b/i, nlComparable: "B.V." },
  { label: "S.r.l.", re: /\bS\.?r\.?l\.?(?![A-Za-z])/i, nlComparable: "B.V." },
  { label: "GmbH", re: /\bGmbH\b/i, nlComparable: "B.V." },
  { label: "Ltd", re: /\b(Ltd|Limited)\b/i, nlComparable: "B.V." },
  { label: "Plc", re: /\bPlc\b/i, nlComparable: "N.V." },
  { label: "S.p.A.", re: /\bS\.?[pP]\.?A\.?(?![A-Za-z])/, jur: ["IT"], nlComparable: "N.V." },
  { label: "SAS", re: /\bSAS\b/, jur: ["FR"], nlComparable: "B.V." },
  { label: "A/S", re: /\bA\/S(?![A-Za-z])/, jur: ["DK", "NO"], nlComparable: "N.V." },
  { label: "ApS", re: /\bApS\b/, jur: ["DK"], nlComparable: "B.V." },
  { label: "AB", re: /\bAB\b/, jur: ["SE", "FI"], nlComparable: "B.V." },
  { label: "AS", re: /\bAS\b/, jur: ["NO"], nlComparable: "B.V." },
  { label: "Oy", re: /\bOyj?\b/, jur: ["FI"], nlComparable: "B.V." },
  { label: "AG", re: /\bA\.?G\.?(?![A-Za-z])/, jur: ["DE", "AT", "CH", "LI"], nlComparable: "N.V." },
  { label: "S.A.", re: /\bS\.?A\.?(?![A-Za-z])/, nlComparable: "N.V." },
  { label: "N.V.", re: /\bN\.?V\.?(?![A-Za-z])/, nlComparable: "N.V." },
  { label: "B.V.", re: /\bB\.?V\.?(?![A-Za-z])/, nlComparable: "B.V." },
  // Case-sensitive on purpose: matches the statutory suffix in a NAME
  // ("Ommegang Corporation", "Acme Inc.") but never the lower-case chart entity
  // type "corporation", so a bare chart shape alone does not drive a default.
  { label: "Inc./Corp.", re: /\b(Inc|Corp|Corporation|Incorporated)(?![A-Za-z])/, nlComparable: "N.V. or B.V." },
];

/**
 * Suffixes that mark a partnership-like, hybrid or otherwise year-dependent
 * form. When one of these is present the corporate fallback must NOT fire,
 * whatever else the string contains (an LLC whose chart type reads
 * "corporation" stays a judgment call). Case-sensitive for the short tokens.
 */
const NON_CORPORATE_FORMS =
  /\b(LLC|L\.L\.C\.|LLP|LLLP|LP|L\.P\.|SCSp|SCS|SCA|S\.C\.A\.|KGaA|KG|CV|C\.V\.|VOF|V\.O\.F\.|SNC|SENC|GIE|EESV|EEIG|GP|G\.P\.)(?![A-Za-z])/;

/**
 * The corporate-form rule that fires for this raw name/legal-form string, or
 * null. Never matches for a Dutch entity: a Dutch B.V./N.V. is handled by the
 * NL-side defaults, and a home-state view for NL makes no sense.
 */
function matchCorporateForm(
  jurisdictionIso: string,
  raw: string,
): CorporateFormRule | null {
  if (!jurisdictionIso || jurisdictionIso === "NL") return null;
  if (NON_CORPORATE_FORMS.test(raw)) return null;
  for (const rule of CORPORATE_FORMS) {
    if (rule.jur && !rule.jur.includes(jurisdictionIso)) continue;
    if (rule.re.test(raw)) return rule;
  }
  return null;
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
    // LLC first: an explicit "LLC" in the name is more specific than the
    // generic corp token (the chart entity type often reads "corporation").
    if (!isLlc && isUsCorp) {
      return {
        homeClass: "non-transparent",
        basis: "US state-law Inc./Corp. is treated as a per-se corporation (non-transparent); no check-the-box election is possible.",
        verify: true,
      };
    }
    if (isLlc) {
      if (memberCount === 1) {
        return { homeClass: "disregarded", basis: "US single-member LLC, treated as disregarded by default unless a corporate election is made.", verify: true };
      }
      if (memberCount != null && memberCount >= 2) {
        return { homeClass: "partnership", basis: "US multi-member LLC, treated as a partnership by default unless a corporate election is made.", verify: true };
      }
      return { homeClass: "disregarded", basis: "US LLC, treated as disregarded (single-member) or a partnership (multi-member) by default; only an explicit corporate election makes it opaque. Member count unconfirmed.", verify: true };
    }
  }
  if (jur === "HK" && isLtd) {
    return { homeClass: "non-transparent", basis: "Hong Kong Limited company appears to be non-transparent.", verify: true };
  }
  if (jur === "IE" && isDac) {
    return { homeClass: "non-transparent", basis: "Irish Designated Activity Company (DAC) appears to be non-transparent.", verify: true };
  }
  if (jur === "CH" && isAg) {
    return { homeClass: "non-transparent", basis: "Swiss Aktiengesellschaft (AG) appears to be non-transparent.", verify: true };
  }
  // Generic fallback: any other well-known corporate (capital) form is
  // non-transparent under its own law. Partnership-like and hybrid suffixes are
  // excluded inside the matcher, so this never swallows a judgment call.
  const hit = matchCorporateForm(jur, String(legalForm ?? ""));
  if (hit) {
    return {
      homeClass: "non-transparent",
      basis: `${hit.label}, a corporate form that appears to be non-transparent under its own law.`,
      verify: true,
    };
  }
  return null;
}

export interface NlClassificationDefault {
  /** Short grounded basis, shown as the NL classification reasoning. */
  basis: string;
  /** Always true: a deterministic default is a proposal, never a confirmed fact. */
  verify: true;
}

/**
 * The deterministic Dutch-side (naar Nederlandse maatstaven) classification
 * default for a FOREIGN entity: a well-known corporate form is comparable to a
 * Dutch N.V./B.V. on the Dutch classification lists, and therefore
 * non-transparent for Dutch purposes, before and after the 2025 Wet FKR alike.
 * Null for a Dutch entity, an unrecognised form, or any partnership-like /
 * hybrid suffix (LLC, LP, SCS(p), KG, CV, SCA, ...): those depend on the
 * financial year and stay with the model and the advisor. Only ever
 * non-transparent; a proposal the advisor can override.
 */
export function defaultNlClassification(
  jurisdictionIso: string | null | undefined,
  nameAndForm: string | null | undefined,
): NlClassificationDefault | null {
  const jur = String(jurisdictionIso ?? "").toUpperCase().trim();
  const hit = matchCorporateForm(jur, String(nameAndForm ?? ""));
  if (!hit) return null;
  return {
    basis: `${hit.label}, a corporate form comparable to a Dutch ${hit.nlComparable} under the Dutch classification rules, so it appears to be non-transparent for Dutch tax purposes.`,
    verify: true,
  };
}
