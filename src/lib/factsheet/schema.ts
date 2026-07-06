// CANONICAL factsheet schema (frontend copy).
//
// DUAL MAINTENANCE — keep IN SYNC with the Deno copy at
// `supabase/functions/_shared/factsheetSchema.ts`. Same rule as
// skeleton.ts/skeletonRows.ts and mootness.ts x2: any change here must be
// mirrored there (and vice versa). The two files are byte-for-byte the same
// zod definitions; only the import specifier for zod differs
// ("zod" bare specifier on Deno vs the npm package here).
//
// The schema is DELIBERATELY LENIENT: LLM output varies, and a slightly
// off-shape merge must still store rather than 500 a whole factsheet. Unknown
// enum values fall back via .catch(); missing arrays default to []. The panel
// reads this shape read-only (no editing in v1).

import { z } from "zod";

const Source = z.object({
  doc_label: z.string().default(""),
  loc: z.string().default(""),
}).partial({ doc_label: true, loc: true });

const Ownership = z.object({
  owner: z.string().default(""),
  pct: z.number().nullish().default(null),
  share_class: z.string().nullish().default(null),
  since: z.string().nullish().default(null),
});

const ForeignClassification = z.object({
  country: z.string().default(""),
  classification: z.enum(["disregarded", "partnership", "corporation", "unknown"]).catch("unknown"),
  basis: z.string().nullish().default(null),
  status: z.enum(["confirmed", "asserted", "to_verify"]).catch("to_verify"),
});

const RelatedToTaxpayers = z.object({
  is_related: z.boolean().nullish().default(null),
  basis: z.string().nullish().default(null),
  pct_indirect: z.number().nullish().default(null),
});

export const FactsheetEntity = z.object({
  canonical_name: z.string().default(""),
  aliases: z.array(z.string()).catch([]).default([]),
  tin: z.string().nullish().default(null),
  jurisdiction: z.string().nullish().default(null),
  legal_form: z.string().nullish().default(null),
  role: z.enum(["taxpayer", "parent", "subsidiary", "related_other"]).nullish().default(null),
  ownership: z.array(Ownership).catch([]).default([]),
  nl_classification: z.enum(["non-transparent", "transparent", "unknown"]).catch("unknown").default("unknown"),
  foreign_classifications: z.array(ForeignClassification).catch([]).default([]),
  related_to_taxpayers: RelatedToTaxpayers.nullish().default(null),
  sources: z.array(Source).catch([]).default([]),
});

const IncludedAtRecipient = z.object({
  value: z.enum(["yes", "no", "unknown", "n_a"]).catch("unknown").default("unknown"),
  basis: z.string().nullish().default(null),
});

const ExternalLoan = z.object({
  borrower: z.string().default(""),
  lender: z.string().nullish().default(null),
  lender_identified_via: z.enum(["ledger", "note", "return"]).nullish().default(null),
  amount: z.number().nullish().default(null),
  ccy: z.string().nullish().default(null),
  rate: z.string().nullish().default(null),
  maturity: z.string().nullish().default(null),
  security: z.string().nullish().default(null),
  unusual_terms: z.string().nullish().default(null),
  sources: z.array(Source).catch([]).default([]),
});

const IntercompanyLoan = z.object({
  lender: z.string().default(""),
  borrower: z.string().default(""),
  amount: z.number().nullish().default(null),
  ccy: z.string().nullish().default(null),
  rate: z.string().nullish().default(null),
  maturity: z.string().nullish().default(null),
  interest_paid_fy: z.number().nullish().default(null),
  sources: z.array(Source).catch([]).default([]),
});

export const FactsheetFlow = z.object({
  payer: z.string().default(""),
  payee: z.string().default(""),
  type: z.enum(["interest", "service_fee", "recharge", "dividend", "lease", "royalty", "other"]).catch("other").default("other"),
  amount: z.number().nullish().default(null),
  ccy: z.string().nullish().default(null),
  fy: z.string().nullish().default(null),
  cross_border: z.boolean().nullish().default(null),
  deductible_nl: z.boolean().nullish().default(null),
  included_at_recipient: IncludedAtRecipient.nullish().default(null),
  sources: z.array(Source).catch([]).default([]),
});

const Election = z.object({
  entity: z.string().default(""),
  regime: z.string().nullish().default(null),
  target: z.enum(["disregarded", "partnership", "corporation"]).nullish().default(null),
  status: z.enum(["executed", "announced", "to_verify"]).catch("to_verify").default("to_verify"),
  effective_date: z.string().nullish().default(null),
  sources: z.array(Source).catch([]).default([]),
});

const Negative = z.object({
  claim: z.string().default(""),
  evidence: z.array(Source).catch([]).default([]),
});

const VatRegistration = z.object({
  entity: z.string().default(""),
  country: z.string().nullish().default(null),
  purpose: z.string().nullish().default(null),
});

const PeAndResidence = z.object({
  foreign_pes: z.array(z.unknown()).catch([]).default([]),
  vat_registrations: z.array(VatRegistration).catch([]).default([]),
  dual_residence_indications: z.array(z.unknown()).catch([]).default([]),
  negatives: z.array(Negative).catch([]).default([]),
});

const InstrumentsTransfers = z.object({
  repos_seclending: z.array(z.unknown()).catch([]).default([]),
  commodity_forwards_note: z.string().nullish().default(null),
});

const Inconsistency = z.object({
  description: z.string().default(""),
  docs: z.array(z.string()).catch([]).default([]),
  severity: z.enum(["verify_before_final", "note"]).catch("note").default("note"),
});

const OpenPoint = z.object({
  question: z.string().default(""),
  why_docs_cannot_answer: z.string().nullish().default(null),
  suggested_addressee: z.enum(["client", "us_adviser", "cbcr_preparer"]).nullish().default(null),
});

/** The full session fact sheet (build-factsheet output; frontend panel input). */
export const FactsheetSchema = z.object({
  entities: z.array(FactsheetEntity).catch([]).default([]),
  financing: z.object({
    external: z.array(ExternalLoan).catch([]).default([]),
    intercompany: z.array(IntercompanyLoan).catch([]).default([]),
  }).catch({ external: [], intercompany: [] }).default({ external: [], intercompany: [] }),
  flows: z.array(FactsheetFlow).catch([]).default([]),
  elections: z.array(Election).catch([]).default([]),
  pe_and_residence: PeAndResidence.catch({
    foreign_pes: [], vat_registrations: [], dual_residence_indications: [], negatives: [],
  }).default({ foreign_pes: [], vat_registrations: [], dual_residence_indications: [], negatives: [] }),
  instruments_transfers: InstrumentsTransfers.catch({ repos_seclending: [], commodity_forwards_note: null })
    .default({ repos_seclending: [], commodity_forwards_note: null }),
  inconsistencies: z.array(Inconsistency).catch([]).default([]),
  open_points: z.array(OpenPoint).catch([]).default([]),
});
export type Factsheet = z.infer<typeof FactsheetSchema>;

/**
 * The per-document extraction (docfacts_extract_system output). A SUBSET of the
 * full sheet: no cross-document fields (related_to_taxpayers, inconsistencies,
 * open_points). extract-docfacts validates against this before storing a
 * atad2_document_facts row.
 */
export const DocFactsSchema = z.object({
  entities: z.array(FactsheetEntity.omit({ related_to_taxpayers: true })).catch([]).default([]),
  financing: z.object({
    external: z.array(ExternalLoan).catch([]).default([]),
    intercompany: z.array(IntercompanyLoan).catch([]).default([]),
  }).catch({ external: [], intercompany: [] }).default({ external: [], intercompany: [] }),
  flows: z.array(FactsheetFlow).catch([]).default([]),
  elections: z.array(Election).catch([]).default([]),
  pe_and_residence: PeAndResidence.catch({
    foreign_pes: [], vat_registrations: [], dual_residence_indications: [], negatives: [],
  }).default({ foreign_pes: [], vat_registrations: [], dual_residence_indications: [], negatives: [] }),
  instruments_transfers: InstrumentsTransfers.catch({ repos_seclending: [], commodity_forwards_note: null })
    .default({ repos_seclending: [], commodity_forwards_note: null }),
});
export type DocFacts = z.infer<typeof DocFactsSchema>;

/** The evidence array the swarm (v18) attaches to a prefill row. */
export const EvidenceItem = z.object({
  doc_label: z.string().default(""),
  loc: z.string().nullish().default(null),
  quote: z.string().nullish().default(null),
});
export type EvidenceItemT = z.infer<typeof EvidenceItem>;
