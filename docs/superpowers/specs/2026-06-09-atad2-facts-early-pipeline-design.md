# ATAD2 — early background pipeline + Part A fixes (design)

Date: 2026-06-09
Status: Approved design, ready for implementation planning
Builds on: `docs/superpowers/specs/2026-06-08-atad2-appendix-facts-layer-design.md` (the Part A facts layer)
Feature area: assessment flow orchestration, `extract-structure` + `generate-appendix` edge functions, `src/lib/appendix/facts`, `src/components/appendix`

## 1. Context and goal

The technical appendix now has a "Part A · Facts & relationships" block (entity
register, relatedness + acting-together, classification matrix, transaction map).
Two problems remain:

1. **It is computed too late.** The heavy AI work (structure chart, then facts,
   then the article reasoning) only starts when the user reaches the Structure /
   Appendix steps, so they wait. The work can run earlier, in the background.
2. **Part A needs fixes.** A fiscal unity is not marked as the taxpayer; the user
   cannot mark entities irrelevant; the fiscal unity is not reflected in
   relatedness; and the classification matrix and transaction map show empty.

The **step order does not change** (Intake → Documents → Questions → Confirmation
→ Structure → Appendix → Overview). Only the *timing* of the background compute
changes, plus the Part A fixes. Part A continues to be reviewed at the Appendix
step; the Structure step stays the chart.

## 2. Decisions (locked during brainstorm)

- **Same step order.** No reordering of the seven assessment steps.
- **Two background triggers**, mapped onto the extractor's existing two phases:
  - **Trigger 1 — after the documents are uploaded:** run `extract-structure`
    **Phase A** (documents only) to draft the chart; on "chart ready" chain into
    `generate-appendix` to build Part A and pre-think the article reasoning.
  - **Trigger 2 — once the questions are answered:** run `extract-structure`
    **Phase B** (refine the chart with the answers), then re-run
    `generate-appendix`. Advisor confirmations, edits, hidden entities and
    exclusions are preserved across the update.
- **Part A is reviewed at the Appendix step** (pre-computed, no wait). The
  Structure step stays purely the chart.
- **Fiscal unity = one taxpayer.** `E1` is the fiscal unity (e.g. "Fiscale
  eenheid X c.s."); its members are listed nested under it; relatedness is
  measured from the unity outward (members do not count as related to each other).
- **Hide irrelevant entities.** A per-entity "not relevant, do not show" flag,
  distinct from the existing "exclude from client export". Hidden entities
  disappear from all of Part A and downstream (memo grounding, export); reversible
  via a "Hidden (N) · restore" control. It does not touch the chart.
- **Classification matrix + transactions populate.** They were empty only because
  the AI proposal had not run; the early pipeline runs it. When a run genuinely
  finds none, show an explicit "none identified" state, not "Not proposed yet".

## 3. Architecture

### 3.1 Background pipeline (orchestration)

The pipeline is a chain of existing edge functions, triggered earlier and
decoupled from the screen the user is on.

- **`extract-structure`** already has the two-phase shape we need
  (`supabase/functions/extract-structure/index.ts`): Phase A builds the chart from
  the documents block; Phase B refines it once answers exist. We trigger Phase A
  right after the documents are uploaded and processed.
- **`generate-appendix`** already builds Part A + the article rows. We trigger it
  as soon as the chart reaches `draft_ready`, regardless of which step the user is
  on. Today the prewarm lives inside `StructureChartStep`; it moves to a
  session-level effect (a small hook, e.g. `useAppendixPrewarm(sessionId)`, mounted
  in the assessment shell) that watches the chart status and fires once.
- **Update on answers:** when the questions are completed/confirmed, Phase B runs
  (chart refine) and then `generate-appendix` re-runs. The existing merge rules
  preserve advisor decisions.

Idempotence and "fire once" guards already exist on both functions (the appendix
`ensureAppendix` + freshness guard; the structure status machine). The change is
*where* the triggers fire, not the functions' internals.

### 3.2 Fiscal unity in the entity register

`buildEntityRegister` becomes aware of the chart's groupings
(`atad2_structure_groupings`: `kind`, `label`, `member_ids`). When a grouping of
kind fiscal-unity exists and contains the taxpayer:

- a synthetic taxpayer entity `E1` is created representing the unity, with
  `role: 'Taxpayer'`, a flag `isFiscalUnity: true`, the grouping's label as its
  name, and `memberEntityIds` listing its members;
- the member entities are kept in the register (rendered nested under `E1`) but
  are NOT counted as separate related parties;
- relatedness/ownership for the unity is the aggregate of its members' external
  holdings (a parent holding the unity, or the unity holding a subsidiary).

When there is no fiscal unity, the builder behaves exactly as today (the single
`is_taxpayer` entity is `E1`). The builder stays a pure function and the frontend
copy (`src/lib/appendix/facts/entityRegister.ts`) and the edge copy
(`supabase/functions/generate-appendix/factsBuild.ts`) are kept identical.

### 3.3 Hide / relevance

`FactEntity` gains `hidden: boolean`. The Appendix Part A panel adds a small
"mark irrelevant" (✕) action per entity row and a "Hidden (N) · restore" footer.
Hiding is stored on the facts block and:

- removes the entity from the entity register, relatedness, classification and
  transaction views (any classification/transaction referencing a hidden entity is
  also dropped);
- is preserved across regeneration (same rule as confirmations/exclusions);
- is reversible;
- is independent of `excludedFromClient` (which stays for relevant rows that are
  simply not shown to the client).

### 3.4 Classification + transactions populate

The classification and transaction proposals already exist in
`generate-appendix` (`buildFacts`). Two improvements:

- feed the **documents block** into the facts-proposal prompt (today it gets the
  entity register + answers + structure), so the early run (before answers exist)
  can still propose classifications and transactions from the documents;
- the Part A panel shows an explicit "none identified" empty state when a run
  completed but returned no items, distinct from "not generated yet".

## 4. Data flow

```
Documents uploaded
   └─ Trigger 1 (background)
        extract-structure Phase A (documents)        -> draft chart
        on chart draft_ready: generate-appendix
            buildEntityRegister(entities, edges, groupings)   [deterministic, fiscal unity aware]
            buildFacts(... + documents block)                 [AI: CLS, transactions, acting-together]
            article swarm grounded on Part A                  [pre-thought]
Questions answered / confirmed
   └─ Trigger 2 (background)
        extract-structure Phase B (answers refine)   -> refined chart
        generate-appendix re-run (merge preserves advisor decisions)
Appendix step
   └─ shows the ready Part A + articles; advisor hides entities, confirms the
      fiscal-unity taxpayer, reviews CLS + transactions
```

## 5. Storage

- `FactEntity` += `hidden: boolean`, `isFiscalUnity?: boolean`,
  `memberEntityIds?: string[]` (the latter two only set on the synthetic unity).
- No new tables. Groupings are read from the existing `atad2_structure_groupings`.
- The hidden flag and the fiscal-unity synthesis live in the `facts` JSONB on
  `atad2_appendix`, produced by the (now fiscal-unity-aware) builder and edited by
  the advisor.

## 6. Error handling

- Phase A with thin documents still returns a draft chart; if extraction yields no
  taxpayer, Part A renders its empty state and the article rows fall back to
  today's behaviour.
- The early facts/appendix run with no answers is already handled (answers block
  becomes "(no answers recorded)", rows become "Insufficient information"); the
  answers-update fills them in.
- A fiscal-unity grouping that references entities no longer in the chart is
  ignored gracefully (members filtered to those present).

## 7. Testing

- Unit tests for the fiscal-unity-aware `buildEntityRegister`: a chart with a
  fiscal-unity grouping yields one `E1` unity (members nested, not double-counted);
  a chart without one is unchanged.
- Unit tests for the hidden-entity filter: hidden entities and any
  classification/transaction referencing them are dropped from the client/grounding
  views; the flag survives a merge.
- Builder-parity test confirming the frontend and edge entity registers agree on a
  fiscal-unity fixture.
- The prewarm hook fires once per chart-ready.

## 8. Suggested build order (for the implementation plan)

1. Fiscal-unity-aware `buildEntityRegister` (frontend + edge, kept in sync) + tests.
2. `hidden` on `FactEntity`; filter it through render, relatedness, CLS,
   transactions, export and the memo grounding; the Part A hide control + tests.
3. Feed the documents block into the facts-proposal prompt; the "none identified"
   empty state.
4. Decouple the appendix prewarm into a session-level hook and add Trigger 1
   (extract-structure Phase A right after document upload).
5. Trigger 2 (Phase B + appendix re-run on answers completion) and verify the
   merge preserves advisor decisions.

## 9. Out of scope / not now

- No change to the seven-step order or the chart editor UI.
- No new structure-chart fields; fiscal unity is read from existing groupings.
- The parked memo-v4 / n8n work is unrelated.
