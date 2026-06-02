# Structure Chart Pre-warm & Post-Questions Re-run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-warm the structure-chart extraction when the user leaves Documents and re-run it after Questions completion (with Q&A primacy), so arrival at the Structure step is near-instant.

**Architecture:** Phase A (`docs_only`) fires on Documents → Questions navigation, fingerprint-deduped. Edge function self-chains into Phase B (`refine_and_transactions`) in the same isolate when Phase A completes if `atad2_answers` rows exist. A 409 status guard prevents concurrent invocations. Existing Phase B trigger on Questions completion remains as a fallback for the case where the user finishes Questions before Phase A completes.

**Tech Stack:** TypeScript, React 19, Vite, Supabase JS client (frontend); Deno + Supabase Edge Runtime (backend); Vitest for unit tests.

---

## File Structure

**Create:**
- `src/lib/structure/phaseAPrewarm.ts` — fingerprint-deduped fire-and-forget Phase A trigger
- `src/lib/structure/__tests__/phaseAPrewarm.test.ts` — unit tests for the helper

**Modify:**
- `supabase/functions/extract-structure/index.ts` — add 409 status guard in the handler; add self-chain into Phase B in `runExtractionPipeline`
- `src/lib/structure/extraction.ts` — augment thrown error with `status` property so call sites can distinguish 409
- `src/hooks/usePrefill.ts` — remove the in-line Phase A dispatch (moves to the new helper)
- `src/pages/AssessmentUpload.tsx` — call `maybePrewarmPhaseA` from both the "Continue to questions" and "Skip suggestions" handlers
- `src/pages/Assessment.tsx` — swallow 409 silently in the existing Phase B catch handler

**No database migration. No new UI elements. No new state columns.**

---

## Task 1: Backend — 409 status guard in handler

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts:62-68`

The handler currently runs `ensureChart` then `setStatus("extracting:stage1")` unconditionally. If the chart is already in an `extracting:*` state from a prior invocation, this races. Add a guard that returns HTTP 409 with `{ reason: 'already_running' }` instead.

- [ ] **Step 1: Modify `ensureChart` to return id + status**

Replace `ensureChart` ([index.ts:177-191](supabase/functions/extract-structure/index.ts#L177-L191)) with:

```ts
async function ensureChart(client: SupabaseClient, sessionId: string) {
  const { data: existing } = await client
    .from("atad2_structure_charts")
    .select("id, status")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) return existing as { id: string; status: string | null };
  const { data, error } = await client
    .from("atad2_structure_charts")
    .insert({ session_id: sessionId })
    .select("id, status")
    .single();
  if (error) throw error;
  return data as { id: string; status: string | null };
}
```

- [ ] **Step 2: Add 409 guard after `ensureChart` in the handler**

In the handler at [index.ts:66-68](supabase/functions/extract-structure/index.ts#L66-L68), change:

```ts
    const chart = await ensureChart(serviceClient, body.session_id);

    await setStatus(serviceClient, chart.id, "extracting:stage1", { warnings: [] });
```

to:

```ts
    const chart = await ensureChart(serviceClient, body.session_id);

    if (chart.status && chart.status.startsWith("extracting:")) {
      return json(
        { reason: "already_running", chart_id: chart.id, status: chart.status },
        409,
      );
    }

    await setStatus(serviceClient, chart.id, "extracting:stage1", { warnings: [] });
```

- [ ] **Step 3: Manual verification (deploy + curl)**

Deploy the function locally or to the dev project, then in two terminals run two requests for the same session_id back-to-back. Expected: first returns 200 with status `extracting:stage1`; second returns 409 with `{ reason: 'already_running' }`.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/extract-structure" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_UUID>","phase":"docs_only"}'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): return 409 when extraction already running"
```

---

## Task 2: Backend — self-chain into Phase B after Phase A

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts:110-134`

When Phase A finishes (`runPhaseA` sets status `phase_a_ready`) and Q&A answers already exist for the session, continue into Phase B in the same isolate. This handles the case where the user finishes Questions faster than Phase A completes — by the time A is done, the answers are already there and we can chain straight into B without waiting for a separate trigger.

- [ ] **Step 1: Add a helper to check Q&A row count**

Insert this helper near the other DB helpers (after `loadTaxpayerName` at [index.ts:244-251](supabase/functions/extract-structure/index.ts#L244-L251)):

```ts
async function hasQaAnswers(client: SupabaseClient, sessionId: string): Promise<boolean> {
  const { count } = await client
    .from("atad2_answers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return (count ?? 0) > 0;
}
```

- [ ] **Step 2: Chain Phase B inside `runExtractionPipeline` after Phase A**

In [index.ts:110-134](supabase/functions/extract-structure/index.ts#L110-L134), change `runExtractionPipeline` from:

```ts
async function runExtractionPipeline(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
  phase: Phase,
): Promise<void> {
  try {
    if (phase === "docs_only") {
      await runPhaseA(serviceClient, chartId, sessionId);
    } else {
      await runPhaseB(serviceClient, chartId, sessionId);
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "pipeline_unhandled",
      message: String(err),
      chart_id: chartId,
      phase,
    }));
    await setStatus(serviceClient, chartId, "extraction_failed", {
      warnings: [{ stage: 0, message: String(err).slice(0, 500) }],
    });
  }
}
```

to:

```ts
async function runExtractionPipeline(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
  phase: Phase,
): Promise<void> {
  try {
    if (phase === "docs_only") {
      await runPhaseA(serviceClient, chartId, sessionId);
      // Self-chain into Phase B when answers already exist (user finished
      // Questions faster than Phase A completed). Same isolate, same
      // EdgeRuntime.waitUntil budget — no second HTTP hop.
      if (await hasQaAnswers(serviceClient, sessionId)) {
        console.log(JSON.stringify({
          level: "info",
          event: "phase_a_self_chain_to_b",
          chart_id: chartId,
        }));
        await runPhaseB(serviceClient, chartId, sessionId);
      }
    } else {
      await runPhaseB(serviceClient, chartId, sessionId);
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "pipeline_unhandled",
      message: String(err),
      chart_id: chartId,
      phase,
    }));
    await setStatus(serviceClient, chartId, "extraction_failed", {
      warnings: [{ stage: 0, message: String(err).slice(0, 500) }],
    });
  }
}
```

- [ ] **Step 3: Manual verification (with Q&A pre-existing)**

Set up: session with `atad2_answers` rows for at least one question, and a chart that does not yet exist. Fire Phase A:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/extract-structure" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_UUID>","phase":"docs_only"}'
```

In Supabase Studio, watch `atad2_structure_charts.status` for this session. Expected progression: `extracting:stage1` → `extracting:stage2` → `phase_a_ready` → `extracting:refining` (or `extracting:stage1` if refine path bails) → `extracting:stage3` → `draft_ready`. Log line `phase_a_self_chain_to_b` should appear in the function logs.

- [ ] **Step 4: Manual verification (without Q&A)**

Same setup but truncate `atad2_answers` first. Fire Phase A. Expected: status stops at `phase_a_ready`, no self-chain log line, no further status transitions.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): self-chain into Phase B when answers exist after A"
```

---

## Task 3: Client — augment `startExtraction` error with HTTP status

**Files:**
- Modify: `src/lib/structure/extraction.ts:8-23`

So that call sites can swallow 409 silently while still surfacing other failures.

- [ ] **Step 1: Augment the thrown error**

Replace the body of `startExtraction` ([extraction.ts:8-23](src/lib/structure/extraction.ts#L8-L23)) with:

```ts
export async function startExtraction(
  sessionId: string,
  phase: 'docs_only' | 'refine_and_transactions' = 'refine_and_transactions',
): Promise<{ chart_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_BASE}/extract-structure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ session_id: sessionId, phase }),
  });
  if (!r.ok) {
    const err = new Error(`Extraction failed: ${r.status} ${await r.text()}`) as Error & { status: number };
    err.status = r.status;
    throw err;
  }
  return r.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/structure/extraction.ts
git commit -m "refactor(extraction): expose HTTP status on startExtraction error"
```

---

## Task 4: Client — `phaseAPrewarm` helper + tests

**Files:**
- Create: `src/lib/structure/phaseAPrewarm.ts`
- Create: `src/lib/structure/__tests__/phaseAPrewarm.test.ts`

The helper computes a fingerprint over the session's documents (sorted IDs from `atad2_session_documents`, joined by `|`), compares it to `localStorage['phaseA:<sessionId>']`, and fires `startExtraction(sessionId, 'docs_only')` fire-and-forget only when the fingerprint changed and at least one document exists. On any extraction error (including 409), clears the stored fingerprint so the next navigation re-evaluates.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/phaseAPrewarm.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the supabase client and the startExtraction module BEFORE importing the
// SUT, so the helper picks up the mocks on first import.
const docRows: { id: string }[] = [];
const supabaseMock = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: docRows, error: null })),
    })),
  })),
};
vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

const startExtraction = vi.fn(() => Promise.resolve({ chart_id: 'chart-1' }));
vi.mock('@/lib/structure/extraction', () => ({ startExtraction }));

import { maybePrewarmPhaseA } from '../phaseAPrewarm';

describe('maybePrewarmPhaseA', () => {
  beforeEach(() => {
    localStorage.clear();
    docRows.length = 0;
    startExtraction.mockClear();
    startExtraction.mockResolvedValue({ chart_id: 'chart-1' });
  });

  it('fires extraction when docs exist and no fingerprint stored', async () => {
    docRows.push({ id: 'a' }, { id: 'b' });
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).toHaveBeenCalledWith('session-1', 'docs_only');
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b');
  });

  it('skips when fingerprint matches stored value', async () => {
    docRows.push({ id: 'a' }, { id: 'b' });
    localStorage.setItem('phaseA:session-1', 'a|b');
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it('fires extraction when fingerprint differs (new doc uploaded)', async () => {
    docRows.push({ id: 'a' }, { id: 'b' }, { id: 'c' });
    localStorage.setItem('phaseA:session-1', 'a|b');
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b|c');
  });

  it('skips when no documents exist', async () => {
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).not.toHaveBeenCalled();
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });

  it('sorts ids so insertion order does not change the fingerprint', async () => {
    docRows.push({ id: 'b' }, { id: 'a' });
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b');
  });

  it('clears the stored fingerprint on extraction error so next call retries', async () => {
    docRows.push({ id: 'a' });
    const err = new Error('boom') as Error & { status: number };
    err.status = 500;
    startExtraction.mockRejectedValueOnce(err);
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });

  it('clears the stored fingerprint on 409 too (next navigation re-evaluates)', async () => {
    docRows.push({ id: 'a' });
    const err = new Error('busy') as Error & { status: number };
    err.status = 409;
    startExtraction.mockRejectedValueOnce(err);
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/structure/__tests__/phaseAPrewarm.test.ts
```

Expected: all tests fail with `Cannot find module '../phaseAPrewarm'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/structure/phaseAPrewarm.ts`:

```ts
import { supabase } from '@/integrations/supabase/client';
import { startExtraction } from '@/lib/structure/extraction';

/**
 * Fire-and-forget Phase A trigger with a localStorage-backed fingerprint so we
 * don't re-extract when the user navigates Documents → Questions without
 * changing the doc set. New uploads get fresh UUIDs and deletes shrink the
 * set, so sorted IDs alone are a sufficient content fingerprint.
 *
 * On any extraction error (incl. 409 from the concurrent-invocation guard) we
 * clear the stored fingerprint so the next navigation re-evaluates against the
 * current doc set.
 */
export async function maybePrewarmPhaseA(sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('atad2_session_documents')
    .select('id')
    .eq('session_id', sessionId);
  if (error) {
    console.warn('[phaseAPrewarm] failed to list documents', error);
    return;
  }
  const ids = (data ?? []).map((d) => d.id as string);
  if (ids.length === 0) return;

  const fingerprint = [...ids].sort().join('|');
  const key = `phaseA:${sessionId}`;
  if (localStorage.getItem(key) === fingerprint) return;

  localStorage.setItem(key, fingerprint);
  try {
    await startExtraction(sessionId, 'docs_only');
  } catch (err) {
    localStorage.removeItem(key);
    console.warn('[phaseAPrewarm] startExtraction failed', err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/structure/__tests__/phaseAPrewarm.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/structure/phaseAPrewarm.ts src/lib/structure/__tests__/phaseAPrewarm.test.ts
git commit -m "feat(structure): add phaseAPrewarm helper with doc-fingerprint dedupe"
```

---

## Task 5: Client — wire the prewarm helper into both nav buttons; remove old in-line trigger

**Files:**
- Modify: `src/hooks/usePrefill.ts:297-307`
- Modify: `src/pages/AssessmentUpload.tsx:32-37, 76-96`

Today, Phase A is dispatched inline inside `useStartAnalyze.mutationFn` ([usePrefill.ts:302-307](src/hooks/usePrefill.ts#L302-L307)). This means it only fires when the user clicks "Continue to questions" — the "Skip suggestions" path never pre-warms, even when docs are uploaded. Move the trigger to the page level so both buttons use the new helper, and drop the now-redundant inline dispatch.

- [ ] **Step 1: Remove the inline Phase A dispatch from `useStartAnalyze`**

In [usePrefill.ts:297-307](src/hooks/usePrefill.ts#L297-L307), delete the block:

```ts
      // 2b. Kick off Phase A of the structure-chart extraction in parallel
      // with the prefill swarm. Fire-and-forget — Phase A runs in the Edge
      // Function's EdgeRuntime.waitUntil background, and the browser closing
      // the tab does not stop it. If this dispatch fails we silently log;
      // Phase B at step 5 will fall back to initial extraction.
      try {
        const { startExtraction } = await import('@/lib/structure/extraction');
        await startExtraction(sessionId, 'docs_only');
      } catch (e) {
        console.warn('[useStartAnalyze] Phase A dispatch failed; Phase B will use initial fallback', e);
      }
```

The Phase A trigger now lives on the page, called from both buttons.

- [ ] **Step 2: Add the import to `AssessmentUpload.tsx`**

In [AssessmentUpload.tsx:1-14](src/pages/AssessmentUpload.tsx#L1-L14), add the import after the existing structure-chart-adjacent imports (after the `ArrowRight` import at line 13):

```ts
import { maybePrewarmPhaseA } from "@/lib/structure/phaseAPrewarm";
```

- [ ] **Step 3: Call the helper from `handleContinue`**

In [AssessmentUpload.tsx:32-37](src/pages/AssessmentUpload.tsx#L32-L37), change:

```tsx
  const handleContinue = () => {
    startAnalyze.mutate(undefined, {
      onError: (e) => console.warn("[continue] analyze dispatch failed", e),
    });
    setWaiting(true);
  };
```

to:

```tsx
  const handleContinue = () => {
    void maybePrewarmPhaseA(sessionId);
    startAnalyze.mutate(undefined, {
      onError: (e) => console.warn("[continue] analyze dispatch failed", e),
    });
    setWaiting(true);
  };
```

- [ ] **Step 4: Call the helper from the "Skip suggestions" button**

In [AssessmentUpload.tsx:76-96](src/pages/AssessmentUpload.tsx#L76-L96), change the `left` slot of `AssessmentFooterSlot`:

```tsx
        left={
          <Button
            variant="outline"
            onClick={() => navigate(`/assessment?session=${sessionId}`)}
            className="transition-all duration-fast"
          >
            {hasAtLeastOneUploaded ? 'Skip suggestions' : 'Skip'}
          </Button>
        }
```

to:

```tsx
        left={
          <Button
            variant="outline"
            onClick={() => {
              void maybePrewarmPhaseA(sessionId);
              navigate(`/assessment?session=${sessionId}`);
            }}
            className="transition-all duration-fast"
          >
            {hasAtLeastOneUploaded ? 'Skip suggestions' : 'Skip'}
          </Button>
        }
```

Note: when there are no uploads, `maybePrewarmPhaseA` exits early (empty doc list), so the call is harmless in the "Skip" (no-uploads) case.

- [ ] **Step 5: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePrefill.ts src/pages/AssessmentUpload.tsx
git commit -m "feat(assessment): trigger Phase A prewarm on both Continue and Skip paths"
```

---

## Task 6: Client — silence 409 in Assessment.tsx Phase B catch

**Files:**
- Modify: `src/pages/Assessment.tsx:811-813`

The existing Phase B trigger ([Assessment.tsx:811-813](src/pages/Assessment.tsx#L811-L813)) warns on every error. After Task 1 it can legitimately receive a 409 (Phase A still running and will self-chain into B), which is not a real error.

- [ ] **Step 1: Update the catch handler**

In [Assessment.tsx:811-813](src/pages/Assessment.tsx#L811-L813), change:

```ts
      // Pre-fetch Phase B of the structure-chart extraction (refine + transactions)
      // so the user doesn't wait on Step 5. Phase A (entities + ownership from docs
      // alone) already ran at upload time via useStartAnalyze. Fire-and-forget.
      startExtraction(sessionId, 'refine_and_transactions').catch((err) => {
        console.warn('[Assessment] Phase B pre-fetch failed; Step 5 will retry', err);
      });
```

to:

```ts
      // Pre-fetch Phase B of the structure-chart extraction (refine + transactions)
      // so the user doesn't wait on Step 5. Phase A runs at the Documents → Questions
      // transition via maybePrewarmPhaseA. 409 here is expected when Phase A is
      // still in flight — the backend self-chain will fire Phase B on A's completion.
      startExtraction(sessionId, 'refine_and_transactions').catch((err) => {
        if ((err as { status?: number })?.status === 409) return;
        console.warn('[Assessment] Phase B pre-fetch failed; Step 5 will retry', err);
      });
```

- [ ] **Step 2: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "fix(assessment): treat 409 from Phase B trigger as expected no-op"
```

---

## Task 7: End-to-end manual verification

Three scenarios. Use a fresh session each time so no chart pre-exists.

- [ ] **Step 1: Happy path (slow Questions)**

1. Create a new session, upload 1–2 short documents.
2. Click "Continue to questions". Open DevTools → Network. You should see a `POST extract-structure` (Phase A) fire immediately.
3. Spend 60+ seconds answering questions.
4. In Supabase Studio, watch `atad2_structure_charts.status` for this session: should reach `phase_a_ready` while you're still answering.
5. Click Finish on the last question. Another `POST extract-structure` (Phase B) fires.
6. Walk through the Confirmation step (don't rush).
7. On Structure step entry: chart should already be `draft_ready`; no spinner beyond the initial paint.

- [ ] **Step 2: Self-chain path (fast Questions)**

1. Create a new session, upload 1–2 documents.
2. Click "Continue to questions". Phase A starts.
3. Race through Questions in ~20 seconds and click Finish — finish before Phase A completes.
4. Phase B trigger from Assessment.tsx will get a 409 (Phase A still running). Console should NOT show a warning (Task 6 silenced it).
5. Function logs should show `phase_a_self_chain_to_b` once Phase A reaches `phase_a_ready`.
6. On Structure step entry (after the Confirmation step): chart should be `draft_ready`.

- [ ] **Step 3: No-docs path**

1. Create a new session, do NOT upload any documents.
2. Click "Skip". Phase A is NOT triggered (helper exits on empty doc list — verify no `POST extract-structure` in Network).
3. Answer questions, Finish. Phase B fires normally.
4. On Structure step entry: chart builds from scratch via Phase B initial-fallback path; arrival shows the usual loading state.

- [ ] **Step 4: Re-upload path (dedupe)**

1. Create a new session, upload 1 document, click "Continue to questions" — note the Phase A request.
2. Click Back in browser to return to Documents.
3. Click "Continue to questions" again WITHOUT changing the doc set. In Network, verify NO new `POST extract-structure` (fingerprint matched, helper skipped).
4. Now go back to Documents, upload a second document, click "Continue to questions". In Network: NEW `POST extract-structure` fires (fingerprint changed).

- [ ] **Step 5: Commit (if any cleanup needed)**

If verification revealed nothing to change, no commit. If a fix was needed, commit it with a clear message.

---

## Self-Review (post-write)

- **Spec coverage:**
  - Triggers 1 (Docs → Questions) and 3 (Questions → Confirmation): Tasks 5 and 6.
  - Trigger 2 (backend self-chain): Task 2.
  - Concurrency contract (409 guard): Task 1.
  - Fingerprint dedupe: Task 4.
  - 409 swallowed by client: Tasks 3 and 6.
  - No DB migration / no new UI: confirmed.
  - Edge cases (no docs, re-upload, Phase A fail, tab close): covered by existing fallback (StructureChartStep 60s) and Task 2 self-chain.

- **Placeholders:** none.

- **Type consistency:**
  - `ensureChart` return type updated to include `status` (Task 1). Callers in the handler use only `chart.id` and `chart.status` — both present. Other call sites of `ensureChart`: none outside the same file.
  - `hasQaAnswers` defined in Task 2; used only in `runExtractionPipeline` in Task 2. ✓
  - `maybePrewarmPhaseA` defined in Task 4; called in Task 5. Signature `(sessionId: string) => Promise<void>`. ✓
  - `startExtraction` augmented error in Task 3; consumed by Tasks 4 (test) and 6 (catch). Property name `status` consistent across all. ✓
