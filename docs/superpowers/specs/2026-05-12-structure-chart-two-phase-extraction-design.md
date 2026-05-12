# Structure-chart extraction — two-phase async pipeline

**Date:** 2026-05-12
**Status:** Draft for implementation
**Scope:** `supabase/functions/extract-structure/`, `src/components/structure/`, `src/pages/Assessment.tsx`, prefill-trigger glue.

## Problem

Today the `extract-structure` Edge Function runs all three Claude stages (entities → ownership → transactions+ATAD2 mismatches) when the user reaches **step 5 (Structure chart)** — the last step before the report. End-to-end this takes well over 5 minutes on real-world assessments, blocking the user with a spinner.

Two distinct issues compound the latency:

1. **Wrong moment.** Stages 1 + 2 (entities, ownership) are derivable from uploaded documents alone, but they currently wait until step 5 to start. Documents are already on disk from step 2-3.
2. **Wrong source priority.** The current prompts pass the user's Q&A answers and the uploaded documents to Claude with equal weight — and they pass only the bare `answer` column (yes/no/unknown), **never** the `explanation` free-text. The user's typed context (entity names, transaction details, classification rationale) never reaches the LLM, so Claude defaults to extracting from the jaarrekening. Numbers and structures inferred from the financial statements then override what the user has actually told us.

## Goal

Get to `draft_ready` faster, and make the chart faithful to what the user said (not what the LLM inferred from the balance sheet).

Concretely:
- Entities + ownership are extracted in the background **as soon as documents finish uploading**, so by the time the user reaches step 5 the heavy lifting is already on disk.
- A second pass runs at step 5 (triggered by the "Continue to structure chart" click after Q&A) that **refines** the entity/ownership graph and adds transactions + ATAD2 mismatch classification, treating the **full Q&A (answer + explanation) as authoritative** and documents as background.
- Total user-facing wait at step 5 drops to ~60-90s in the typical case.

## Architecture

Split `extract-structure` into two phases driven by a new `phase` request parameter.

```
┌──────────────────────┐         ┌──────────────────────┐
│ Doc upload complete  │         │ Q&A complete         │
│ (start-analyze fires)│         │ (user clicks         │
│                      │         │  "Continue")         │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           ▼                                ▼
   extract-structure                extract-structure
   ?phase=docs_only                 ?phase=refine_and_transactions
           │                                │
           ▼                                ▼
   stage1-initial                   stage1-refine
   stage2-initial                   stage2-refine
   → phase_a_ready                  stage3
                                    → draft_ready
```

Both phases use `EdgeRuntime.waitUntil` for fire-and-forget execution; the frontend tracks progress through `atad2_structure_charts.status` polling as it does today.

### Phase A — `phase=docs_only` (background, at upload)

**Trigger.** The existing `start-analyze` Edge Function (which kicks off the prefill swarm when the user clicks "Continue" on the upload page) gains a sibling fire-and-forget call to `extract-structure` with `phase=docs_only`. The two background jobs run in parallel.

**Inputs.** Documents block only. The `<qa_answers>` placeholder is omitted (not empty — omitted entirely, so prompts don't reference it).

**Stages run.**
- `stage1-initial`: extract entities from documents.
- `stage2-initial`: extract ownership from documents.

**Persistence.** Writes rows to `atad2_structure_entities` and `atad2_structure_edges` with `source = 'ai_extracted'`. Status walks `extracting:stage1` → `extracting:stage2` → `phase_a_ready`.

**Time budget.** 30-60s on Sonnet 4.6 with prompt caching.

**User visibility.** None. The user is still in the Q&A step and never sees a Phase-A loader. If the user happens to navigate to step 5 while Phase A is still running, the existing `AtlasLoader` renders correctly (stages 1+2 active, 3+4 pending).

### Phase B — `phase=refine_and_transactions` (foreground, at Q&A complete)

**Trigger.** The "Continue to structure chart" button at the bottom of the Q&A page (step 4) fires a `POST /extract-structure` with `phase=refine_and_transactions` and then navigates to `/assessment/structure/<sessionId>`. The Edge Function returns 200 immediately and runs the work in `EdgeRuntime.waitUntil`.

**Inputs.** Documents block + Q&A block. The Q&A block now includes `question_text`, `answer`, AND `explanation` for every answered question.

**Stages run.**
- `stage1-refine`: passes the existing entities (from Phase A) plus the Q&A block. Prompt asks Claude to add missing entities the user mentioned, remove entities the Q&A contradicts, rename, re-classify. **Output schema is identical to `stage1-initial`** — the full final entity list. Server-side diff against the Phase-A rows yields the inserts/updates/deletes.
- `stage2-refine`: same pattern for ownership. Output schema identical to `stage2-initial`.
- `stage3`: transactions + ATAD2 mismatch classification (unchanged from today's stage 3, except for the new prompt header — see below).

**Phase-A-failed fallback.** If Phase A failed or never ran (e.g. the chart row is missing or has zero AI-extracted entities), Phase B runs `stage1-initial` + `stage2-initial` + `stage3` instead of the refine path. Same end result, slower. The route decision is: *"if the chart has ≥ 1 `ai_extracted` entity, use refine; else use initial"*.

**Persistence.** Refines existing rows. AI-extracted rows that disappear in the refinement are deleted; new ones are inserted; renames/re-classifications are updates. `source = 'user_added'` and `source = 'user_edited'` rows are never touched (existing idempotency rule).

**Time budget.** 60-90s total. Refine prompts are short (entity list + Q&A is much smaller than full docs); only stage 3 is doc-heavy.

**User visibility.** Standard `AtlasLoader`. Status walks `extracting:refining` → `extracting:stage3` → `draft_ready`. The existing "Continue without transactions" escape hatch keeps working on stage 3.

### Source-priority change (prompt-level)

Every Phase-B prompt gets a header above the existing instructions:

> *The Q&A block below is the user's authoritative testimony about their corporate structure. Treat every Q&A answer and explanation as ground truth. The `<documents>` block is background — use it only to fill in factual gaps (legal names, ISO codes, amounts) the Q&A doesn't specify. Where Q&A and documents conflict, the Q&A wins. Never re-classify an ATAD2 mismatch contrary to the user's yes/no answer.*

The `<qa_answers>` block changes from:
```
Q 1 (Is the taxpayer a Dutch tax resident?): Yes
```
to:
```
Q 1 (Is the taxpayer a Dutch tax resident?)
  Answer: Yes
  Explanation: <free-text the user typed; may include entity names, amounts, structural context>
```

### Data model

`atad2_structure_charts.status` enum gains one new value:
- `phase_a_ready` — Phase A complete; awaiting Phase-B trigger.

Existing values keep their semantics. `extracting:refining` is a new internal label reusable from the existing `extracting:stage1/2` pattern (the frontend `stageOf()` mapper extends accordingly).

No new tables or columns needed. The existing `atad2_structure_entities.source` enum (`ai_extracted` / `user_added` / `user_edited`) is sufficient.

### Re-trigger paths

| Event | Action |
|---|---|
| User re-uploads docs | Re-run Phase A (clears existing `ai_extracted` rows, preserves user rows). Phase B becomes stale; user must click "Re-extract". |
| User edits a Q&A answer after Phase B finished | Banner appears on the chart page: *"Your Q&A changed since the chart was generated. Re-extract?"*. Manual button; no auto-rerun. |
| User clicks the existing "Re-extract" button | Runs Phase B only (entities/ownership refine + stage 3). |
| User edits or adds entities/edges manually | No re-extract. User edits are local-first and never overwritten by re-extracts. |

### Frontend changes

**`src/pages/Assessment.tsx` (Q&A page).** The "Continue to structure chart" button gains a pre-navigation fetch:
```ts
await fetch(`${FUNCTIONS_BASE}/extract-structure`, {
  method: 'POST',
  body: JSON.stringify({ session_id, phase: 'refine_and_transactions' }),
});
navigate(`/assessment/structure/${sessionId}`);
```
Fire-and-forget — we don't await the actual extraction, just the 200 acknowledgement.

**`src/components/structure/StructureChartStep.tsx`.** Initial mount no longer auto-calls `startExtraction`. It only does `loadChart` + `pollUntilTerminal`. If `phase_a_ready` is the current status when the user arrives (Phase B trigger hasn't fired for some reason, e.g. user navigated directly via URL), show a "Generate transactions" CTA that triggers Phase B manually.

**`src/components/structure/AtlasLoader.tsx`.** `stageOf()` mapper:
- `phase_a_ready` → stage 2 (entities + ownership done, mapping ownership ✓, transactions pending)
- `extracting:refining` → stage 2 active (refining)
- `extracting:stage3` → stage 3 active (transactions)
- existing draft_ready/finalized → stage 4

**`src/lib/structure/types.ts`.** Extend `ChartStatus`:
```ts
export type ChartStatus =
  | 'extracting:stage1'
  | 'extracting:stage2'
  | 'extracting:refining'   // NEW
  | 'extracting:stage3'
  | 'phase_a_ready'         // NEW
  | 'draft_ready'
  | 'user_edited'
  | 'finalized'
  | 'extraction_failed';
```

### Backend changes

**`supabase/functions/extract-structure/index.ts`.**
- Request body extends to `{ session_id: string, phase?: 'docs_only' | 'refine_and_transactions' }`. Default = `refine_and_transactions` (so existing UI calls without `phase` get the full new behavior).
- `runExtractionPipeline()` routes by phase.
- `loadQaAnswersText()` now selects `question_id, question_text, answer, explanation` and formats them as the multi-line block shown above.

**`supabase/functions/extract-structure/prompts/`.**
- `stage1-entities.ts` → splits into `stage1-initial.ts` (docs-only) and `stage1-refine.ts` (Q&A + existing entities).
- `stage2-ownership.ts` → splits into `stage2-initial.ts` and `stage2-refine.ts`.
- `stage3-transactions.ts` — unchanged except for the new Q&A-primary header.
- Each Phase-B prompt opens with the source-priority header shown above.

**`supabase/functions/start-analyze/index.ts`** (or wherever the prefill-swarm fire-and-forget lives — to be located during implementation). Adds:
```ts
const er = (globalThis as any).EdgeRuntime;
if (er?.waitUntil) {
  er.waitUntil(
    fetch(`${SUPABASE_URL}/functions/v1/extract-structure`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ session_id, phase: 'docs_only' }),
    }),
  );
}
```

## Tests

Following the project's existing vitest conventions for `src/lib/structure/`:
- `extract-schemas.test.ts` extends with cases for the refine-prompt output schemas (same shape, different prompt — schema validation should remain identical).
- New unit test for `loadQaAnswersText` formatter (Phase B input) — verifies `explanation` is included and missing explanations don't crash.
- Frontend `stageOf()` mapper test — verifies `phase_a_ready` and `extracting:refining` route to correct stage indices.
- No new Edge Function integration tests; existing manual end-to-end verification in `docs/superpowers/specs/2026-05-08-...` template applies.

## Out of scope

- Background worker queues (Inngest, durable tasks). `EdgeRuntime.waitUntil` is sufficient given the new 10-minute worker timeout.
- Websocket / Realtime status push. Existing 2s polling is fine for 60-120s pipelines.
- Provisional chart preview during Phase A or during Q&A. The user explicitly chose "show nothing until Phase B done" for the cleanest UX.
- Automatic re-extract on Q&A edits. Manual banner + button is sufficient.
- Cost optimization beyond the natural reduction from refine-prompts being shorter than full-extract prompts.

## Verification

1. `npx tsc --noEmit` → 0 errors.
2. `npm test` → all existing tests still pass; new tests for `loadQaAnswersText` and `stageOf()` mapper pass.
3. Edge Function deploy via VM `az vm run-command`, container restart.
4. End-to-end:
   - New assessment. Upload docs.
   - Watch the prefill-swarm progress; the structure chart row should appear in `atad2_structure_charts` within ~5s with status `extracting:stage1`.
   - Inside ~60s, status should reach `phase_a_ready` and the entity + ownership tables should be populated.
   - Complete Q&A; on the "Continue to structure chart" click, Phase B starts. Total wait at step 5: ≤ ~90s to `draft_ready`.
   - Edit a Q&A explanation that names an entity not in the docs (e.g. "Our German sister company is Vogel GmbH"). Re-extract from the chart page. Vogel GmbH appears in the refined chart.
   - Edit a Q&A answer flipping a yes/no on a hybrid-mismatch question. Re-extract. The corresponding transaction's `is_mismatch` flag in the chart matches the new answer.
5. Manually test the "Continue without transactions" escape hatch still works on stage 3 (no regression).
