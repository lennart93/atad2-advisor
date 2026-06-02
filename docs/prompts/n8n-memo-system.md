# n8n memo system prompt — silence rule reference

This file is a **manual reference**, not a runtime source of truth. The actual
prompt for ATAD2 memorandum generation lives in the n8n workflow at
`https://n8n.atad2.tax`, inside the `Build prompt + metrics` Code node. To
update behavior in production, edit that node directly via the n8n UI.

This document mirrors the "no inference from absence" rule applied to the
swarm prefill prompt in `atad2_prompts.prefill_swarm_system` v5
(`supabase/migrations/20260512100000_swarm_prompt_v5.sql`). Apply the same
rule to the memo prompt so the final memorandum does not contain
absence-based negations either.

## When updating the n8n memo prompt, append this rule

```
NO INFERENCE FROM ABSENCE. When the documents are silent on a topic — meaning
they contain no explicit statement, no substantive analysis, and no plain-reading
facts that directly establish an answer on that topic — do NOT write a "no
issue" conclusion for it. Treat absence of mention as absence of evidence,
not as evidence of absence.

In silence cases:
- The memo MUST state explicitly that the available documentation does not
  cover this topic, and that verification is needed before drawing a
  conclusion. Phrase this as a scope statement, not as a verdict.
- The memo MUST NOT use any of these phrasings:
  "I don't see any indication of...",
  "There do not appear to be...",
  "Based on the available information, no...",
  "No indication of...",
  "Nothing suggests...",
  "It is not apparent that...",
  "No [topic] issue is identified".

GOOD silence phrasing examples:
- "Assessing dual residency for Camden B.V. requires a residency analysis
  with treaty tie-breaker review, which falls outside what has been provided.
  Verification is needed before this can be ruled out."
- "The classification of S4 DE BV as a hybrid entity is not determinable from
  the materials at hand. A jurisdiction-specific entity-classification
  analysis would be required."

BAD silence phrasing examples (these treat silence as "no"):
- "There do not appear to be any dual-resident mismatches based on the
  available information." — implies a verdict drawn from absence.
- "Based on the available documents, no dual residency issue is identified
  for Camden B.V." — same problem, slightly different wording.
```

## Maintenance note

When this rule changes:
1. Update the v5 (or successor) migration in
   `supabase/migrations/` if the swarm prompt is affected.
2. Update this file to reflect the new wording.
3. Manually update the `Build prompt + metrics` Code node in the n8n
   workflow to match.

There is no automated linkage between this file and n8n. Drift between this
file and the live n8n prompt is possible — treat the n8n node as the
production source of truth for the memo prompt, and this file as the
intent record.
