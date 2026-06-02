# Prompt strengthening — silence rule (v5)

**Date:** 2026-05-12
**Author:** Lennart Wilming + Claude
**Status:** Approved for plan

## Problem

The active swarm prefill prompt (`prefill_swarm_system` v4) instructs the model to hedge but still permits absence-based negations. In practice the model returns "no" verdicts like *"There do not appear to be any dual-resident mismatches based on the available information"* even when the uploaded documents are not the kind that would ever surface such a mismatch (e.g., a single jaarrekening for a question about dual residency or hybrid entities).

The advisor cannot tell from such output whether the model actually found evidence ruling the issue out, or whether the docs were simply silent on the topic. This is a confidence-calibration failure that risks under-reporting real ATAD2 issues.

## Goal

Make the prompt enforce: **only prefill an answer when the documents contain positive evidence about the topic. Otherwise return `null` and let the advisor answer manually.** Stop dressing absence-of-mention up as a "no" verdict.

## Scope

In scope:
- Rewrite the active swarm prefill prompt to v5 via a new migration.
- Expand banned-phrase list in Rule 1.
- Add new Rule 9 — "No inference from absence".
- Produce a parallel reference document for the n8n memo Code node so the same policy can be hand-applied there.

Out of scope:
- UI changes to surface null-prefill records distinctly from "no prefill ran". Defer until live use shows the gap is confusing.
- Bringing the n8n memo prompt into the admin DB (separate project; see Future Work).
- Per-question evidence-type metadata (rejected as approach B during brainstorming).

## Approach

Surgical edit of the swarm system prompt. v5 keeps the v4 structure intact and:
1. Adds **Rule 9** establishing the silence-as-null behavior, with carve-outs against Rule 3 (low-confidence path) and Rule 6 (source_refs required).
2. Extends the **Rule 1 banned-phrase list** with the specific phrasings observed to leak absence-based negations into output.
3. Provides a fresh BAD/GOOD example pair specifically for the silence case (the v4 BAD/GOOD pair targets a different failure — referencing the document by name — and stays in place).

## The new prompt text

### Rule 1 — banned-phrase list addition

Append to the existing banned-phrase enumeration in Rule 1:

> "I don't see any indication of...", "There do not appear to be...", "Based on the available information, no...", "No indication of...", "Nothing suggests...", "It is not apparent that..."

### Rule 9 — No inference from absence (new, appended after Rule 8)

```
9. NO INFERENCE FROM ABSENCE. The documents either provide positive evidence about a topic or they do not. Positive evidence means: an explicit statement of the answer, a substantive analysis with a conclusion, OR plain-reading facts that directly establish the answer (e.g., a single tax-residency jurisdiction stated for an entity is positive evidence regarding dual residency). Absence of mention is NOT positive evidence.

If positive evidence is present, answer per Rules 1-8.

If the documents are silent on the topic, output:
- suggested_answer: null
- confidence_pct: null
- answer_rationale: null
- suggested_toelichting: ONE short sentence describing what kind of evidence would be needed to assess this, in advisor voice, without making any verdict. If you cannot describe it neutrally, set to empty string.
- source_refs: [] (this is the ONLY exception to Rule 6)

BAD example (silence reported as "no"):
{
  "suggested_answer": "no",
  "confidence_pct": 55,
  "answer_rationale": "There do not appear to be any dual-resident mismatches based on the available information.",
  "suggested_toelichting": "Based on the available documents, no dual residency issue is identified for Camden B.V."
}

GOOD example (silence reported as silence):
{
  "suggested_answer": null,
  "confidence_pct": null,
  "answer_rationale": null,
  "suggested_toelichting": "Assessing this requires a residency analysis with treaty tie-breaker review, which falls outside what has been provided.",
  "source_refs": []
}
```

### Interactions with existing rules

- **Rule 3 (confidence calibration).** Unchanged. The `<40 → null` path remains for the "weak positive evidence" case where the model has *some* signal but it is thin. Rule 9 is the stricter gate that fires *before* Rule 3 is reached — silence short-circuits to null regardless of any confidence calibration.
- **Rule 6 (source_refs).** Rule 9 carves out the silence case as the only situation where `source_refs: []` is acceptable. All other outputs continue to require at least one entry with a precise location.
- **Rule 1 (advisor voice).** The silence-case `suggested_toelichting` must still avoid referencing documents by name. "...which falls outside what has been provided" is acceptable; "...which is not in the uploaded jaarrekening" is not.

## Files changed

1. **New:** `supabase/migrations/<YYYYMMDDhhmmss>_swarm_prompt_v5.sql`
   - Pattern matches `20260506100000_swarm_prompt_v4.sql`: deactivate active v4, insert v5 row in `atad2_prompts`.
   - `notes` field documents the v4 → v5 delta (silence rule + expanded banned phrases).
2. **New:** `docs/prompts/n8n-memo-system.md`
   - Reference document, not runtime-linked.
   - Contains the Rule 9 text adapted for the n8n memo Code node context.
   - Header note explains this is a manual copy-paste reference; updates require editing the n8n node directly via `https://n8n.atad2.tax`.

No source code changes. No DB schema changes. No UI changes.

## UX impact

Existing logic in [src/pages/Assessment.tsx:180,397](../../../src/pages/Assessment.tsx) treats `suggested_answer: null` and `confidence_pct < 40` as "no prefill" — no auto-select, no badge, no rationale block. Increased frequency of null prefills will simply present more questions to the advisor as unanswered.

Known gap (deferred): a null prefill record is currently indistinguishable in the UI from "AI not yet run". If post-rollout feedback shows this is confusing, a follow-up can add a subtle indicator distinguishing the two states.

## Testing

Manual verification post-migration:
1. Apply migration to local Supabase.
2. Run prefill on a test assessment with only a jaarrekening uploaded.
3. Inspect prefill records in DB and in the Assessment UI:
   - Questions about dual residency / hybrid entities should have `suggested_answer: null`.
   - Questions answerable from financials (e.g., total interest expense thresholds) should still be prefilled normally.
4. Spot-check the `suggested_toelichting` for null cases — should describe needed evidence, never assert a verdict, never use banned phrasings.

No automated tests. The behavior is non-deterministic LLM output; regressions are caught by re-running the manual check on representative assessments.

## Rollback

Standard pattern from prior swarm-prompt migrations: a follow-up migration reactivates v4 by setting `is_active = true` on the v4 row and `is_active = false` on the v5 row. No data migration needed; the prefill cache can be cleared if desired.

## Future work (not in this spec)

- **Bring the n8n memo prompt into admin.** Either migrate report generation off n8n to a Supabase Edge Function whose prompt lives in `atad2_prompts`, or have the n8n workflow fetch its prompt from `atad2_prompts` at runtime. Separate brainstorm/spec.
- **Null-prefill UI indicator.** If advisors find it ambiguous whether a blank question reflects AI abstention vs no AI run, add a subtle "AI: insufficient evidence" pill on questions with a null prefill record.
- **Per-question evidence-type hints.** If Rule 9 alone proves insufficient, consider per-question metadata declaring what evidence type is required (rejected as Approach B during brainstorming for being heavy and dual-source-of-truth).
