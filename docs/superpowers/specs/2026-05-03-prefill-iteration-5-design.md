# Document Pre-Fill iteration 5 — single-surface per-question redesign

**Date:** 2026-05-03
**Branch:** `feat/document-prefill`
**Builds on:** iter 3 (swarm pipeline) and iter 4 (UX polish on swarm)

---

## Context

Iter 4 shipped the swarm pipeline + per-question chip + sidebar pill, but the per-question presentation in `/assessment` is still messy. During testing the user surfaced four concrete problems:

1. **Legacy `summarize` 400 errors during upload.** Console shows `POST /functions/v1/prefill-documents 400` for an action that no longer exists. The swarm-orchestrator path is correct but `useUploadDocument` and `useUploadText` in [usePrefill.ts](src/hooks/usePrefill.ts) still fire `invokePrefillFn({ action: "summarize", ... })` calls. They produce 400s and confuse the network log.

2. **Per-question layout is visually fragmented.** A question with a prefill currently shows three stacked surfaces:
   - rationale caption ("Likelihood 82% · Camden distributed…")
   - radio buttons with a small "Suggested" badge in the matching one
   - a separate `border-l-2 bg-primary/5` "Suggested context" panel below
   - all of that nested inside the generic `Explanation` textarea wrapper
   That's four pieces of chrome for one logical idea ("AI thinks: X, because Y, with this toelichting"). Visually noisy.

3. **"Suggested" + likelihood are split.** The badge inside the answer button reads `Suggested`; the percentage is in a caption above. The user wants `Suggested (82%)` inline, one place.

4. **Inconsistent visibility on `requires_explanation = false` answers.** The iter 4 `hasPrefill` flag through `usePanelController` is correct, but on questions where no prefill exists at all the user gets a blank zone with no signal. Should show a tiny inline note "No relevant context found in the uploaded documents for this question." — but only when documents were actually uploaded and analysis is complete.

This iteration consolidates the per-question presentation into one clean surface and removes the legacy 400.

---

## Approach

### Section 1 — Single-surface per-question model ("Option A")

**The suggestion IS the toelichting field.** Not a card above the field, not a panel beside it — the suggestion text becomes the textarea content, and the surrounding chrome communicates the AI provenance.

**Three zones** per question, top-down:

```
┌─ Zone 1: Question header (unchanged) ─────────────────────┐
│  Q12. Is the entity a tax-resident in NL?                 │
│  Question explanation text...                             │
└───────────────────────────────────────────────────────────┘

┌─ Zone 2: Answer row ──────────────────────────────────────┐
│  ( ● ) Yes   ( ) No  Suggested (82%)   ( ) Unknown        │
└───────────────────────────────────────────────────────────┘

┌─ Zone 3: Suggestion-as-toelichting surface ───────────────┐
│  ▎AI suggestion · Camden Hold BV, 2024 financials, p.4    │
│                                                           │
│  The entity is a Dutch private limited company...         │
│                                                           │
│  [Accept] [Edit] [Dismiss]                                │
└───────────────────────────────────────────────────────────┘
```

**Zone 3 behaviour:**

- Default state (prefill present, not yet acted on):
  - left-border `border-l-2 border-primary/40`
  - small uppercase header `AI suggestion` + middle dot + comma-joined `source_refs[].doc_label` (max 2, then "+N more")
  - body = `prefill.suggested_toelichting` rendered as static `<p>` (NOT a textarea yet — read-only)
  - action row: **Accept** / **Edit** / **Dismiss**

- After **Accept**:
  - text is committed to the answer's `explanation` via `updateExplanation`
  - prefill `user_action` set to `"accepted"`
  - surface dismisses (locally + via Realtime)
  - falls back to the standard toelichting textarea if `requires_explanation === true`

- After **Edit**:
  - the same surface morphs in place — header stays, body becomes a `<Textarea>` pre-filled with the suggestion text
  - action row becomes **Save** / **Cancel**
  - **Save** writes to `explanation` and marks prefill `"edited"`; surface dismisses
  - **Cancel** reverts to the read-only state

- After **Dismiss**:
  - prefill `user_action` set to `"dismissed"` (or `"moved_to_additional_context"` if user opts to keep it as additional context — keep the existing two-choice toggle from iter 4)
  - surface dismisses
  - the standard toelichting textarea opens (only if `requires_explanation === true`)

**Why "single surface":** zone 3 is the toelichting. There is no separate "Explanation" wrapper around it. If the user wants to write their own toelichting from scratch, they Dismiss and the plain textarea takes the same slot. One mental model: this slot is where the answer's toelichting lives, and right now an AI has prepared a draft.

### Section 2 — Inline "Suggested (NN%)" inside the answer button

Replace the iter 4 split (`Likelihood {x}% · {rationale}` caption + `Suggested` badge) with:

- **In-button badge:** when `option.answer_option.toLowerCase() === currentPrefill?.suggested_answer && (currentPrefill.confidence_pct ?? 0) >= 40`, render `<span>Suggested ({confidence_pct}%)</span>` inside the matching answer button. Style: `ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded`. No surrounding caption.
- **Rationale moves into Zone 3 header** as small muted text under the source-refs line:
  `text-xs text-muted-foreground italic mt-1` → `currentPrefill.answer_rationale`
  Truncated at ~140 chars with a `Show more` toggle if longer.

The above-radios caption is **deleted**. Auto-select effect on first prefill arrival is unchanged from iter 4.

### Section 3 — Remove legacy `summarize` 400

In [usePrefill.ts](src/hooks/usePrefill.ts):

- `useUploadDocument` mutation: remove the trailing fire-and-forget block that calls `invokePrefillFn({ action: "summarize", session_id, document_id })`.
- `useUploadText` mutation: same — remove the matching `summarize` invocation.

The swarm pipeline does not need a per-document summarize step; document text is bundled into `documentsBlock` at swarm-start time by `useStartAnalyze`. The `summarize` action no longer exists in [supabase/functions/prefill-documents/index.ts](supabase/functions/prefill-documents/index.ts) (only `analyze_one` and `cleanup`), so each call returns 400 and clutters the network log.

No replacement call is added. Net change: two delete blocks in `usePrefill.ts`.

### Section 4 — `hasPrefill` flow (already correct) + empty-state line

**4a. `hasPrefill` flow.** Already wired correctly on the branch:

- [usePanelController.ts:9](src/hooks/usePanelController.ts#L9) accepts `hasPrefill?: boolean`
- [usePanelController.ts:74-75](src/hooks/usePanelController.ts#L74-L75) `shouldRender = !!selectedAnswerId && (requiresExplanation === true || hasPrefill === true)`
- [Assessment.tsx:250](src/pages/Assessment.tsx#L250) fetches `currentPrefillForGate` before the hook
- [Assessment.tsx:260](src/pages/Assessment.tsx#L260) passes `!!currentPrefillForGate` as the 5th arg

No code change. Captured in spec as an explicit invariant so iter 5 work doesn't accidentally regress it.

**4b. Empty-state line.** When the user picks an answer on a question with **no** prefill, render a small inline note in zone 3's slot:

> *No relevant context found in the uploaded documents for this question.*

**Render conditions (all three must hold):**
- `prefillJob.status === 'completed'` (don't show during `analyzing` — the sidebar pill already communicates that)
- session has ≥1 document in `atad2_session_documents` (don't show on the no-docs path — it'd be obvious filler)
- `currentPrefillForGate == null` for this `question_id`

**Rendering:**
- Position: same slot as zone 3 surface, directly under the answer row
- Style: `text-xs italic text-muted-foreground mt-3 ml-1`
- Engelstalig (project rule: UI is English-only)
- No card, no border, no icon, no action button
- The standard toelichting textarea still opens below this line if `requires_explanation === true` for the picked answer

---

## Files to modify

| File | Change |
|---|---|
| [src/components/prefill/SuggestionCard.tsx](src/components/prefill/SuggestionCard.tsx) | Replace with single-surface zone 3 component (rename to `SuggestionSurface.tsx` for clarity, or keep filename and rewrite). Adds in-place Edit→textarea morph. |
| [src/pages/Assessment.tsx](src/pages/Assessment.tsx) | Drop the above-radios likelihood caption. Update in-button badge to `Suggested ({confidence_pct}%)`. Render empty-state line when conditions in 4b hold. Remove the now-redundant `Explanation` wrapper around zone 3 (suggestion is the toelichting). |
| [src/components/EditableAnswer.tsx](src/components/EditableAnswer.tsx) | Same in-button badge update for the report-page edit path. |
| [src/hooks/usePrefill.ts](src/hooks/usePrefill.ts) | Delete `summarize` fire-and-forget calls in `useUploadDocument` and `useUploadText`. |

**No DB migration. No edge-function change. No prompt change.** All work is on the React side, except the two-block delete in `usePrefill.ts`.

---

## Out of scope

- Multi-question batching / cross-question reasoning
- Editing the prefill prompt itself
- Any new admin-side UI
- Confidence-pct calibration (the model decides; we display)

---

## Verification

Hard-refresh and walk through:

1. **Upload — no 400s.** Upload one PDF. DevTools → Network: zero requests with `action: "summarize"`. The swarm starts via `analyze_one` and the sidebar pill ticks up.
2. **Single-surface render.** On a question with a prefill: one panel under the radio row. Header line "AI suggestion · {doc labels}". Suggestion body. Three buttons.
3. **In-button badge.** Matching radio button reads `Suggested (82%)`. No caption above the radios.
4. **Accept flow.** Click Accept → text inserted into the answer's `explanation`, surface gone, prefill marked `accepted` in DB.
5. **Edit flow.** Click Edit → same surface, body becomes a textarea pre-filled with the suggestion. Modify a sentence, Save → text inserted, surface gone, prefill marked `edited`.
6. **Dismiss flow.** Click Dismiss → surface gone, prefill marked `dismissed`. If `requires_explanation = true`, plain textarea takes the slot; if false, the slot collapses.
7. **`requires_explanation = false` + prefill present.** Pick "No" on a question whose static schema says no toelichting needed but a prefill exists → zone 3 surface still appears.
8. **Empty state.** Pick an answer on a question with no prefill (after analysis completed and docs were uploaded) → italic muted line "No relevant context found in the uploaded documents for this question."
9. **No-docs path.** Sessions where the user uploaded zero docs → no empty-state line ever shown; behaviour is exactly the legacy explanation-textarea path.
10. **DB sanity.** `SELECT user_action, count(*) FROM atad2_question_prefills GROUP BY user_action;` → counts roll between `accepted` / `edited` / `dismissed` as the user clicks.
