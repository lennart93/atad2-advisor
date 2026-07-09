// WP1/WP2 linking layer: load the session factsheet and fold its verified,
// cross-document facts into the deterministic Part A register.
//
// The factsheet ([[project_factsheet_pipeline]]) is the shared, cross-document
// fact base the appendix was missing. Here it: (a) fills each register entity's
// TIN + aliases, (b) upgrades relatedness to include the 2:24b consolidation /
// acting-together bases (F7 — a 0%-but-consolidated entity becomes related), and
// (c) produces the deterministic validation warnings (F6 sum-check, F9a dedup).
// Nothing here is destructive: relatedness is only ever upgraded, never removed.

import type { SupabaseClient } from "supabase";
import { FactsheetSchema, type Factsheet } from "../_shared/factsheetSchema.ts";
import type { FactEntity, TransactionItem } from "./factsBuild.ts";
import { checkOwnershipSum, findDuplicateEntities, type DedupEntity } from "./appendixValidators.ts";

/** Read the session factsheet; returns null unless generation_status='complete'. */
export async function loadSessionFactsheet(client: SupabaseClient, sessionId: string): Promise<Factsheet | null> {
  const { data } = await client
    .from("atad2_session_factsheet")
    .select("factsheet, generation_status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!data || data.generation_status !== "complete" || !data.factsheet) return null;
  const parsed = FactsheetSchema.safeParse(data.factsheet);
  return parsed.success ? parsed.data : null;
}

function norm(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(b\s*v|n\s*v|ltd|limited|inc|corp|corporation|llc|dac|gmbh|ag|sa|sarl|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normTin(tin: string | null | undefined): string {
  return String(tin ?? "").replace(/[\s.-]/g, "").toLowerCase();
}

/** Classify a factsheet related_to_taxpayers.basis string into a relatedness basis. */
export function relatednessBasisFromText(basis: string | null | undefined): FactEntity["relatednessBasis"] | null {
  const b = String(basis ?? "").toLowerCase();
  if (!b) return null;
  if (/2:24b|consolidat|de facto|de-facto/.test(b)) return "consolidation_2_24b";
  if (/samenwerkend|acting together|acting-together/.test(b)) return "acting_together";
  if (/%|\bpct\b|per ?cent|ownership|shareholding/.test(b)) return "pct";
  return null;
}

interface FsEntityLite {
  tin: string;
  names: Set<string>;
  aliases: string[];
  rawTin: string | null;
  related?: { is_related: boolean | null; basis: string | null };
}

function indexFactsheetEntities(fs: Factsheet): FsEntityLite[] {
  return fs.entities.map((e) => {
    const names = new Set<string>();
    const nn = norm(e.canonical_name);
    if (nn) names.add(nn);
    for (const a of e.aliases) { const na = norm(a); if (na) names.add(na); }
    return {
      tin: normTin(e.tin),
      names,
      aliases: [e.canonical_name, ...e.aliases].filter((x) => x && x.trim()),
      rawTin: e.tin ?? null,
      related: e.related_to_taxpayers ?? undefined,
    };
  });
}

/**
 * Fill TIN + aliases and upgrade relatedness from the factsheet. Returns the
 * updated entities plus dedup + sum-check warnings.
 */
export function linkFactsheetToRegister(
  entities: FactEntity[],
  factsheet: Factsheet | null,
): { entities: FactEntity[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!factsheet) {
    // Still run duplicate detection on whatever TIN/alias data the entities carry.
    warnings.push(...findDuplicateEntities(entities.map(toDedup)));
    return { entities, warnings };
  }

  const fsIndex = indexFactsheetEntities(factsheet);
  const matchFor = (e: FactEntity): FsEntityLite | null => {
    const en = norm(e.name);
    const et = normTin(e.tin);
    // TIN first, then name/alias overlap.
    let best: FsEntityLite | null = null;
    for (const fe of fsIndex) {
      if (et && fe.tin && et === fe.tin) return fe;
      if (en && fe.names.has(en)) best = best ?? fe;
    }
    return best;
  };

  const out = entities.map((e) => {
    const fe = matchFor(e);
    if (!fe) return e;
    const next: FactEntity = { ...e };
    if (!next.tin && fe.rawTin) next.tin = fe.rawTin;
    const extraAliases = fe.aliases.filter((a) => norm(a) !== norm(e.name));
    if (extraAliases.length) next.aliases = Array.from(new Set([...(next.aliases ?? []), ...extraAliases]));
    // Upgrade relatedness (never downgrade). E1/taxpayer stays not-related.
    if (e.role !== "Taxpayer" && fe.related?.is_related) {
      const basis = relatednessBasisFromText(fe.related.basis) ?? "consolidation_2_24b";
      if (!next.related) {
        next.related = true;
        next.relatednessBasis = basis;
      } else if (!next.relatednessBasis) {
        next.relatednessBasis = basis;
      }
    }
    return next;
  });

  // F9a: duplicate detection over the enriched register (now carrying TIN/aliases).
  warnings.push(...findDuplicateEntities(out.map(toDedup)));

  // F6: ownership sum-check per factsheet entity that lists its owners.
  for (const fe of factsheet.entities) {
    const shares = fe.ownership.map((o) => ({ owner: o.owner, pct: o.pct ?? null }));
    const w = checkOwnershipSum(fe.canonical_name || "(entity)", shares);
    if (w) warnings.push(w);
  }

  return { entities: out, warnings };
}

function toDedup(e: FactEntity): DedupEntity {
  return { id: e.id, name: e.name, tin: e.tin ?? null, aliases: e.aliases };
}

/**
 * F8 borrower-attribution check: warn when a proposed financing transaction names
 * a borrower the factsheet financing attributes to a different entity (a
 * consolidated statement pinning a debt on the parent). Conservative: only
 * financing-like flows, only when the factsheet clearly names another borrower.
 */
export function borrowerAttributionWarnings(
  transactions: TransactionItem[],
  factsheet: Factsheet | null,
  nameById: (id: string) => string,
): string[] {
  if (!factsheet) return [];
  const loans = [...factsheet.financing.external, ...factsheet.financing.intercompany]
    .map((l) => ({ borrower: norm((l as { borrower?: string }).borrower ?? ""), lender: norm((l as { lender?: string | null }).lender ?? "") }))
    .filter((l) => l.borrower);
  if (!loans.length) return [];

  const warnings: string[] = [];
  for (const t of transactions) {
    if (!/financ|loan|interest|debt/i.test(t.kind)) continue;
    const from = norm(nameById(t.fromEntityId));
    const to = norm(nameById(t.toEntityId));
    // A financing flow's parties should match a factsheet loan's lender/borrower.
    const matchesEndpoint = loans.some((l) => l.borrower === from || l.borrower === to || l.lender === from || l.lender === to);
    if (!matchesEndpoint) {
      warnings.push(`Transaction ${t.id} (${nameById(t.fromEntityId)} -> ${nameById(t.toEntityId)}, ${t.kind}) has no matching lender/borrower in the factsheet financing. Verify the debtor attribution (consolidated statements attribute debt to the parent, not the borrower).`);
    }
  }
  return warnings;
}
