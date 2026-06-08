# ATAD2 appendix — Facts & relationships layer (design)

Date: 2026-06-08
Status: Approved design, ready for implementation planning
Feature area: technical appendix (`src/lib/appendix`, `src/components/appendix`, `supabase/functions/generate-appendix`)

## 1. Context and goal

The technical appendix today walks the ATAD2 articles (art. 2 + 12aa–12af) as a
checklist: one row per legal test, with a status and a one-paragraph reasoning.
It gives the *conclusions* well, but the *facts* that drive those conclusions —
who is related, how each entity is classified per state, which intra-group flows
exist — only surface in prose and the single inline panel on row 2.1.

We want to make those facts explicit and well-orchestrated, specifically:

1. who is related / associated (gelieerd);
2. who may form an acting-together group (samenwerkende groep) and is therefore
   still caught by relatedness;
3. which transactions take place intra-group;
4. how each related entity is qualified in its home state vs the source state
   (the hybrid-classification driver).

The risk is clutter. The appendix is **itself already an annex to a memo**, so it
must stay an evidentiary annex, not become a second narrative memo. The design
below keeps it tight by separating evidence from conclusions and writing each fact
exactly once.

## 2. Decisions (locked during brainstorm)

- **Audience:** both. The internal working copy shows the full, rich facts layer;
  the client/dossier export shows a clean, confirmed subset. Reuses the existing
  working-copy vs dossier split.
- **Data provenance:** AI proposes, advisor confirms. Facts that are not in the
  structure chart today (per-state classification, transactions, acting-together)
  are AI-derived from the answers + documents + chart and reviewed by the advisor,
  exactly like the existing appendix rows.
- **Information architecture:** Approach A — "foundation, then articles". A Part A
  facts block precedes the Part B article checklist; Part B references Part A.
- **Classification granularity:** at entity level (home vs source per entity).
- **Transactions:** each transaction lists the article(s) it triggers.
- **Cross-reference ids `E#` / `T#`:** internal navigation aids shown in the
  internal view. The reasoning prose itself uses entity names, so the dossier reads
  cleanly without codes and no citation-rewriting is needed on export.

## 3. Architecture

The appendix becomes one annex with two parts, glued by stable short ids.

```
Annex to the ATAD2 memo
├─ Part A · Facts & relationships  (the evidence, written once)
│   ├─ E   Entity register            (deterministic from the chart)
│   ├─ REL Relatedness & acting-together (holdings deterministic; acting-together AI)
│   ├─ CLS Classification matrix       (AI proposes, advisor confirms)
│   └─ T   Transaction map             (AI proposes, advisor confirms)
└─ Part B · Article-by-article assessment  (the existing 8 sections)
    └─ rows cite Part A (E#, T#, CLS) instead of restating facts
```

Each unit has one purpose and a clear interface:

- **E — Entity register.** Every entity in the chart with a stable `E#` (tied to
  its chart entity id), jurisdiction, type, NL tax status and role. Pure function
  of the structure chart.
- **REL — Relatedness & acting-together.** The holdings view (who holds whom, %,
  the >25%/50% test) is deterministic from the chart edges. The **acting-together
  overlay** is AI-proposed: clusters of parties that may act in concert and so
  cross the threshold together, each with a rationale and a confirmed/dismissed
  state.
- **CLS — Classification matrix.** Per entity: home-state classification vs the
  relevant counterparty/source-state classification (transparent / opaque /
  disregarded), with a **mismatch flag** where they differ. AI-proposed,
  advisor-editable. This is what makes hybridity visible.
- **T — Transaction map.** The intra-group flows the articles test: from → to,
  kind, instrument, and the article(s) tested. AI-proposed, advisor-editable.

Part B is the existing checklist, unchanged in form, but its reasoning is grounded
on Part A and cites entity names (with `E#`/`T#` as internal labels).

## 4. Generation pipeline (the orchestration)

Produced in the `generate-appendix` edge function as a three-phase pipeline, so
facts are settled before the articles reference them.

1. **Phase 1 — Deterministic (instant, no AI).** Build `E` and the `REL` holdings
   from the structure chart. Exact; no hallucination. Reuses / extends the
   existing `buildRelatedParties` logic. Stable `E#` per chart entity id.
2. **Phase 2 — AI proposes the facts (advisor confirms).** From answers +
   documents + chart, Claude proposes `CLS`, `T` and `acting-together` clusters.
   Each item is stored as `proposed` ("to confirm") for advisor review/edit.
   Output is schema-validated (zod) and retried on mismatch, like the rows.
3. **Phase 3 — AI writes the articles (grounded on Part A).** The existing
   per-section swarm generation additionally receives Part A as a grounding block,
   so each article's reasoning cites the established facts rather than re-deriving
   them. Consistency by construction.

On **Regenerate**: Phase 1 is always refreshed from the chart; Phase 2/3 refresh,
but advisor confirmations, edits and exclusions are preserved (same merge rule as
the rows — a confirmation/edit/exclusion is a scope decision, not frozen content).

## 5. Storage

Part A is one structured block on `atad2_appendix` (a `facts` JSONB column),
alongside the existing `rows`. Shape (illustrative):

```ts
interface AppendixFacts {
  entities: Array<{ id: string; chartEntityId: string; name: string; jurisdiction: string | null;
                    entityType: string | null; nlTaxStatus: string | null; role: string; source: 'chart' | 'edited' }>;
  relatedness: Array<{ entityId: string; relation: 'Parent' | 'Subsidiary' | 'Group entity';
                       ownershipPct: number | null; related: boolean; basis: string }>;
  actingTogether: Array<{ id: string; memberEntityIds: string[]; combinedPct: number | null;
                          rationale: string; status: 'proposed' | 'confirmed' | 'dismissed';
                          excludedFromClient: boolean; source: 'ai' | 'edited' }>;
  classifications: Array<{ entityId: string; homeState: string; homeClass: string;
                           sourceState: string | null; sourceClass: string | null; hybrid: boolean;
                           status: 'proposed' | 'confirmed'; excludedFromClient: boolean; source: 'ai' | 'edited' }>;
  transactions: Array<{ id: string; fromEntityId: string; toEntityId: string; kind: string;
                        instrument: string | null; note: string | null; articlesTested: string[];
                        status: 'proposed' | 'confirmed'; excludedFromClient: boolean; source: 'ai' | 'edited' }>;
}
```

Edits and confirmations are appended to the existing `atad2_appendix_edits` log
(extend its `field` vocabulary). `types.ts` (hand-maintained) gains the `facts`
column on `atad2_appendix`.

## 6. Rendering, export and edit behaviour

- **On screen (internal):** Part A exhibits at the top; the heavier `CLS` and `T`
  exhibits collapsed by default to keep the annex compact. Part B below, as now.
  Each Part-A item is editable inline; AI-proposed items show a "confirm" action;
  provenance/sources sit behind the existing info popover.
- **Internal vs dossier:** internal shows everything including `proposed` items and
  sources; the dossier shows only confirmed, clean exhibits plus the article
  assessment, with excluded items and excluded exhibits dropped. Part B
  renumber/exclude already exists and is unchanged.
- **Cross-reference codes:** `E#`/`T#` are shown in the internal view only; the
  dossier relies on entity names in the prose and exhibit tables.
- **Regenerate:** preserves confirmations, edits and exclusions across all of
  Part A and Part B.

## 7. Error handling

- Phase 2 AI output is validated with zod and retried once on parse/shape failure;
  on persistent failure the exhibit renders empty with a "could not propose,
  add manually" state rather than blocking the appendix.
- Phase 1 is pure and cannot fail on data; if the chart is missing, Part A renders
  an empty-state and Part B falls back to today's behaviour.
- A Part-A item that references a chart entity which no longer exists (chart edited
  after generation) is shown as stale, consistent with the row staleness model.

## 8. Testing

- Unit tests for the deterministic builders: entity register, relatedness %
  thresholds (>25% / ≥50%), and the acting-together combined-percentage math.
- zod schema tests for the Phase-2 AI output.
- Export tests: the dossier filters `proposed`/excluded items and excluded
  exhibits; the grounding block fed to Phase 3 contains the confirmed facts.
- Reuse of the existing row exclude/renumber tests for Part B (unchanged).

## 9. Suggested build order (for the implementation plan)

1. Data model + storage (`facts` block, types, edits log) and the deterministic
   Phase-1 builders (E, REL) with unit tests.
2. Read-only Part A rendering on the appendix page (exhibits, collapsible),
   internal view only.
3. Phase-2 AI proposals (CLS, T, acting-together) + the edge pipeline + review
   (confirm/edit/exclude).
4. Phase-3 grounding: feed Part A into the article generation.
5. Dossier export of Part A (clean subset, exclusions) + DOCX/print.

## 10. Out of scope / not now

- No extension of the structure-chart editor (per-entity classification fields,
  transaction edges). Classification and transactions live in the appendix facts
  block, AI-proposed, not drawn on the chart.
- No change to the memo itself or the n8n memo pipeline (the parked memo-v4 work is
  separate).
- No renumbering of `E#`/`T#` ids on export (names carry the dossier).
