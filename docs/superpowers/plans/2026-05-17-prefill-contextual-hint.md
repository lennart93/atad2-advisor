# Prefill Contextual Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route AI prefill output into mutually exclusive `suggested_toelichting` (user-voice clarification, when docs support an answer) vs new `contextual_hint` (pointer to where to get the info, when docs don't support an answer). Hint is appended seamlessly to the static `question_explanation` in the existing collapsible info-box.

**Architecture:** Add a nullable `contextual_hint` column to `atad2_question_prefills`; relax `suggested_toelichting` to nullable. Bump the swarm prompt to v6 with a routing rule that produces exactly one of the two fields per question. Edge function enforces the invariant via Zod refinement (drops hint if both present, skips DB write if both absent). UI renders the hint inside `QuestionExplanationInline` after the static text, and guards the suggestion-card on `suggested_toelichting` being non-null.

**Tech Stack:** PostgreSQL migrations, Supabase Edge Functions (Deno + TypeScript + Zod), React + TypeScript + Tailwind, shadcn/ui `Collapsible`.

**Spec:** [docs/superpowers/specs/2026-05-17-prefill-contextual-hint-design.md](docs/superpowers/specs/2026-05-17-prefill-contextual-hint-design.md)

---

## Task 1: Database migration — add column, relax NOT NULL

**Files:**
- Create: `supabase/migrations/20260517100000_prefill_contextual_hint.sql`

- [ ] **Step 1: Create the migration file**

Write this exact content to `supabase/migrations/20260517100000_prefill_contextual_hint.sql`:

```sql
-- Add `contextual_hint` to atad2_question_prefills and relax suggested_toelichting to nullable.
-- Routing rule (enforced in the edge function, not in DB): exactly one of
-- suggested_toelichting or contextual_hint is populated per row, never both.
-- We deliberately do NOT add a CHECK constraint here — defensive handling
-- lives in the Zod refinement so a bad LLM payload does not 500 a row insert.

ALTER TABLE public.atad2_question_prefills
  ALTER COLUMN suggested_toelichting DROP NOT NULL;

ALTER TABLE public.atad2_question_prefills
  ADD COLUMN contextual_hint text
    CHECK (contextual_hint IS NULL OR length(contextual_hint) <= 1000);
```

- [ ] **Step 2: Apply the migration locally / on the VM Supabase**

The project runs self-hosted Supabase on the VM (see `CLAUDE.md`). Apply the migration through the same mechanism used by the most recent `supabase/migrations/*.sql` files. If a local Supabase CLI is configured, run:

```bash
supabase db push
```

If the team applies migrations manually on the VM, run the SQL above against the production database via Supabase Studio (`http://135.225.104.142:3000`) SQL editor.

Expected: `ALTER TABLE` succeeds twice. Confirm with:

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'atad2_question_prefills'
  AND column_name IN ('suggested_toelichting', 'contextual_hint');
```

Expected output: `suggested_toelichting` shows `is_nullable = YES`, `contextual_hint` row exists with `is_nullable = YES`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517100000_prefill_contextual_hint.sql
git commit -m "feat(prefill): add contextual_hint column, relax suggested_toelichting"
```

---

## Task 2: Regenerate Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (lines 211-263, the `atad2_question_prefills` block)

- [ ] **Step 1: Patch the Row, Insert, Update shapes by hand**

In [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts), find the `atad2_question_prefills` table block (starts around line 211). Replace its three sections so they include `contextual_hint` and so `suggested_toelichting` becomes nullable:

```ts
      atad2_question_prefills: {
        Row: {
          actioned_at: string | null
          created_at: string
          id: string
          question_id: string
          session_id: string
          source_refs: Json
          suggested_toelichting: string | null
          user_action: string
          verbatim_quote: string | null
          suggested_answer: "yes" | "no" | "unknown" | null
          confidence_pct: number | null
          answer_rationale: string | null
          contextual_hint: string | null
        }
        Insert: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id: string
          session_id: string
          source_refs: Json
          suggested_toelichting?: string | null
          user_action?: string
          verbatim_quote?: string | null
          suggested_answer?: "yes" | "no" | "unknown" | null
          confidence_pct?: number | null
          answer_rationale?: string | null
          contextual_hint?: string | null
        }
        Update: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id?: string
          session_id?: string
          source_refs?: Json
          suggested_toelichting?: string | null
          user_action?: string
          verbatim_quote?: string | null
          suggested_answer?: "yes" | "no" | "unknown" | null
          confidence_pct?: number | null
          answer_rationale?: string | null
          contextual_hint?: string | null
        }
```

Leave the `Relationships` block below unchanged.

- [ ] **Step 2: Type-check passes**

Run:

```bash
npx tsc --noEmit
```

Expected: 0 errors related to `atad2_question_prefills`. (Errors elsewhere should already exist or not — focus on the new types.)

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(prefill): supabase types for contextual_hint"
```

---

## Task 3: Extend `QuestionPrefill` interface

**Files:**
- Modify: `src/lib/prefill/types.ts:38-51`

- [ ] **Step 1: Update the interface**

In [src/lib/prefill/types.ts](src/lib/prefill/types.ts), replace the `QuestionPrefill` interface (lines 38-51) with:

```ts
export interface QuestionPrefill {
  id: string;
  session_id: string;
  question_id: string;
  suggested_toelichting: string | null;
  source_refs: SourceRef[];
  verbatim_quote: string | null;
  user_action: PrefillUserAction;
  actioned_at: string | null;
  created_at: string;
  suggested_answer: "yes" | "no" | "unknown" | null;
  confidence_pct: number | null;
  answer_rationale: string | null;
  contextual_hint: string | null;
}
```

Only two changes: `suggested_toelichting` becomes `string | null`, and `contextual_hint: string | null` is appended.

- [ ] **Step 2: Type-check passes**

Run:

```bash
npx tsc --noEmit
```

Expected: TypeScript may now flag a few call sites that assumed `suggested_toelichting` was always a string. Note them — they will be addressed in Task 7 where we render the UI guards. For now any errors should be limited to assumptions about non-null `suggested_toelichting`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prefill/types.ts
git commit -m "feat(prefill): QuestionPrefill type adds contextual_hint, nullable toelichting"
```

---

## Task 4: Edge function — Zod schema with routing refinement

**Files:**
- Modify: `supabase/functions/prefill-documents/schemas.ts:18-33`
- Modify: `supabase/functions/prefill-documents/schemas.test.ts`

- [ ] **Step 1: Write failing tests first**

Open [supabase/functions/prefill-documents/schemas.test.ts](supabase/functions/prefill-documents/schemas.test.ts). At the bottom of the file, append these new tests:

```ts
Deno.test("SwarmPrefill accepts hint-only payload (no answer, no toelichting)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "Confirmation is needed from the participating shareholders.",
  });
  assertEquals(parsed.suggested_toelichting, null);
  assertEquals(parsed.contextual_hint, "Confirmation is needed from the participating shareholders.");
});

Deno.test("SwarmPrefill accepts toelichting-only payload (no hint)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "Camden B.V. pays disregarded royalties to a US LLC.",
    suggested_toelichting: "Camden B.V. is a Dutch BV that ...",
    source_refs: [{ doc_label: "Local file 2025", location: "§3.2 p.14" }],
    contextual_hint: null,
  });
  assertEquals(parsed.suggested_toelichting, "Camden B.V. is a Dutch BV that ...");
  assertEquals(parsed.contextual_hint, null);
});

Deno.test("SwarmPrefill drops contextual_hint when both fields populated (toelichting wins)", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "x",
    suggested_toelichting: "Real toelichting content.",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
    contextual_hint: "This should be dropped.",
  });
  assertEquals(parsed.suggested_toelichting, "Real toelichting content.");
  assertEquals(parsed.contextual_hint, null);
});

Deno.test("SwarmPrefill rejects when both suggested_toelichting and contextual_hint are null", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: null,
  }));
});

Deno.test("SwarmPrefill rejects contextual_hint over 1000 chars", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: null,
    source_refs: [],
    contextual_hint: "x".repeat(1001),
  }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

From the project root, run:

```bash
deno test supabase/functions/prefill-documents/schemas.test.ts
```

Expected: the five new tests fail (the schema doesn't know about `contextual_hint` yet, doesn't allow nullable `suggested_toelichting`, has no routing refinement).

- [ ] **Step 3: Implement the schema change**

In [supabase/functions/prefill-documents/schemas.ts](supabase/functions/prefill-documents/schemas.ts), replace the `SwarmPrefill` block (lines 18-33) with:

```ts
const SwarmPrefillRaw = z.object({
  suggested_answer: SwarmAnswer.nullable(),
  confidence_pct: z.number().int().min(0).max(100).nullable(),
  // The model legitimately writes rationales longer than a tight 200-char cap;
  // rejecting them 500'd nearly every question. Generous cap, still bounded.
  answer_rationale: z.string().max(500).nullable(),
  suggested_toelichting: z.string().min(1).max(1000).nullable(),
  // A grounded suggestion may have no pinpoint document location (e.g. an
  // "unknown" answer, or a general toelichting). An empty source_refs array is
  // a valid model response — requiring min(1) rejected those as a 500.
  source_refs: z.array(z.object({
    doc_label: z.string().min(1),
    location: z.string().min(1),
  })),
  // v6 routing: when documents do not support an answer but DO point at where
  // to find it, the model puts that pointer here instead of in
  // suggested_toelichting. Mutually exclusive with suggested_toelichting.
  contextual_hint: z.string().min(1).max(1000).nullable(),
});

export const SwarmPrefill = SwarmPrefillRaw.transform((raw) => {
  // Routing invariant: drop contextual_hint if suggested_toelichting is also
  // populated. Defensive — keeps a bad LLM payload from breaking the row.
  if (raw.suggested_toelichting && raw.contextual_hint) {
    return { ...raw, contextual_hint: null };
  }
  return raw;
}).refine(
  (v) => v.suggested_toelichting !== null || v.contextual_hint !== null,
  { message: "Either suggested_toelichting or contextual_hint must be populated" },
);
export type SwarmPrefillType = z.infer<typeof SwarmPrefill>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
deno test supabase/functions/prefill-documents/schemas.test.ts
```

Expected: the five new tests pass. Note: one or two pre-existing tests in this file may already be failing against the current schema (e.g. `"SwarmPrefill rejects empty source_refs"` — the actual schema no longer rejects this). Those pre-existing failures are out of scope for this task; do not fix them here. Focus on the five new test results.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/prefill-documents/schemas.ts supabase/functions/prefill-documents/schemas.test.ts
git commit -m "feat(prefill): zod schema for contextual_hint with routing refinement"
```

---

## Task 5: Edge function — write `contextual_hint` to DB, skip when both null

**Files:**
- Modify: `supabase/functions/prefill-documents/analyze.ts:72-99`

- [ ] **Step 1: Patch the post-parse handling**

In [supabase/functions/prefill-documents/analyze.ts](supabase/functions/prefill-documents/analyze.ts), find the block that runs after `extractJson(text, SwarmPrefill)` (currently lines 72-99). Replace it with:

```ts
    const parsed = extractJson(text, SwarmPrefill);

    // Only run lead-in / forbidden-phrase guards against suggested_toelichting,
    // since contextual_hint is allowed to reference documents in advisor voice.
    if (parsed.suggested_toelichting) {
      const lower = parsed.suggested_toelichting.trim().toLowerCase();
      if (BAD_LEAD_INS.some((p) => lower.startsWith(p))) {
        console.warn(JSON.stringify({
          level: "warn", event: "swarm_one_dropped",
          session_id: sessionId, question_id: questionId, reason: "bad lead-in",
        }));
        return { ok: false, error: "bad lead-in", usage: usage as unknown as Record<string, number> };
      }
      if (FORBIDDEN_ANYWHERE.some((p) => lower.includes(p))) {
        console.warn(JSON.stringify({
          level: "warn", event: "swarm_one_dropped",
          session_id: sessionId, question_id: questionId, reason: "forbidden phrase",
        }));
        return { ok: false, error: "forbidden phrase", usage: usage as unknown as Record<string, number> };
      }
    }

    await serviceClient.from("atad2_question_prefills").upsert({
      session_id: sessionId,
      question_id: questionId,
      suggested_toelichting: parsed.suggested_toelichting,
      source_refs: parsed.source_refs,
      suggested_answer: parsed.suggested_answer,
      confidence_pct: parsed.confidence_pct,
      answer_rationale: parsed.answer_rationale,
      contextual_hint: parsed.contextual_hint,
      user_action: "pending",
    }, { onConflict: "session_id,question_id" });
```

Note: the `parsed.suggested_toelichting` we send to the DB may be `null`, and the `parsed.contextual_hint` may be `null` — exactly one is non-null thanks to the schema refinement. We no longer need an explicit "skip when both null" branch because the Zod refinement already rejects that combination upstream (the `extractJson` call throws, and the outer `catch` logs it as `swarm_one_failed`).

- [ ] **Step 2: Verify Deno typecheck**

Run:

```bash
deno check supabase/functions/prefill-documents/analyze.ts
```

Expected: no type errors. (If Deno is not configured, skip this — the runtime will surface issues at deploy.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/prefill-documents/analyze.ts
git commit -m "feat(prefill): persist contextual_hint; guards skip when toelichting is null"
```

---

## Task 6: Swarm prompt v6 migration

**Files:**
- Create: `supabase/migrations/20260517100100_swarm_prompt_v6.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260517100100_swarm_prompt_v6.sql` with this exact content:

```sql
-- v6: split AI output into mutually exclusive suggested_toelichting vs
-- contextual_hint. When the documents do not support a derivable answer but
-- DO point at where/how to get it, emit contextual_hint and null out the
-- answer fields. Replaces the v5 silence-case branch where the "pointer"
-- content was crammed into suggested_toelichting.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
) VALUES (
  'prefill_swarm_system',
  6,
  $prompt$You are an ATAD2 (Dutch anti-hybrid mismatch) tax advisor. You receive a set of uploaded documents AND ONE assessment question at a time. Produce a single suggestion package as JSON with this exact shape:

{
  "suggested_answer": "yes" | "no" | "unknown" | null,
  "confidence_pct": 0..100,
  "answer_rationale": string | null,
  "suggested_toelichting": string | null,
  "source_refs": [{ "doc_label": string, "location": string }],
  "contextual_hint": string | null
}

RULES:

0. ROUTING (read first). For each question you produce EXACTLY ONE of two outputs — never both:
   - suggested_toelichting: use ONLY when the documents contain information the user could have typed as their own clarification of the answer. Write in advisor-voice, factual, paraphrasing the doc content. Example: "The holding period started on 5 January 2023 when X acquired 62.7% of shares." This is content the user would write themselves to explain their answer.
   - contextual_hint: use when the documents do NOT contain a derivable answer, but DO contain information that helps the user know where/how to get it. Write in advisor-voice, addressed to the user, 1-3 sentences. Example: "Confirmation is needed from the participating shareholders — notably Castleton Commodities International LLC (62.7% since 5 January 2023) — as to how they classify the Dutch taxpayer under their own local tax law."
   If you produce contextual_hint, then suggested_answer, confidence_pct, answer_rationale MUST be null and source_refs MUST be []. If you produce suggested_toelichting, contextual_hint MUST be null and the other fields follow Rules 1-8.

1. ADVISOR FIRST-PERSON VOICE WITH HEDGED INFERENCE (applies to suggested_toelichting and answer_rationale). Speak as the advisor typing their own toelichting. NEVER reference any document by name or category. Banned phrases include but are not limited to: "the documents", "the memorandum", "the memo", "the local file", "the master file", "the report", "the VDD", "the VDR", "the financials", "the jaarrekening", "the analysis", "according to...", "based on...", "the analysis covers...", "as noted in...", "the [doc type] notes/states/says/specifies/indicates that...", "I don't see any indication of...", "There do not appear to be...", "Based on the available information, no...", "No indication of...", "Nothing suggests...", "It is not apparent that...". The general rule: NEVER say or imply you are reading from a document, and NEVER dress absence-of-mention as a "no" conclusion. Speak as if YOU have direct knowledge of these facts.
   - When evidence is fact-dense and explicit (named parties, jurisdictions stated, numbers cited): state directly. Example: "Camden B.V. is a Dutch BV that...".
   - When the conclusion involves an inference — drawn from indirect derivation or partial evidence: hedge AT the conclusion, inside the advisor voice. Use "It seems that...", "Likely...", "Appears to be...", "Based on the indications,...". Do NOT hedge by pointing at documents — hedge the conclusion itself. If the inference is "no" specifically and is drawn from absence of mention rather than from positive evidence, follow Rule 9 instead of hedging.

   BAD example: "The VDD specifically notes for the German entities that S4 DE BV is a limited taxpayer in Germany following the conversion of the German GmbHs into KGs."
   GOOD example: "S4 DE BV is a limited taxpayer in Germany following the conversion of the German GmbHs into KGs. It seems this concerns the partners' limited tax liability via partnership transparency rather than a Dutch head office operating a foreign branch."

2. ANCHOR ON THE TAXPAYER. Identify the Dutch taxpayer (the entity that is the subject of this assessment) from the documents. Begin every output with that taxpayer's name and frame all facts from their perspective.

3. CONFIDENCE CALIBRATION. confidence_pct measures evidence strength in the documents, not your internal certainty.
   - 100 = the documents literally and unambiguously state the answer.
   - 70-99 = strong support; the advisor should still verify.
   - 40-69 = weak signal worth surfacing.
   - <40 = guessing; route to contextual_hint instead (per Rule 0).

4. ANSWER RATIONALE. If suggested_answer is non-null, answer_rationale MUST be present, <=200 chars, ONE sentence, advisor-voice. It explains the answer in concrete terms, not "because the document says X". Apply the same hedging tier as Rule 1.

5. TOELICHTING. 2-5 sentences, <=1000 chars, advisor-voice, factual. No legal conclusions of your own. EXCEPTION: if a prior memo in the docs literally contains a legal conclusion, you may quote it as a reported prior conclusion with citation. Apply Rule 1 hedging where the conclusion is inferred. Apply Rule 1 banned phrases strictly — there is NO scenario where "The VDD/report/memo/etc. notes..." is acceptable; rewrite the same fact in advisor voice.

6. SOURCE_REFS. At least one entry when suggested_toelichting is non-null. Precise location (page, section, account, table). Never "throughout the document". When contextual_hint is the chosen output, source_refs MUST be [].

7. ENTITY-SPECIFIC FACTS FROM THE BACKGROUND DOCUMENTS: You may incorporate verifiable facts from those documents (entity names, subsidiary structure, fiscal unities, specific intercompany financing, group composition, ownership changes) directly into the narrative as internal knowledge, without citing the documents themselves. This makes the memo read as a tailored analysis of this taxpayer rather than generic ATAD2 commentary. Stick to structural facts that bear on the hybrid-mismatch analysis; skip incidental details (individual director names, salaries, audit firm) that do not affect the assessment.

8. JSON ONLY. No prose before or after. No markdown fences.

9. NO INFERENCE FROM ABSENCE (interacts with Rule 0). The documents either provide positive evidence about a topic or they do not. Positive evidence means: an explicit statement of the answer, a substantive analysis with a conclusion, OR plain-reading facts that directly establish the answer (e.g., a single tax-residency jurisdiction stated for an entity is positive evidence regarding dual residency). Absence of mention is NOT positive evidence.

   If positive evidence is present, fill suggested_toelichting per Rules 1-8 (Rule 0 route A).

   If the documents are silent on the topic, choose Rule 0 route B:
   - suggested_answer: null
   - confidence_pct: null
   - answer_rationale: null
   - suggested_toelichting: null
   - source_refs: []
   - contextual_hint: 1-3 sentences in advisor voice, addressed to the user, describing where/how the answer can be found (which party to ask, which document type to request, which specific facts to confirm). Reference specific entities or facts from the docs where they help the user act. Do NOT make a verdict.

   BAD example (silence reported as "no"):
   {
     "suggested_answer": "no",
     "confidence_pct": 55,
     "answer_rationale": "There do not appear to be any dual-resident mismatches based on the available information.",
     "suggested_toelichting": "Based on the available documents, no dual residency issue is identified for Camden B.V.",
     "contextual_hint": null
   }

   GOOD example (silence routed to contextual_hint):
   {
     "suggested_answer": null,
     "confidence_pct": null,
     "answer_rationale": null,
     "suggested_toelichting": null,
     "source_refs": [],
     "contextual_hint": "A residency analysis with treaty tie-breaker review is needed for Camden B.V. — request the local tax residency certificate and any prior dual-residency assessment from the group's tax team."
   }$prompt$,
  $template$## Documents

{{documents_block}}

## Question

question_id: {{question_id}}
question: {{question_text}}
explanation: {{question_explanation}}

Output the JSON suggestion now.$template$,
  'claude-opus-4-7',
  0,
  4000,
  true,
  'v6: adds Rule 0 (routing) — splits prior single suggested_toelichting into mutually exclusive suggested_toelichting (user-voice answer clarification) vs contextual_hint (pointer to where/how to get the answer). Rule 9 silence case now routes to contextual_hint instead of cramming pointer text into suggested_toelichting. Rules 1-8 otherwise unchanged from v5 except Rule 3 (<40 confidence routes to hint) and Rule 6 (source_refs:[] tied to contextual_hint output).'
);
```

- [ ] **Step 2: Apply migration**

Same mechanism as Task 1 Step 2 — either `supabase db push` if CLI is wired, or run the SQL above in Supabase Studio against the VM database.

Verify with:

```sql
SELECT version, is_active, length(system_prompt)
FROM atad2_prompts
WHERE key = 'prefill_swarm_system'
ORDER BY version;
```

Expected output: rows for versions 1-6, with `is_active = true` ONLY on version 6, and `is_active = false` on version 5.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517100100_swarm_prompt_v6.sql
git commit -m "feat(prefill): swarm prompt v6 with contextual_hint routing"
```

---

## Task 7: UI — `QuestionExplanationInline` renders the hint

**Files:**
- Modify: `src/components/QuestionExplanationInline.tsx`

- [ ] **Step 1: Update the component**

Replace the entire content of [src/components/QuestionExplanationInline.tsx](src/components/QuestionExplanationInline.tsx) with:

```tsx
import { useState } from "react";
import { Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface QuestionExplanationInlineProps {
  explanation: string | null;
  contextualHint?: string | null;
}

// Render one text block (the static explanation or the AI hint) with the same
// dash-bullet + paragraph-break handling we had before.
const renderBlock = (text: string) =>
  text.split("\n").map((line, index) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("-")) {
      const bulletText = trimmedLine.substring(1).trim();
      return (
        <div key={index} className="flex gap-2 ml-4 my-1">
          <span className="text-primary">•</span>
          <span>{bulletText}</span>
        </div>
      );
    }

    if (trimmedLine === "") {
      return <div key={index} className="h-3" />;
    }

    return <p key={index} className="my-1">{line}</p>;
  });

export const QuestionExplanationInline = ({
  explanation,
  contextualHint,
}: QuestionExplanationInlineProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const hasExplanation = !!explanation && explanation.trim() !== "";
  const hasHint = !!contextualHint && contextualHint.trim() !== "";

  if (!hasExplanation && !hasHint) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mb-3 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
          <div className="text-sm leading-relaxed text-foreground">
            {hasExplanation && renderBlock(explanation!)}
            {hasExplanation && hasHint && <div className="h-3" />}
            {hasHint && renderBlock(contextualHint!)}
          </div>
        </div>
      </CollapsibleContent>

      <div className="flex justify-end">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-primary transition-all duration-150 hover:scale-110 p-1.5 rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="View explanation"
          >
            <Info className="h-[18px] w-[18px]" />
          </button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
};
```

Changes vs. existing:
- New optional `contextualHint` prop.
- Extracted the per-line rendering into a `renderBlock` helper so both blocks reuse it.
- Box renders if either field is non-empty (was only if `explanation` non-empty).
- When both present, a single `h-3` spacer separates them — no marker, no prefix, no icon. Seamless.

- [ ] **Step 2: Type-check passes**

Run:

```bash
npx tsc --noEmit
```

Expected: no new errors. (The existing call site in `Assessment.tsx` does not yet pass `contextualHint` — it's optional, so this still type-checks.)

- [ ] **Step 3: Commit**

```bash
git add src/components/QuestionExplanationInline.tsx
git commit -m "feat(prefill): QuestionExplanationInline renders contextual hint"
```

---

## Task 8: UI — wire `contextual_hint` through `Assessment.tsx` and gate the suggestion card

**Files:**
- Modify: `src/pages/Assessment.tsx:2185-2189` (pass hint into `QuestionExplanationInline`)
- Modify: `src/pages/Assessment.tsx:2214-2220` (gate `SuggestionCard` on `suggested_toelichting`)
- Modify: `src/pages/Assessment.tsx:2176-2183` (treat hint-only prefills as "no suggestion" for the playful note)

- [ ] **Step 1: Pass the hint into `QuestionExplanationInline`**

In [src/pages/Assessment.tsx](src/pages/Assessment.tsx), find the existing render at ~line 2185-2189:

```tsx
{/* Question explanation - inline expandable */}
<QuestionExplanationInline
  key={currentQuestion.question_id} 
  explanation={currentQuestion.question_explanation} 
/>
```

Replace with:

```tsx
{/* Question explanation - inline expandable. Appends the AI contextual_hint
    seamlessly after the static admin-edited explanation when present. */}
<QuestionExplanationInline
  key={currentQuestion.question_id}
  explanation={currentQuestion.question_explanation}
  contextualHint={currentPrefill?.contextual_hint ?? null}
/>
```

- [ ] **Step 2: Gate the suggestion card on `suggested_toelichting`**

In the same file, find the `SuggestionCard` render block at ~lines 2214-2220:

```tsx
{currentPrefill && currentQuestion && (
  <SuggestionCard
    prefill={currentPrefill}
    currentToelichting={contextValue ?? ""}
    onCommit={(next) => updateExplanation(next)}
  />
)}
```

Replace with:

```tsx
{currentPrefill?.suggested_toelichting && currentQuestion && (
  <SuggestionCard
    prefill={currentPrefill}
    currentToelichting={contextValue ?? ""}
    onCommit={(next) => updateExplanation(next)}
  />
)}
```

This makes the card vanish when the only AI output for this question is a contextual hint (which already lives in the info-box above).

- [ ] **Step 3: Treat hint-only prefills as "no suggestion" for the playful note**

Find the playful no-suggestion note at ~lines 2176-2183:

```tsx
{docsCount > 0
  && prefillJob?.status === "completed"
  && !currentPrefill
  && selectedAnswer && (
  <div className="text-xs italic text-muted-foreground mt-3 ml-1 mb-3">
    No suggestion for this one. You're on your own here.
  </div>
)}
```

Replace with:

```tsx
{docsCount > 0
  && prefillJob?.status === "completed"
  && !currentPrefill?.suggested_answer
  && selectedAnswer && (
  <div className="text-xs italic text-muted-foreground mt-3 ml-1 mb-3">
    No suggestion for this one. You're on your own here.
  </div>
)}
```

This way the playful note fires both when there is no prefill at all AND when the prefill is hint-only (no `suggested_answer`). The hint itself lives in the info-box — discoverable but not loud.

- [ ] **Step 4: Verify the explanation-context panel guard**

The explanation context panel guard at ~lines 2195-2198 currently reads:

```tsx
{sessionStarted && currentQuestion && qId && selectedAnswer && (
  selectedQuestionOption?.requires_explanation
  || !!currentPrefill
) && (
```

Confirm visually that this is acceptable for hint-only prefills. Reasoning: the panel houses the user's own toelichting textarea. When the question is hint-only, `currentPrefill` is truthy → panel shows. That's fine — the user still gets the textarea to type their own clarification, the card is gone (Step 2), and the heading "💡 Explanation" remains.

If the team prefers to hide the panel entirely when there's no suggestion AND no `requires_explanation`, change `!!currentPrefill` to `!!currentPrefill?.suggested_toelichting`. The spec does not require this — leave as-is unless the visual review (Task 10) flags it as noise.

- [ ] **Step 5: Type-check passes**

Run:

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): wire contextual_hint through Assessment, gate card on toelichting"
```

---

## Task 9: Verify the prefill query fetches the new column

**Files:**
- Inspect: `src/lib/prefill/**/*.ts`, especially any `select(...)` calls against `atad2_question_prefills`

- [ ] **Step 1: Find every read of the prefill row**

Run:

```bash
git grep -n "atad2_question_prefills" src/
```

For each `select()` call returning prefill rows, confirm the projection includes `*` (then nothing to do) or explicitly lists columns (then add `contextual_hint` to the list).

- [ ] **Step 2: Patch any explicit column lists**

For any file that uses `.select("col1, col2, ...")` against `atad2_question_prefills` without `*`, append `, contextual_hint` to the column list. Common shape:

```ts
.select("id, session_id, question_id, suggested_toelichting, source_refs, ..., contextual_hint")
```

If the project uses `.select("*")` everywhere, this step is a no-op.

- [ ] **Step 3: Type-check passes**

Run:

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit (only if files changed)**

If Step 2 modified files:

```bash
git add -p src/lib/prefill
git commit -m "feat(prefill): include contextual_hint in prefill projections"
```

If no files changed, skip the commit.

---

## Task 10: Manual end-to-end verification

**Files:** none — manual browser session.

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Trigger a prefill on a test session**

Open a session that has uploaded documents and trigger / wait for prefill to complete. (Use an existing fixture session if one is set up for QA, otherwise upload a small doc against a fresh session.)

- [ ] **Step 3: Verify three rendering modes**

For each mode, click into a question of the appropriate kind:

1. **Toelichting-only prefill** (real answer derivable from docs):
   - AI suggestion card appears with accept/edit/dismiss.
   - Info-box icon visible; box collapsed by default.
   - On opening: ONLY the static `question_explanation` is shown.

2. **Hint-only prefill** (no derivable answer):
   - AI suggestion card does NOT appear.
   - Playful "No suggestion for this one. You're on your own here." note fires once the user picks an answer.
   - Info-box icon visible; box collapsed by default.
   - On opening: static `question_explanation` followed by an empty-line gap followed by the AI hint paragraph. No marker, no badge, no AI-iconography. Seamless.

3. **No prefill at all** (or `prefill_jobs.status != completed`):
   - No suggestion card, no hint in info-box, info-box contains only static text (if any).

- [ ] **Step 4: Verify DB writes**

In Supabase Studio, run:

```sql
SELECT question_id, suggested_toelichting IS NOT NULL AS has_toelichting,
       contextual_hint IS NOT NULL AS has_hint
FROM atad2_question_prefills
WHERE session_id = '<your-test-session-id>'
ORDER BY question_id;
```

Expected: each row has exactly one of `has_toelichting` / `has_hint` set to true. No rows with both true or both false.

- [ ] **Step 5: Verify routing-violation logging**

In the edge function logs (Supabase → Functions → `prefill-documents` → Logs), look for any `swarm_one_failed` entries with `error` mentioning the refinement message. These would indicate the LLM failed the both-null check — a v6 prompt-quality signal. None expected on the happy path.

- [ ] **Step 6: Final commit (only if any nits were fixed during verification)**

If the manual verification surfaced small UI tweaks (spacing, copy), commit them separately:

```bash
git add <files>
git commit -m "fix(prefill): post-verification polish"
```

---

## Out of scope (do NOT do as part of this plan)

- Retroactively reclassifying existing prefill rows (spec explicitly skips this).
- Adding a DB CHECK constraint enforcing mutual exclusivity (spec: defensive at app level only).
- Adding a "Personalised from your documents" badge or icon to the info-box (spec: seamless).
- Auto-opening the info-box when a hint exists (user chose "stays collapsed").
- Writing React component tests for `QuestionExplanationInline` (project has no React testing infra; Task 10 covers it manually).
