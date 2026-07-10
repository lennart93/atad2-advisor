import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';
import type { FactEntity } from '@/lib/appendix/types';
import {
  buildOwnershipGraph,
  toOwnershipEdges,
  reaches,
  effectivePctToSet,
  effectivePctFromSet,
  type OwnershipGraph,
} from '@/lib/structure/ownershipGraph';
import { normalizeEntityName } from '@/lib/legalName';
import { parseTaxpayerNames } from '@/lib/taxpayer';

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = 'fiscal_unity';

/**
 * Deterministic entity register from the structure chart.
 *
 * Roles are read from the FULL ownership graph, not just direct edges: an entity
 * that owns the taxpayer directly or indirectly is a Parent, an entity the taxpayer
 * owns directly or indirectly is a Subsidiary, and the percentage shown is the
 * effective (chain-multiplied) holding. A remaining group entity is flagged related
 * when it shares a common parent that holds >25% in both it and the taxpayer
 * (the ATAD2 associated-enterprise test), recorded as `relatedVia`.
 *
 * A fiscal unity (an atad2_structure_groupings row of kind 'fiscal_unity' that
 * contains the taxpayer) is collapsed into one synthetic taxpayer E1; its members
 * are listed (flagged memberOfUnityId) but never counted as separate related
 * parties, and relatedness is measured from the whole unity outward. Without a
 * fiscal unity the single is_taxpayer entity is E1, exactly as before.
 */
export function buildEntityRegister(
  entities: StructureEntity[],
  edges: StructureEdge[],
  groupings: StructureGroup[] = [],
  taxpayerName?: string | null,
): FactEntity[] {
  const taxpayers = resolveTaxpayers(entities, taxpayerName);
  if (!taxpayers.length) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const present = (id: string) => byId.has(id);

  // A fiscal unity still collapses into one synthetic taxpayer, but only the
  // single-taxpayer case (unchanged behaviour). When the assessment names several
  // entities, each is listed as its own Taxpayer row instead.
  const fu = taxpayers.length === 1
    ? (groupings.find(
        (g) => g.kind === FISCAL_UNITY_KIND && Array.isArray(g.member_ids) && (g.member_ids as string[]).includes(taxpayers[0].id),
      ) ?? null)
    : null;
  const memberIds: string[] = fu ? (fu.member_ids as string[]).filter(present) : [];
  // The taxpayer set drives the parent/subsidiary/related classification below:
  // fiscal-unity members, or every named taxpayer entity, treated as one subject.
  const memberSet = new Set<string>(fu ? memberIds : taxpayers.map((t) => t.id));

  const ownershipEdges = toOwnershipEdges(edges);
  const graph = buildOwnershipGraph(ownershipEdges);
  const directPairs = new Set(ownershipEdges.map((e) => `${e.from}>${e.to}`));
  // The register covers the corporate chain. Natural persons only stay when they
  // are genuinely associated (a >25% individual shareholder is an associated
  // enterprise under ATAD2); minor individual co-investors are noise.
  const cls = classifyExternals(entities, memberSet, graph, directPairs)
    .filter((c) => c.ent.entity_type !== 'individual' || c.related);

  const toFact = (id: string, c: Pre): FactEntity => ({
    id,
    chartEntityId: c.ent.id,
    name: c.ent.name,
    jurisdiction: (c.ent.jurisdiction_iso as string | null) ?? null,
    entityType: (c.ent.entity_type as string | null) ?? null,
    role: c.role,
    ownershipPct: c.pct,
    related: c.related,
    ...(c.related ? { relatednessBasis: 'pct' as const } : {}),
    relatedVia: c.relatedViaChartId ?? null,
    relatedViaPct: c.relatedViaPct,
    ...(c.direct == null ? {} : { directLink: c.direct }),
    nlTaxStatus: null,
  });

  const out: FactEntity[] = [];
  if (fu) {
    out.push({
      id: 'E1',
      chartEntityId: `fu:${fu.id}`,
      name: fu.label,
      jurisdiction: (taxpayers[0].jurisdiction_iso as string | null) ?? null,
      entityType: 'Fiscal unity',
      role: 'Taxpayer',
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
      isFiscalUnity: true,
      memberEntityIds: memberIds,
    });
  } else {
    // One Taxpayer row per named entity (E1, E2, …). A single entity is E1,
    // exactly as before.
    taxpayers.forEach((taxpayer, i) => {
      out.push({
        id: `E${i + 1}`,
        chartEntityId: taxpayer.id,
        name: taxpayer.name,
        jurisdiction: (taxpayer.jurisdiction_iso as string | null) ?? null,
        entityType: (taxpayer.entity_type as string | null) ?? null,
        role: 'Taxpayer',
        ownershipPct: null,
        related: false,
        nlTaxStatus: null,
      });
    });
  }

  // chart-entity-id -> register id, so a Group entity's `relatedVia` (a chart id at
  // classification time) can be resolved to the parent's register label.
  const chartToRegister = new Map<string, string>();
  let n = out.length;
  const extFacts: FactEntity[] = [];
  for (const c of cls) {
    const id = `E${++n}`;
    chartToRegister.set(c.ent.id, id);
    extFacts.push(toFact(id, c));
  }
  for (const f of extFacts) {
    f.relatedVia = f.relatedVia ? (chartToRegister.get(f.relatedVia) ?? null) : null;
    out.push(f);
  }

  if (fu) {
    for (const id of memberIds) {
      const ent = byId.get(id)!;
      out.push({
        id: `E${++n}`,
        chartEntityId: ent.id,
        name: ent.name,
        jurisdiction: (ent.jurisdiction_iso as string | null) ?? null,
        entityType: (ent.entity_type as string | null) ?? null,
        role: 'Group entity',
        ownershipPct: null,
        related: false,
        relatedVia: null,
        relatedViaPct: null,
        nlTaxStatus: null,
        memberOfUnityId: 'E1',
      });
    }
  }

  return out;
}

/**
 * The taxpayer anchor(s) for the register. An assessment can name several entities
 * that are the subject together; each becomes its own Taxpayer row.
 *
 * Prefer the extractor's is_taxpayer flags — every flagged entity is a taxpayer.
 * That flag is an unreliable model boolean, though: an extraction can land with
 * entities and NONE flagged (the structure prompt permits "at most one", i.e. zero,
 * and the hard grounding rule drops the taxpayer when its legal name is not
 * literally in the documents). So when nothing is flagged, fall back to the
 * session's own named entities (newline-separated, suffix-normalised,
 * case-insensitive); each name resolves to at most one entity. Returns an empty
 * list only when there is genuinely no taxpayer to anchor on.
 */
function resolveTaxpayers(
  entities: StructureEntity[],
  taxpayerName?: string | null,
): StructureEntity[] {
  const flagged = entities.filter((e) => e.is_taxpayer);
  if (flagged.length) return flagged;
  const seen = new Set<string>();
  const out: StructureEntity[] = [];
  for (const raw of parseTaxpayerNames(taxpayerName)) {
    const hint = normalizeEntityName(raw).toLowerCase();
    if (!hint) continue;
    const match = entities.find(
      (e) => !seen.has(e.id) && normalizeEntityName(e.name).toLowerCase() === hint,
    );
    if (match) {
      out.push(match);
      seen.add(match.id);
    }
  }
  return out;
}

interface Pre {
  ent: StructureEntity;
  role: FactEntity['role'];
  pct: number | null;
  related: boolean;
  relatedViaChartId: string | null;
  relatedViaPct: number | null;
  /** Parent/Subsidiary: one ownership edge away from the taxpayer set. Null otherwise. */
  direct: boolean | null;
}

/**
 * Classify every entity that is NOT in the taxpayer set, ordered Parent ->
 * Subsidiary -> Group entity, then by effective percentage (desc) and name. Shared
 * shape with the Deno mirror in supabase/functions/generate-appendix/factsBuild.ts.
 */
function classifyExternals(
  entities: StructureEntity[],
  memberSet: Set<string>,
  graph: OwnershipGraph,
  directPairs: Set<string>,
): Pre[] {
  const externals = entities.filter((e) => !memberSet.has(e.id));

  // Parents that hold >25% in the taxpayer/unity: the candidate common parents for
  // associating sibling group entities (ATAD2 art. 2(4): a third party with >25%
  // in both the taxpayer and the other entity).
  const qualifyingParents = externals.filter((e) => {
    if (!reaches(e.id, memberSet, graph)) return false;
    const pct = effectivePctToSet(e.id, memberSet, graph);
    return pct != null && pct > RELATED_THRESHOLD;
  });

  const pre: Pre[] = externals.map((ent) => {
    const isParent = reaches(ent.id, memberSet, graph);
    const isSub = !isParent && [...memberSet].some((m) => reaches(m, new Set([ent.id]), graph));

    if (isParent) {
      const pct = effectivePctToSet(ent.id, memberSet, graph);
      const direct = [...memberSet].some((m) => directPairs.has(`${ent.id}>${m}`));
      return { ent, role: 'Parent', pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null, direct };
    }
    if (isSub) {
      const pct = effectivePctFromSet(memberSet, ent.id, graph);
      const direct = [...memberSet].some((m) => directPairs.has(`${m}>${ent.id}`));
      return { ent, role: 'Subsidiary', pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null, direct };
    }
    // Group entity: related only if a common parent holds >25% in it as well.
    let bestViaId: string | null = null;
    let bestViaPct: number | null = null;
    for (const p of qualifyingParents) {
      const pctToA = effectivePctToSet(p.id, new Set([ent.id]), graph);
      if (pctToA != null && pctToA > RELATED_THRESHOLD && (bestViaPct == null || pctToA > bestViaPct)) {
        bestViaPct = pctToA;
        bestViaId = p.id;
      }
    }
    return { ent, role: 'Group entity', pct: null, related: bestViaId != null, relatedViaChartId: bestViaId, relatedViaPct: bestViaPct, direct: null };
  });

  const order = { Parent: 1, Subsidiary: 2, 'Group entity': 3 } as const;
  const sortKey = (c: Pre) => c.pct ?? c.relatedViaPct ?? -1;
  return pre.sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if (sortKey(b) !== sortKey(a)) return sortKey(b) - sortKey(a);
    return a.ent.name.localeCompare(b.ent.name);
  });
}
