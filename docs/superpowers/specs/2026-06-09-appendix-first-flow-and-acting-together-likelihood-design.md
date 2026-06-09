# Appendix-first flow + acting-together likelihood redesign — Design

**Status:** approved (design), pending implementation plan
**Date:** 2026-06-09
**Branch:** feat/technical-appendix (do not push to main without explicit request)

## Goal

Three connected changes to the ATAD2 assessment:

1. **Reorder** the flow so the **Appendix step comes before the Structure step**.
2. Make the appendix **leading for the chart**: entities hidden in the appendix are filtered out of the structure chart.
3. Redesign the **Acting together** block (drop the Dutch term in the UI) into a per-cluster **likelihood overview** with AI-pre-generated rationale text for every level, so changing the level instantly swaps the text without a new AI call.

## Architecture / context

- The structure chart is already extracted early in the background: `extract-structure` Phase A (docs only) runs after document upload, Phase B (refine) runs once the questions are answered. So a draft chart exists by the time the user reaches the appendix; no new extraction trigger is needed.
- The appendix Part A facts (`atad2_appendix.facts`) are derived deterministically from the chart and enriched by the `generate-appendix` edge function (KB-grounded). The `hidden` flag already lives on `FactEntity` (keyed by `chartEntityId`).
- Acting-together data lives in `AppendixFacts.actingTogether` (clusters) plus the single `AppendixFacts.actingTogetherNarrative`. This redesign replaces both with a richer cluster model.

## Part 1 — Flow reorder (appendix before structure)

**Single source of truth:** `src/lib/assessment/steps.ts`.

- `ASSESSMENT_STEPS`: swap the `structure` and `appendix` entries so the order becomes
  `intake → documents → questions → confirmation → appendix → structure → report`.
  Keep each entry's `wide`/`fullBleed` flags with its own key (appendix: wide, not full-bleed; structure: wide + full-bleed).
- `stepIndexForPath`: swap the indices — `/assessment-appendix/` → 4, `/assessment/structure/` → 5. Update the doc comment's "Flow order" line.
- Update the explicit `navigate(...)` targets in the step components:
  - `AssessmentConfirmation` "next" → `/assessment-appendix/${sessionId}` (was structure).
  - `AssessmentAppendix` (`src/pages/AssessmentAppendix.tsx`): "Previous" → `/assessment-confirmation/${sessionId}` (was structure); the forward action ("Confirm appendix") → `/assessment/structure/${sessionId}` (was report).
  - `StructureChartStep` (`src/components/structure/StructureChartStep.tsx`): "Previous" → `/assessment-appendix/${sessionId}` (was confirmation); "next" → `/assessment-report/${sessionId}` (was appendix).
- Routes/URLs in `App.tsx` are unchanged; only order + nav targets move.
- The chart remains fully editable in the structure step. Editing entities/edges there continues to refresh the appendix via the existing `generate-appendix` merge logic (advisor confirmations preserved). No change to that behaviour; it is simply reached after the appendix now.

**Tests:** update `src/lib/assessment/__tests__/steps.test.ts` to the new order/indices.

## Part 2 — Appendix-hidden entities filtered from the chart

When an advisor hides an entity in the appendix (sets `FactEntity.hidden`, identified by `chartEntityId`), the structure chart must not render that entity or its edges.

- **Non-destructive, view-only filter.** The chart entities stay in `atad2_structure_entities`; they are only excluded from the rendered chart. Reversing is done in the appendix ("show").
- **Mechanism:** the structure step loads the appendix facts for the session and derives the set of hidden `chartEntityId`s (`facts.entities.filter(e => e.hidden).map(e => e.chartEntityId)`), then filters chart entities (and any edge touching a hidden entity) before rendering. Synthetic fiscal-unity ids (`fu:*`) are ignored (they are not real chart entities); only real `chartEntityId`s filter. Since the appendix hide control is only offered on non-taxpayer, non-member entities, hidden ids always map to real external chart entities.
- **Indicator:** a small note in the chart area, e.g. "N entities hidden in the appendix", mirroring the appendix's own "Hidden (N) · show" footer. (No "show" action in the chart; un-hiding happens in the appendix.)
- **Loading:** `StructureChartStep` already loads the chart; add a best-effort load of `atad2_appendix.facts` (via the existing appendix client `loadAppendix`) to obtain the hidden set. If the appendix has no facts yet, no entities are filtered.

## Part 3 — Acting together: per-cluster likelihood overview

The block is renamed **"Acting together"** in the UI (the Dutch "samenwerkende groep" is dropped from labels; it may still appear inside grounded literature text). It becomes an **overview of candidate clusters** — groups of entities that could in theory form an acting-together group (co-investors, subfondsen) — each with a likelihood and a short rationale.

### 3.1 Likelihood scale (5 levels)

```
'highly_unlikely' | 'unlikely' | 'unclear' | 'likely' | 'highly_likely'
```
English labels: Highly unlikely · Unlikely · Unclear · Likely · Highly likely.

### 3.2 Data model

Replace `ActingTogetherCluster` and remove `AppendixFacts.actingTogetherNarrative`.

```ts
export type ActingLikelihood =
  | 'highly_unlikely' | 'unlikely' | 'unclear' | 'likely' | 'highly_likely';

export interface ActingTogetherCluster {
  id: string;                    // "A1"
  memberEntityIds: string[];     // >= 2 entity ids
  combinedPct: number | null;
  likelihood: ActingLikelihood;  // current (advisor may change); init = aiLikelihood
  aiLikelihood: ActingLikelihood; // AI's proposed default (for reference)
  rationales: Record<ActingLikelihood, string>; // pre-generated text per level
  reasoning: string;             // live displayed text; init = rationales[likelihood]; editable
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}
```
- Display text = `reasoning`. Changing the level sets `{ likelihood, reasoning: rationales[level], source: 'edited' }`. Editing the text sets `{ reasoning, source: 'edited' }`.
- `rationales` always holds all five levels (missing levels coalesced at build time, see 3.4).
- This model is mirrored in the Deno edge file `supabase/functions/generate-appendix/factsBuild.ts` (kept identical to the frontend `types.ts`).

### 3.3 AI generation (prompt v5 + schema)

- `appendix_facts_system` → **v5**: for `actingTogether`, the model returns candidate clusters; per cluster it gives `memberEntityIds`, `combinedPct`, a default `likelihood` (the best-fitting level), and a `rationales` object with one short rationale **per level** ("no indication because…" toward the unlikely end, "indications because…" toward the likely end), grounded on the GROUNDED_LITERATURE (coordination, general partner control, parallel comparable funding, subfondsen vs passive co-investors, 25% via art. 12ac lid 2). It drops the old single `rationale` and the separate `actingTogetherNarrative`. Cap candidate clusters at the most relevant (instruct ~max 4) to bound token use from the 5-variant generation.
- `factsSchemas.ts` (`FactsModelOutput.actingTogether`): tolerant shape — `memberEntityIds` (min 1), `combinedPct` nullish, `likelihood` nullish enum, `rationales` an optional partial record of the five levels (each string nullish).

### 3.4 Edge mapping + merge

- `buildFacts` (index.ts): map each proposed cluster to `ActingTogetherCluster`: `aiLikelihood = likelihood ?? 'unclear'`; build `rationales` by filling each of the five levels from the model output, coalescing any missing level to a neutral fallback (e.g. `"No specific assessment for this level."`); `likelihood = aiLikelihood`; `reasoning = rationales[likelihood]`; `excludedFromClient=false`, `source='ai'`. Drop `actingTogetherNarrative` from the base facts.
- `mergeFacts`: key clusters by sorted `memberEntityIds`. On regeneration, if a prior cluster was advisor-edited (`source==='edited'`), preserve the advisor's `likelihood`, `reasoning`, and `excludedFromClient`; otherwise refresh from the fresh AI cluster (carry `excludedFromClient`). Remove the `actingTogetherNarrative` merge.
- `buildFactsBlock` (memo/article grounding): emit each cluster as `members ~ pct%: <likelihood> — <reasoning>`; drop the narrative line.

### 3.5 UI (FactsPanel "Acting together" exhibit)

- Title "Acting together" (icon unchanged). Empty state: "No entities that could form an acting-together group."
- Per cluster: members (names) + combined %, a **5-segment likelihood selector** (Highly unlikely → Highly likely), and the `reasoning` text beneath (editable when `onChange` is provided). Selecting a level swaps the text to `rationales[level]`. An exclude-from-client control stays.
- Likelihood colour: directional and subtle — likely / highly likely → amber (a group is more likely, a relatedness risk); unlikely / highly unlikely → neutral/slate; unclear → grey. Stays on-style (no pill-badge violations of the chart conventions; this is the facts panel, where chips are already used).
- No `proposed/confirmed/dismissed` status anymore; the likelihood selection is the assessment.

### 3.6 Export

- `factsExport.ts` (`factsForClient`): keep acting-together clusters that are **not** `excludedFromClient` (drop the old `status==='confirmed'` filter). Carry no narrative.
- `printAppendix.ts` Part A.4: render each cluster as `members (≈pct%) — <Likelihood label>: <reasoning>`; drop the narrative paragraph and the proposed/excluded flags tied to the old status (keep an "excluded" marker in the internal view).
- `buildAppendixBlock.ts` `buildFactsSummary`: acting-together lines become `members ~ pct%: <likelihood> — <reasoning>`; drop the `Acting-together assessment:` narrative line.

### 3.7 Facts helpers + tests

- `emptyFacts`/`normalizeFacts`: remove `actingTogetherNarrative`.
- `visibleFacts`: drop the narrative pass-through; the cluster filter (drop clusters referencing hidden entities) stays.
- Update tests: `emptyFacts.test.ts`, `visibleFacts.test.ts`, `factsExport.test.ts`, `printAppendix.test.ts`, `buildAppendixBlock.test.ts`, `actingTogether.test.ts` (if it asserts the old shape). Add a small test for the level→text swap helper.

## Files touched (summary)

- Flow: `src/lib/assessment/steps.ts` (+ test), `src/pages/AssessmentConfirmation.tsx`, `src/pages/AssessmentAppendix.tsx`, `src/components/structure/StructureChartStep.tsx`.
- Hidden→chart: `src/components/structure/StructureChartStep.tsx` (load appendix hidden set + filter + indicator); `src/lib/appendix/client.ts` reused (`loadAppendix`).
- Acting-together: `src/lib/appendix/types.ts`, `supabase/functions/generate-appendix/factsBuild.ts`, `…/factsSchemas.ts`, `…/index.ts`, `src/components/appendix/FactsPanel.tsx`, `src/lib/appendix/factsExport.ts`, `src/lib/appendix/facts/emptyFacts.ts`, `src/lib/appendix/facts/visibleFacts.ts`, `src/lib/appendix/printAppendix.ts`, `src/lib/appendix/buildAppendixBlock.ts`, prompt migration `appendix_facts_system` v5, and the tests above.

## Error handling / edge cases

- Appendix facts not yet generated when reaching the structure step → no hidden filter applied (chart shows all).
- AI omits some rationale levels → coalesced to a neutral fallback so every level always has text.
- Legacy stored facts with the old acting-together shape / `actingTogetherNarrative` → tolerated by `normalizeFacts` (narrative ignored) and the cluster mapping (missing new fields defaulted: `likelihood='unclear'`, `rationales` filled, `reasoning` from old `rationale` if present).
- No candidate clusters → empty-state text; no error.

## Deployment

- Frontend: build + tests; not pushed to main without explicit request.
- Edge: deploy `index.ts`, `factsBuild.ts`, `factsSchemas.ts` + apply the v5 prompt migration to the VM (base64 + md5 verify + smoke test, per the established pattern).

## Decided

- Structure step stays fully editable (appendix shown first; chart edits refresh the appendix).
- 5-level scale with a neutral middle.
- The per-cluster overview replaces the single narrative.
