# Prefill contextual hint — design

**Date**: 2026-05-17
**Branch context**: `feat/document-prefill`
**Status**: Approved for planning

## Problem

The AI prefill currently writes a single `suggested_toelichting` field per question. The prompt encourages it to be useful, but the AI often blurs two very different kinds of content into that field:

1. **User-voice clarification** — paraphrased document content the user could have typed themselves to explain their answer. ("The holding period started on 5 January 2023 when X acquired 62.7% of shares.")
2. **Contextual hint / pointer** — inference-style text addressed to the user, suggesting *where to get the answer* rather than providing it. ("Assessing this requires confirmation from the associated shareholders — notably Castleton Commodities International LLC (62.7% since 5 January 2023) — as to how they classify the Dutch taxpayer under their own local tax law.")

The second kind does not belong in `suggested_toelichting` because that field is supposed to be content the user could have typed as their own clarification. But this hint content is genuinely useful — it leverages the uploaded documents to tell the user where to look — so throwing it away would be wasteful.

Each question already carries a static `question_explanation` (admin-edited toelichting) rendered in a collapsible info-box. The hint content can be appended to that toelichting at render time, making the static explanation feel personalised to the user's specific dossier.

## Goal

Route AI prefill output into one of two mutually exclusive buckets per question:

- `suggested_toelichting` → when documents support an actual answer the user could write themselves.
- `contextual_hint` → when documents do NOT support an answer, but DO point at where/how to get it. Appended seamlessly after the static `question_explanation` in the collapsible info-box.

Never both. The hint is bonus content we already generate today — we just route it to the right place.

## Non-goals

- No separate UI section, marker, badge, or icon for the hint — it sits seamlessly inside the existing info-box.
- No change to the suggestion-card behaviour when a real answer suggestion exists.
- No retroactive reclassification of existing prefill rows — only newly generated prefills follow v6 rules.
- No separate confidence / source-refs for the hint — it shares the document context of the prefill run.
- No DB CHECK constraint enforcing mutual exclusivity — the rule lives in the prompt + Zod schema (defensive, not destructive).

## Design

### 1. Data model

Add a nullable column to `atad2_question_prefills`:

```sql
ALTER TABLE public.atad2_question_prefills
  ADD COLUMN contextual_hint text;
```

Extend `QuestionPrefill` in [src/lib/prefill/types.ts](src/lib/prefill/types.ts):

```ts
contextual_hint: string | null;
```

**Invariant** (enforced in the edge function, not in DB): per prefill, either `suggested_toelichting` OR `contextual_hint` is populated, never both. If the LLM produces both, we keep `suggested_toelichting` and drop the hint (defensive — no exception thrown, no batch failure).

**Length cap**: `contextual_hint` gets the same 1000-character limit as `suggested_toelichting`.

Existing fields (`suggested_answer`, `confidence_pct`, `answer_rationale`, `source_refs`) are naturally null/empty when only a hint is generated.

### 2. Swarm prompt v6

New prompt-version migration (`20260517100000_swarm_prompt_v6.sql`) with this routing rule at the top of the instructions:

> **Routing rule**: For each question, you produce EXACTLY ONE of two outputs — never both:
>
> - **`suggested_toelichting`** — use ONLY when the documents contain information the user could have typed as their own clarification of the answer. Write in advisor-voice, factual, paraphrasing the doc content. Example: "The holding period started on 5 January 2023 when X acquired 62.7% of shares." This is content the user would write themselves to explain their answer.
> - **`contextual_hint`** — use when the documents do NOT contain a derivable answer, but DO contain information that helps the user know where/how to get it. Write in advisor-voice, addressed to the user, max 2-3 sentences. Example: "Confirmation is needed from the participating shareholders — notably Castleton Commodities International LLC (62.7% since 5 January 2023) — as to how they classify the Dutch taxpayer under their own local tax law."
>
> If you produce `contextual_hint`, then `suggested_answer`, `confidence_pct`, `answer_rationale`, and `source_refs` MUST be null/empty (you have no answer to back up). If you produce `suggested_toelichting`, fill the other fields as usual.

The existing Rule 5 ("TOELICHTING. 2-5 sentences...") is tightened to apply only when a real answer is derivable from the docs.

**Zod schema** in [supabase/functions/prefill-documents/schemas.ts](supabase/functions/prefill-documents/schemas.ts):

- Add `contextual_hint: z.string().max(1000).nullable()`
- Refinement: if both `suggested_toelichting` and `contextual_hint` are populated, drop the hint and keep the toelichting. Log a routing-violation warning for monitoring.

Activate v6 via the existing prompt-activation mechanism (see v5 migration for the pattern).

### 3. UI rendering

**[src/components/QuestionExplanationInline.tsx](src/components/QuestionExplanationInline.tsx)**:

- Accept new optional prop: `contextualHint?: string | null`.
- If `contextualHint` is present, render it as a new paragraph after the static `question_explanation`, separated by a blank line. No marker, no icon, no prefix. Seamless.
- If the static `question_explanation` is empty but a hint exists: render only the hint. Box still does NOT auto-open (stays collapsed by default — user opens it when they want help).
- If both are empty: box does not render at all (current behaviour).

```tsx
{questionExplanation && <div>{renderWithBullets(questionExplanation)}</div>}
{contextualHint && questionExplanation && <div className="h-2" />}
{contextualHint && <div>{renderWithBullets(contextualHint)}</div>}
```

**[src/pages/Assessment.tsx](src/pages/Assessment.tsx)** (~lines 2185-2220):

- Pass `prefill?.contextual_hint` into `QuestionExplanationInline`.
- The suggestion-card already renders only when there is a `suggested_toelichting` (or a `suggested_answer`). Verify during implementation that the current conditional does not accidentally render an empty card when only a hint exists — adjust if needed.

**[src/components/prefill/SuggestionCard.tsx](src/components/prefill/SuggestionCard.tsx)**: no changes.

### 4. User experience

- Question with answer-from-docs → suggestion-card renders as today; toelichting stays collapsed with static text only.
- Question with hint-only → no suggestion-card; toelichting stays collapsed, but on open shows static text + hint seamlessly.
- Question without prefill → unchanged.

### 5. Lifecycle & edge cases

| Scenario | Behaviour |
|---|---|
| Prefill rerun (new docs, explicit rerun) | Prefill row replaced as today. New run may swap hint → answer, answer → hint, or update the hint. No special logic. |
| User answers the question themselves | Hint stays in the info-box. It is contextual help, not a suggestion to act on — there is nothing to dismiss. If the user later opens the box, the personalisation is still there. |
| User accepts/edits/dismisses suggestion-card | Only relevant when there is a `suggested_toelichting` (so no hint exists). `user_action` updated as today. N/A for the hint path. |
| Admin edits static `question_explanation` | No interaction with the hint. The hint is attached to the prefill row (per session), not to the question row. Static text can change; the hint renders behind it on next view. |
| Existing prefill rows | Get `contextual_hint = null`. No retroactive reclassification. Existing inference-flavoured `suggested_toelichting` content stays as-is until next rerun. |
| LLM produces both fields | Zod refinement keeps `suggested_toelichting`, drops `contextual_hint`. Logged for monitoring. No exception. |
| LLM produces neither | Valid. No prefill row written for that question (current behaviour). |

## Files touched

- `supabase/migrations/20260517100000_swarm_prompt_v6.sql` — new prompt version with routing rule
- `supabase/migrations/20260517100100_prefill_contextual_hint.sql` — add column
- [supabase/functions/prefill-documents/schemas.ts](supabase/functions/prefill-documents/schemas.ts) — extend Zod schema with refinement
- [supabase/functions/prefill-documents/analyze.ts](supabase/functions/prefill-documents/analyze.ts) — write `contextual_hint` to DB; log routing violations
- [src/lib/prefill/types.ts](src/lib/prefill/types.ts) — extend `QuestionPrefill` interface
- [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) — regenerate or hand-edit to include new column
- [src/components/QuestionExplanationInline.tsx](src/components/QuestionExplanationInline.tsx) — accept `contextualHint` prop, render below static text
- [src/pages/Assessment.tsx](src/pages/Assessment.tsx) — pass `prefill?.contextual_hint` through; verify no empty card when hint-only

## Testing

- **Edge function**: unit test the Zod refinement — both-populated input drops hint and logs; hint-only input passes through; toelichting-only input unchanged.
- **Prompt**: spot-check v6 output on the Castleton-style question from the conversation (expected: hint, no toelichting) and on a question with a clean doc-supported answer (expected: toelichting, no hint). Manual eyeballing in admin audit logs.
- **UI**: open a question with hint-only → suggestion-card absent, info-box collapsed; open info-box → static text + hint visible without separator. Open a question with toelichting-only → card present, info-box collapsed with only static text on open.
- **Backwards compat**: existing prefill rows (pre-migration) render correctly — `contextual_hint = null` means current behaviour.
