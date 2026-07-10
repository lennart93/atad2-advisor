// Deterministic factsheet combine (Deno / edge copy).
// DUAL MAINTENANCE — keep IN SYNC with the frontend canonical at
// src/lib/factsheet/mergeFactsheets.ts (bodies identical; only this import
// path differs). Imported by build-factsheet.
import type { Factsheet } from "./factsheetSchema.ts";

type Entity = Factsheet["entities"][number];
type Source = { doc_label?: string; loc?: string };

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(b\s*v|n\s*v|ltd|limited|inc|corp|corporation|llc|dac|gmbh|ag|sa|sarl|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normTin(t: string | null | undefined): string {
  return String(t ?? "").replace(/[\s.-]/g, "").toLowerCase();
}

function entityKeys(e: Entity): string[] {
  const keys: string[] = [];
  const t = normTin(e.tin);
  if (t) keys.push(`tin:${t}`);
  const cn = norm(e.canonical_name);
  if (cn) keys.push(`nm:${cn}`);
  for (const a of e.aliases ?? []) { const na = norm(a); if (na) keys.push(`nm:${na}`); }
  return keys;
}

const ROLE_RANK: Record<string, number> = { taxpayer: 4, parent: 3, subsidiary: 2, related_other: 1 };

function uniqBy<T>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function mergeSources(a: Source[] = [], b: Source[] = []): Source[] {
  return uniqBy([...a, ...b], (s) => `${s.doc_label ?? ""}|${s.loc ?? ""}`);
}

function mergeEntity(a: Entity, b: Entity): Entity {
  // Canonical name: keep the longer, more specific name; the other becomes an alias.
  const canonical = (b.canonical_name?.length ?? 0) > (a.canonical_name?.length ?? 0) ? b.canonical_name : a.canonical_name;
  const aliasPool = [a.canonical_name, b.canonical_name, ...(a.aliases ?? []), ...(b.aliases ?? [])]
    .filter((x) => x && x.trim() && norm(x) !== norm(canonical));
  const aliases = uniqBy(aliasPool, (x) => norm(x));

  const roleOf = (e: Entity) => (e.role ? ROLE_RANK[e.role] ?? 0 : 0);
  const role = roleOf(b) > roleOf(a) ? b.role : a.role;

  const related = (a.related_to_taxpayers?.is_related ? a.related_to_taxpayers : null)
    ?? (b.related_to_taxpayers?.is_related ? b.related_to_taxpayers : null)
    ?? a.related_to_taxpayers ?? b.related_to_taxpayers ?? null;

  return {
    canonical_name: canonical,
    aliases,
    tin: a.tin ?? b.tin ?? null,
    jurisdiction: a.jurisdiction ?? b.jurisdiction ?? null,
    legal_form: a.legal_form ?? b.legal_form ?? null,
    role,
    ownership: uniqBy([...(a.ownership ?? []), ...(b.ownership ?? [])], (o) => `${norm(o.owner)}|${o.share_class ?? ""}`),
    nl_classification: a.nl_classification !== "unknown" ? a.nl_classification : b.nl_classification,
    foreign_classifications: uniqBy([...(a.foreign_classifications ?? []), ...(b.foreign_classifications ?? [])], (f) => `${f.country}|${f.classification}`),
    related_to_taxpayers: related,
    sources: mergeSources(a.sources, b.sources),
  };
}

function dedupeEntities(all: Entity[]): Entity[] {
  const merged: Entity[] = [];
  const keyToIndex = new Map<string, number>();
  for (const e of all) {
    let idx = -1;
    for (const k of entityKeys(e)) {
      const hit = keyToIndex.get(k);
      if (hit !== undefined) { idx = hit; break; }
    }
    if (idx === -1) {
      idx = merged.length;
      merged.push(e);
    } else {
      merged[idx] = mergeEntity(merged[idx], e);
    }
    for (const k of entityKeys(merged[idx])) keyToIndex.set(k, idx);
  }
  return merged;
}

/**
 * Combine several partial fact sheets into one, deterministically. Entities are
 * deduped across chunks by TIN and name/alias; every other section is unioned
 * with a stable dedup key. Never throws; the result validates against the
 * lenient FactsheetSchema.
 */
export function mergeFactsheets(parts: Factsheet[]): Factsheet {
  const nonEmpty = parts.filter(Boolean);
  if (nonEmpty.length === 1) return nonEmpty[0];

  const entities = dedupeEntities(nonEmpty.flatMap((p) => p.entities ?? []));

  const external = uniqBy(
    nonEmpty.flatMap((p) => p.financing?.external ?? []),
    (l) => `${norm(l.borrower)}|${norm(l.lender)}|${l.amount ?? ""}|${l.ccy ?? ""}`,
  );
  const intercompany = uniqBy(
    nonEmpty.flatMap((p) => p.financing?.intercompany ?? []),
    (l) => `${norm(l.lender)}|${norm(l.borrower)}|${l.amount ?? ""}|${l.ccy ?? ""}`,
  );

  const flows = uniqBy(
    nonEmpty.flatMap((p) => p.flows ?? []),
    (f) => `${norm(f.payer)}|${norm(f.payee)}|${f.type}|${f.amount ?? ""}|${f.ccy ?? ""}|${f.fy ?? ""}`,
  );

  const elections = uniqBy(
    nonEmpty.flatMap((p) => p.elections ?? []),
    (e) => `${norm(e.entity)}|${e.regime ?? ""}|${e.target ?? ""}`,
  );

  const vat = uniqBy(
    nonEmpty.flatMap((p) => p.pe_and_residence?.vat_registrations ?? []),
    (v) => `${norm(v.entity)}|${v.country ?? ""}`,
  );
  const negatives = uniqBy(
    nonEmpty.flatMap((p) => p.pe_and_residence?.negatives ?? []),
    (n) => norm(n.claim),
  );
  const foreignPes = nonEmpty.flatMap((p) => p.pe_and_residence?.foreign_pes ?? []);
  const dualRes = nonEmpty.flatMap((p) => p.pe_and_residence?.dual_residence_indications ?? []);

  const repos = nonEmpty.flatMap((p) => p.instruments_transfers?.repos_seclending ?? []);
  const commodityNotes = nonEmpty
    .map((p) => p.instruments_transfers?.commodity_forwards_note)
    .filter((x): x is string => !!x && x.trim().length > 0);

  const inconsistencies = uniqBy(
    nonEmpty.flatMap((p) => p.inconsistencies ?? []),
    (i) => norm(i.description),
  );
  const open_points = uniqBy(
    nonEmpty.flatMap((p) => p.open_points ?? []),
    (o) => norm(o.question),
  );

  return {
    entities,
    financing: { external, intercompany },
    flows,
    elections,
    pe_and_residence: {
      foreign_pes: foreignPes,
      vat_registrations: vat,
      dual_residence_indications: dualRes,
      negatives,
    },
    instruments_transfers: {
      repos_seclending: repos,
      commodity_forwards_note: commodityNotes.length ? uniqBy(commodityNotes, (x) => norm(x)).join(" ") : null,
    },
    inconsistencies,
    open_points,
  };
}
