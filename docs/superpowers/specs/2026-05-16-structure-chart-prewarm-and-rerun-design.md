# Structure chart pre-warm & post-questions re-run

**Date:** 2026-05-16
**Status:** approved (spec)
**Goal:** Eliminate the wait at the Structure step by extracting the chart in the
background while the user is in Questions, then re-running extraction once they
finish Questions so that question answers override document data.

## Problem

Today, structure-chart extraction is only triggered when the user arrives at the
Structure step. The user waits 30–60 seconds staring at a loading spinner.

The extraction backend already supports two phases:
- **Phase A** (`docs_only`): runs stages 1–2 (entities, ownership) using document
  text alone. Produces a usable chart skeleton; status ends at `phase_a_ready`.
- **Phase B** (`refine_and_transactions`): runs all stages with question answers
  treated as authoritative ground truth (`QA_PRIMACY_HEADER`). If Phase A rows
  exist, it takes a faster `runStage1Refine` / `runStage2Refine` path; otherwise
  it runs from scratch.

We are not using these phases yet — Phase A is never triggered automatically, and
Phase B only fires on Structure entry. We wire them to the actual UX events.

## Triggers (data flow)

Three moments. The user sees nothing.

1. **Documents → Questions click** — browser computes a fingerprint of the
   session's documents (sorted document IDs from `atad2_session_documents`
   joined by `|`; new uploads get new UUIDs, deletes shrink the set, so IDs
   alone are sufficient to detect content changes), compares it to
   `localStorage['phaseA:${sessionId}']`. If different and at least one
   document exists, fires `startExtraction(sessionId, 'docs_only')`
   fire-and-forget and updates the stored fingerprint.

2. **Phase A completion (backend self-chain)** — directly after `runPhaseA`
   sets status `phase_a_ready`, the pipeline queries `atad2_answers` for the
   session. If any rows exist, it continues into `runPhaseB` in the same
   isolate (already running under `EdgeRuntime.waitUntil`). No second HTTP
   hop, no auth dance — the user's original invocation keeps the worker alive
   long enough for both phases (typical A+B wall time ≈ 45-60s, within the
   waitUntil budget).

3. **Questions → Confirmation click** — after the existing `finishAssessment`
   answer upsert, browser fires `startExtraction(sessionId, 'refine_and_transactions')`.
   Edge function dispatches on current chart status (see Concurrency below).

The existing 60-second poll-and-fallback in `StructureChartStep.tsx` is left
untouched as a third safety net for any path that didn't run.

## Concurrency contract

The edge function gates concurrent invocations on the chart's current status:

| Incoming `phase` | Current chart status      | Behavior                                              |
| ---------------- | ------------------------- | ----------------------------------------------------- |
| any              | `extracting:*`            | Return 409 `{ reason: 'already_running' }` immediately|
| `docs_only`      | (no chart row)            | Create chart + run Phase A                            |
| `docs_only`      | `phase_a_ready` / `draft_ready` / `extraction_failed` | Create-or-overwrite + run Phase A     |
| `refine_and_transactions` | (no chart row)   | Create chart + Phase B initial-fallback path          |
| `refine_and_transactions` | `phase_a_ready`  | Phase B refine path                                   |
| `refine_and_transactions` | `draft_ready` / `extraction_failed` | Re-run Phase B (refine if AI rows exist, else fallback) |

The 409 response is the lock primitive. The client treats 409 as a no-op,
trusting that some other trigger (self-chain, fallback) will eventually produce
the chart. No retries, no toasts.

## Backend changes

File: `supabase/functions/extract-structure/index.ts`

1. **Status guard at handler entry** — after loading the chart row and before
   dispatching to `runPhaseA` / `runPhaseB`, if the loaded status starts with
   `extracting:`, return HTTP 409 with `{ reason: 'already_running' }`.

2. **Self-chain after Phase A** — in `runExtractionPipeline`, after `runPhaseA`
   returns successfully (status now `phase_a_ready`):
   - Query `atad2_answers` count for the session.
   - If count > 0, call `runPhaseB(serviceClient, chartId, sessionId)` directly
     in the same isolate. The original invocation's `EdgeRuntime.waitUntil`
     covers both phases.
   - If Phase A itself failed, `runExtractionPipeline`'s existing catch already
     sets `extraction_failed`; self-chain is skipped.

No new columns, no migration, no new state flags. The existing `status` field
is the entire state machine.

## Client changes

1. **New helper** — `src/lib/structure/phaseAPrewarm.ts`
   - `export async function maybePrewarmPhaseA(sessionId: string): Promise<void>`
   - Queries `atad2_session_documents` for the session (selecting only `id`),
     builds fingerprint, compares to localStorage entry, fires
     `startExtraction(sessionId, 'docs_only')` fire-and-forget on mismatch.
   - On extraction error (including 409), clears the stored fingerprint so the
     next transition can retry. This is correct for 409 too: 409 means another
     run is in flight on a possibly-stale fingerprint, and we want the next
     navigation to re-evaluate against the current set.

2. **Documents → Questions hook** — `src/pages/AssessmentUpload.tsx`,
   `handleContinue()`. Call `void maybePrewarmPhaseA(sessionId)` before the
   existing `startAnalyze.mutate()`.

3. **Questions → Confirmation hook** — `src/pages/Assessment.tsx`,
   `finishAssessment()`. After the `atad2_answers` upsert and before
   navigation, call `void startExtraction(sessionId, 'refine_and_transactions').catch(...)`.
   Swallow 409 silently (expected), warn on other errors.

4. **`startExtraction` error shape** — `src/lib/structure/extraction.ts`. On a
   non-2xx response, throw an `Error` augmented with `status: number` so the
   call sites above can distinguish 409 from genuine failures.

5. **Structure step** — no changes. The existing poll-and-fallback at
   `StructureChartStep.tsx:289–387` remains as the third safety net.

## UX

The user sees no new indicators. Phase A is silent (per user decision). On
Structure entry the user waits for Phase B to complete (per user decision); the
existing loading state covers this, and most of the time Phase B is already
done because it ran during Confirmation.

## Edge cases

- **No documents uploaded.** Phase A is skipped (fingerprint helper exits on
  empty doc list). Phase B fires on Questions completion and runs the
  initial-fallback path.
- **User re-uploads documents.** Fingerprint changes → Phase A re-triggers on
  next Documents → Questions transition. If the previous run is still in flight,
  edge function returns 409 and the in-flight run finishes. Re-trigger on the
  next navigation corrects any drift.
- **Phase A fails.** Status becomes `extraction_failed`. Self-chain is skipped.
  Phase B trigger on Questions completion sees the failed status and runs the
  initial-fallback path (`hasExisting` check in `runPhaseB` already handles
  this).
- **Tab closed between Questions and Structure.** The backend self-chain
  triggered by Phase A completion still runs Phase B. When the user returns,
  status is already `draft_ready`.
- **localStorage cleared (private browsing).** Phase A re-fires on every
  Documents → Questions transition. The 409 guard prevents duplicate concurrent
  runs. No correctness impact, one extra API call worst case.
- **User edits answers and finishes Questions again.** Client fires Phase B
  again. Edge function sees `draft_ready`, re-runs Phase B refine path against
  the current chart rows.

## Testing

Manual verification only (no new unit tests):

1. **Happy path.** Upload 1 document → click Continue → spend ~30s in Questions
   → Finish. In DevTools Network, verify two `extract-structure` POSTs landed
   and the chart row is `draft_ready` before Structure step is reached.
2. **No-docs path.** Skip uploads → answer Questions → Finish. Verify chart is
   created from scratch on Structure entry, status reaches `draft_ready`.
3. **Tab-close path.** Click Continue → inspect chart row in Supabase Studio →
   close tab → wait 60s → re-open Structure step. Chart should already be
   `draft_ready` without the client doing anything.

If fingerprint mismatch bugs surface in practice, add unit tests for
`maybePrewarmPhaseA` then.

## Out of scope

- New status fields, pending-action flags, or other state-machine columns.
- Visual indicators for background extraction progress.
- Showing Phase A's output to the user before Phase B finishes.
- Cancellation of an in-flight extraction when answers change.
