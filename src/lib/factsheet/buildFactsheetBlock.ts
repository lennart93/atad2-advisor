// Render a merged Factsheet into the compact, readable text block that is
// injected into every swarm call (prefill-documents, before the raw documents,
// under "## Verified group fact sheet"). Pure + deterministic so it is unit
// testable and the same block is cached across the whole swarm.
//
// Keep it dense but human-legible: the swarm reads it as its PRIMARY, cross-
// document-verified fact source (prompt v18). Amounts and counterparties by
// name; every line traceable back to a doc_label/loc via the sheet itself.

import type { Factsheet } from "./schema";

function fmtSources(sources: { doc_label?: string; loc?: string }[] | undefined): string {
  if (!sources || sources.length === 0) return "";
  const parts = sources
    .map((s) => [s.doc_label, s.loc].filter(Boolean).join(" "))
    .filter(Boolean);
  return parts.length ? ` [${parts.join("; ")}]` : "";
}

function fmtAmount(amount: number | null | undefined, ccy: string | null | undefined): string {
  if (amount == null) return "";
  const n = amount.toLocaleString("en-US");
  return ccy ? `${ccy} ${n}` : n;
}

export function buildFactsheetBlock(fs: Factsheet | null): string {
  if (!fs) return "";
  const lines: string[] = [];

  if (fs.entities.length) {
    lines.push("### Entities");
    for (const e of fs.entities) {
      const bits: string[] = [];
      if (e.tin) bits.push(`TIN ${e.tin}`);
      if (e.jurisdiction) bits.push(e.jurisdiction);
      if (e.legal_form) bits.push(e.legal_form);
      if (e.role) bits.push(e.role);
      if (e.nl_classification && e.nl_classification !== "unknown") bits.push(`NL: ${e.nl_classification}`);
      const aliases = e.aliases.filter((a) => a && a !== e.canonical_name);
      const aliasStr = aliases.length ? ` (aka ${aliases.join(", ")})` : "";
      const rel = e.related_to_taxpayers?.is_related
        ? `; related to taxpayer${e.related_to_taxpayers.basis ? `: ${e.related_to_taxpayers.basis}` : ""}`
        : "";
      const fc = e.foreign_classifications
        .map((f) => `${f.country} ${f.classification}${f.status ? ` (${f.status})` : ""}${f.basis ? `, ${f.basis}` : ""}`)
        .join("; ");
      lines.push(`- ${e.canonical_name || "(unnamed)"}${aliasStr} [${bits.join(", ")}]${rel}${fc ? `; foreign: ${fc}` : ""}${fmtSources(e.sources)}`);
    }
  }

  const ext = fs.financing?.external ?? [];
  const ic = fs.financing?.intercompany ?? [];
  if (ext.length || ic.length) {
    lines.push("", "### Financing");
    for (const l of ext) {
      const terms = [fmtAmount(l.amount, l.ccy), l.rate, l.maturity ? `maturity ${l.maturity}` : ""].filter(Boolean).join(", ");
      const via = l.lender_identified_via ? ` (lender identified via ${l.lender_identified_via})` : "";
      const unusual = l.unusual_terms ? `; unusual: ${l.unusual_terms}` : "";
      const sec = l.security ? `; security: ${l.security}` : "";
      lines.push(`- external: ${l.borrower || "?"} <- ${l.lender || "unidentified lender"}${via}: ${terms}${sec}${unusual}${fmtSources(l.sources)}`);
    }
    for (const l of ic) {
      const terms = [fmtAmount(l.amount, l.ccy), l.rate, l.maturity ? `maturity ${l.maturity}` : "", l.interest_paid_fy != null ? `interest paid ${l.interest_paid_fy}` : ""].filter(Boolean).join(", ");
      lines.push(`- intercompany: ${l.lender || "?"} -> ${l.borrower || "?"}: ${terms}${fmtSources(l.sources)}`);
    }
  }

  if (fs.flows.length) {
    lines.push("", "### Flows (direction: payer -> payee)");
    for (const f of fs.flows) {
      const amt = fmtAmount(f.amount, f.ccy);
      const cb = f.cross_border === true ? "cross-border" : f.cross_border === false ? "domestic" : "";
      const ded = f.deductible_nl === true ? "deductible NL" : f.deductible_nl === false ? "not deductible NL" : "";
      const inc = f.included_at_recipient
        ? `included at recipient: ${f.included_at_recipient.value}${f.included_at_recipient.basis ? ` (${f.included_at_recipient.basis})` : ""}`
        : "";
      const meta = [f.type, amt, f.fy, cb, ded, inc].filter(Boolean).join("; ");
      lines.push(`- ${f.payer || "?"} -> ${f.payee || "?"}: ${meta}${fmtSources(f.sources)}`);
    }
  }

  if (fs.elections.length) {
    lines.push("", "### Elections");
    for (const el of fs.elections) {
      const bits = [el.regime, el.target, el.status, el.effective_date].filter(Boolean).join(", ");
      lines.push(`- ${el.entity || "?"}: ${bits}${fmtSources(el.sources)}`);
    }
  }

  const per = fs.pe_and_residence;
  if (per && (per.negatives.length || per.vat_registrations.length || per.dual_residence_indications.length)) {
    lines.push("", "### PE / residence");
    for (const v of per.vat_registrations) lines.push(`- VAT registration: ${v.entity || "?"}${v.country ? ` in ${v.country}` : ""}${v.purpose ? ` (${v.purpose})` : ""}`);
    for (const n of per.negatives) {
      lines.push(`- NEGATIVE (evidenced): ${n.claim}${fmtSources(n.evidence)}`);
    }
  }

  const it = fs.instruments_transfers;
  if (it && (it.repos_seclending.length || it.commodity_forwards_note)) {
    lines.push("", "### Instruments / transfers");
    if (it.commodity_forwards_note) lines.push(`- ${it.commodity_forwards_note}`);
    if (it.repos_seclending.length) lines.push(`- repos/securities-lending positions: ${it.repos_seclending.length}`);
  }

  if (fs.inconsistencies.length) {
    lines.push("", "### Inconsistencies to verify");
    for (const i of fs.inconsistencies) lines.push(`- ${i.description}${i.docs.length ? ` [${i.docs.join(", ")}]` : ""} (${i.severity})`);
  }

  if (fs.open_points.length) {
    lines.push("", "### Open points (documents cannot answer)");
    for (const o of fs.open_points) lines.push(`- ${o.question}${o.suggested_addressee ? ` -> ${o.suggested_addressee}` : ""}${o.why_docs_cannot_answer ? ` (${o.why_docs_cannot_answer})` : ""}`);
  }

  return lines.join("\n").trim();
}
