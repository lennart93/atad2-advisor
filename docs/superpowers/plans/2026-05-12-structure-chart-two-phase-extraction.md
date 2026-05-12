# Two-phase async structure-chart extraction — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-12-structure-chart-two-phase-extraction-design.md](../specs/2026-05-12-structure-chart-two-phase-extraction-design.md)

**Goal:** Split `extract-structure` into Phase A (docs-only, fires at upload) and Phase B (refine + transactions, fires at Q&A complete) so users reach `draft_ready` in ≤ 90s instead of >5 min, with the user's Q&A (answer + explanation) as authoritative source.

**Architecture:** Existing `extract-structure` Edge Function takes a new `phase` parameter. `phase=docs_only` runs stages 1+2 from documents alone and ends at `phase_a_ready`. `phase=refine_and_transactions` (default) either refines existing Phase-A rows + adds transactions, or — if no Phase-A rows exist — falls back to running the initial extract from scratch. Both phases use `EdgeRuntime.waitUntil`. Frontend polls status as before; new statuses (`phase_a_ready`, `extracting:refining`) extend the existing loader.

**Tech Stack:** TypeScript / Deno Edge Functions (`@anthropic-ai/sdk@0.30.1` via `esm.sh`), React + Vite + Tailwind frontend, Supabase self-hosted on Azure VM (`adn-x-s-5`), vitest for unit tests.

**Prerequisite already met:** The hardcoded `workerTimeoutMs = 60_000` in `/root/supabase-docker/volumes/functions/main/index.ts` on the VM was bumped to `600_000` in a prior session. Verify with `docker exec supabase-edge-functions sh -c "grep workerTimeoutMs /home/deno/functions/main/index.ts"` before deploying — should show `10 * 60 * 1000`.

---

## File structure

**Edge Function (Deno, runs on VM):**
- `supabase/functions/extract-structure/index.ts` — modify (phase routing, loadQaAnswers extended, refine pipeline)
- `supabase/functions/extract-structure/formatters.ts` — **NEW** (pure functions: `formatQaBlock`, `qaPrimacyHeader`)
- `supabase/functions/extract-structure/prompts/stage1-entities.ts` — **DELETE** (replaced by initial/refine pair)
- `supabase/functions/extract-structure/prompts/stage1-initial.ts` — **NEW** (renamed from stage1-entities.ts, unchanged content)
- `supabase/functions/extract-structure/prompts/stage1-refine.ts` — **NEW** (Q&A-primary refine prompt)
- `supabase/functions/extract-structure/prompts/stage2-ownership.ts` — **DELETE** (replaced by initial/refine pair)
- `supabase/functions/extract-structure/prompts/stage2-initial.ts` — **NEW** (renamed from stage2-ownership.ts, unchanged content)
- `supabase/functions/extract-structure/prompts/stage2-refine.ts` — **NEW** (Q&A-primary refine prompt)
- `supabase/functions/extract-structure/prompts/stage3-transactions.ts` — modify (prepend `qaPrimacyHeader`)

**Frontend types & polling:**
- `src/lib/structure/types.ts` — modify (extend `ChartStatus` enum)
- `src/lib/structure/extraction.ts` — modify (`startExtraction` accepts optional `phase`; `TERMINAL` adds `phase_a_ready`)
- `src/lib/structure/__tests__/extract-schemas.test.ts` — modify (add tests for `formatQaBlock` and for `qaPrimacyHeader` being present in stage3 prompt)

**Frontend UI:**
- `src/components/structure/AtlasLoader.tsx` — modify (`stageOf` handles new statuses)
- `src/components/structure/AtlasLoader.test.tsx` — **NEW** (vitest test for `stageOf` mapper — extract `stageOf` to allow import)
- `src/components/structure/StructureChartStep.tsx` — modify (no auto-extract on mount; "Generate transactions" CTA when `phase_a_ready`)
- `src/hooks/usePrefill.ts` — modify (`useStartAnalyze` fires Phase A in parallel with prefill swarm)
- `src/pages/Assessment.tsx` — modify (the existing `startExtraction(sessionId)` at line 719 passes `phase: 'refine_and_transactions'` explicitly — default already correct, but explicit makes intent clear)

No DB migration needed (`atad2_structure_charts.status` is free-text `TEXT NOT NULL`, no CHECK constraint).

---

## Task 1 — Extend `ChartStatus` enum and polling terminal set

**Files:**
- Modify: `src/lib/structure/types.ts`
- Modify: `src/lib/structure/extraction.ts`

- [ ] **Step 1.1: Edit `src/lib/structure/types.ts`**

Replace the existing `ChartStatus` union (around line 27-30):

```ts
export type ChartStatus =
  | 'extracting:stage1'
  | 'extracting:stage2'
  | 'extracting:refining'
  | 'extracting:stage3'
  | 'phase_a_ready'
  | 'draft_ready'
  | 'extraction_failed'
  | 'user_edited'
  | 'finalized';
```

- [ ] **Step 1.2: Edit `src/lib/structure/extraction.ts`**

Update the `TERMINAL` constant (around line 26) to include `phase_a_ready` so direct-URL navigation during Phase A doesn't poll forever:

```ts
const TERMINAL: ReadonlyArray<ChartStatus> = ['draft_ready', 'extraction_failed', 'phase_a_ready'];
```

Update the `startExtraction` function signature to accept an optional phase:

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
  if (!r.ok) throw new Error(`Extraction failed: ${r.status} ${await r.text()}`);
  return r.json();
}
```

- [ ] **Step 1.3: Run type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If `AtlasLoader.tsx` fails on a switch over `ChartStatus`, that's expected and gets fixed in Task 5 — note the error and move on.

- [ ] **Step 1.4: Commit**

```bash
git add src/lib/structure/types.ts src/lib/structure/extraction.ts
git commit -m "feat(structure): extend ChartStatus with phase_a_ready and extracting:refining"
```

---

## Task 2 — Create new prompt files (split initial/refine, add Q&A-primary header)

**Files:**
- Create: `supabase/functions/extract-structure/formatters.ts`
- Create: `supabase/functions/extract-structure/prompts/stage1-initial.ts`
- Create: `supabase/functions/extract-structure/prompts/stage1-refine.ts`
- Create: `supabase/functions/extract-structure/prompts/stage2-initial.ts`
- Create: `supabase/functions/extract-structure/prompts/stage2-refine.ts`
- Modify: `supabase/functions/extract-structure/prompts/stage3-transactions.ts`
- Delete: `supabase/functions/extract-structure/prompts/stage1-entities.ts`
- Delete: `supabase/functions/extract-structure/prompts/stage2-ownership.ts`

- [ ] **Step 2.1: Create `supabase/functions/extract-structure/formatters.ts`**

Pure helpers — no Deno-specific imports — so vitest can cross-import them:

```ts
// Pure, dependency-free helpers usable from both Deno (Edge Function) and
// Node (vitest cross-import). Do NOT add Deno- or Supabase-specific imports
// here.

export interface QaAnswerRow {
  question_id: string;
  question_text: string;
  answer: string;
  explanation: string | null;
}

/**
 * Format Q&A answers as the multi-line block embedded in the prompt
 * <qa_answers> section. The explanation line is omitted when blank or null.
 */
export function formatQaBlock(rows: QaAnswerRow[]): string {
  return rows
    .map((r) => {
      const exp = (r.explanation ?? '').trim();
      const expLine = exp ? `\n  Explanation: ${exp}` : '';
      return `Q ${r.question_id} (${r.question_text})\n  Answer: ${r.answer}${expLine}`;
    })
    .join('\n\n');
}

/**
 * Prepended to every Phase-B prompt. Tells Claude to treat the Q&A as
 * authoritative and never re-classify mismatches against the user's yes/no.
 */
export const QA_PRIMACY_HEADER = `\
The <qa_answers> block below is the user's authoritative testimony about their corporate structure. Treat every Q&A answer and explanation as ground truth. The <documents> block is background — use it only to fill factual gaps (legal names, ISO codes, amounts) the Q&A does not specify. Where Q&A and documents conflict, the Q&A wins. Never re-classify an ATAD2 mismatch contrary to the user's yes/no answer.

`;
```

- [ ] **Step 2.2: Create `supabase/functions/extract-structure/prompts/stage1-initial.ts`**

Copy the entire existing content of `prompts/stage1-entities.ts` into this new file. Path: `supabase/functions/extract-structure/prompts/stage1-initial.ts`. The body opens with:

```ts
export default `You are a Dutch tax-law expert assisting in the preparation of an ATAD2 memorandum.

From the source documents below, extract every legally or fiscally relevant entity, branch, vaste inrichting (VI/PE), individual UBO, and trust / foundation / STAK that is mentioned. Only include entities that are part of, or transact with, the taxpayer's group as relevant for ATAD2.
...
```

Only difference vs the deleted `stage1-entities.ts`: replace the phrase "From the source documents and Q&A answers below" with "From the source documents below" (this prompt runs at Phase A before Q&A exists). Keep all other content (the schema, the `{{TAXPAYER_NAME}}` placeholder, the entity-type taxonomy) verbatim.

- [ ] **Step 2.3: Create `supabase/functions/extract-structure/prompts/stage1-refine.ts`**

```ts
// Stage 1 — refine pass. Takes the entities extracted from documents alone
// (Phase A) and refines them against the user's Q&A. Q&A is authoritative.
import { QA_PRIMACY_HEADER } from "../formatters.ts";

export default QA_PRIMACY_HEADER + `You are continuing a Dutch ATAD2 memo extraction. A first pass over the uploaded documents produced the following entity list:

{{EXISTING_ENTITIES_JSON}}

Refine this list using the user's Q&A answers as the authoritative source. You may:
- Add entities the user mentions in any explanation that are not yet in the list (e.g. "Our German sister company is Vogel GmbH").
- Remove entities the Q&A contradicts or that are clearly not part of the taxpayer's relevant ATAD2 scope.
- Rename entities to match the legal name the user uses.
- Re-classify \`entity_type\`, \`jurisdiction_iso\`, \`legal_form\`, or \`is_taxpayer\` flags based on what the user has said.

Preserve the input \`temp_id\` for any entity you keep. New entities get fresh \`temp_id\` values continuing the \`ent_<n>\` sequence (do not reuse a removed entity's id).

Output **strict JSON** matching this schema, identical to the first pass — full final entity list, not a delta. Output ONLY the JSON object:

{
  "entities": [
    { "temp_id": "ent_1", "name": "...", "legal_form": "...", "jurisdiction_iso": "NL", "entity_type": "corporation", "is_taxpayer": true }
  ]
}

The taxpayer is **{{TAXPAYER_NAME}}**. At most one entity has \`is_taxpayer: true\`.

Reminders on entity_type (Dutch tax perspective):
- \`corporation\` — opaque to NL (B.V., GmbH, Inc., Ltd.).
- \`partnership\` — transparent to NL with no classification mismatch (e.g. VOF).
- \`dh_entity\` — Disregarded / Hybrid Entity: NL classification differs from local.
- \`hybrid_partnership\` — partnership with a classification mismatch.
- \`reverse_hybrid\` — NL transparent, foreign opaque.
- \`individual\` — natural person / UBO.
- \`trust_or_non_entity\` — trust, foundation, STAK, VI, branch / PE.
`;
```

- [ ] **Step 2.4: Create `supabase/functions/extract-structure/prompts/stage2-initial.ts`**

Copy `prompts/stage2-ownership.ts` content into this new file. Replace "From the source documents and Q&A answers (above in the system message)" with "From the source documents (above in the system message)". Keep everything else verbatim.

- [ ] **Step 2.5: Create `supabase/functions/extract-structure/prompts/stage2-refine.ts`**

```ts
import { QA_PRIMACY_HEADER } from "../formatters.ts";

export default QA_PRIMACY_HEADER + `Stage 1 (refined) has produced this entity list:

{{ENTITIES_JSON}}

A previous pass over the documents produced these ownership edges:

{{EXISTING_OWNERSHIP_JSON}}

Refine the ownership edges using the user's Q&A answers as the authoritative source. You may add, remove, or correct percentages. Use the \`temp_id\` values from the entity list above — do not introduce new entities.

Output strict JSON matching the original schema (full final edge list, not a delta):

{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}

\`from_temp_id\` is the parent (owner). \`to_temp_id\` is the subsidiary. Percentages 0-100. If only voting rights (no economic ownership), set \`voting_only: true\`. If you cannot determine ownership for some pair, omit that edge — do not guess.
`;
```

- [ ] **Step 2.6: Modify `supabase/functions/extract-structure/prompts/stage3-transactions.ts`**

Prepend the import + `QA_PRIMACY_HEADER` so the header sits in front of the existing prompt:

```ts
import { QA_PRIMACY_HEADER } from "../formatters.ts";

export default QA_PRIMACY_HEADER + `Continue the ATAD2 memo extraction. Stage 1 entities and stage 2 ownership relationships are below:

ENTITIES:
{{ENTITIES_JSON}}

OWNERSHIP:
{{OWNERSHIP_JSON}}

From the user's Q&A answers and the source documents, extract every payment / loan / royalty / dividend / service-fee / management-fee flow between the entities above. For each transaction, classify whether it represents an ATAD2 hybrid mismatch (D/NI = deduction without inclusion, or DD = double deduction) **from a Dutch tax perspective**, and cite the relevant ATAD2 article (e.g. \`12aa\`, \`12ab\`, ...).

Output ONLY this JSON, no prose:

{
  "transactions": [
    {
      "from_temp_id": "ent_1",
      "to_temp_id": "ent_2",
      "transaction_type": "loan",
      "amount_eur": 5000000,
      "label": "Loan facility",
      "is_mismatch": true,
      "mismatch_classification": "D/NI",
      "mismatch_atad2_article": "12aa"
    }
  ]
}

Direction (\`from\`→\`to\`) follows the **money flow** (payer → receiver). Convert all amounts to EUR; round to whole euros. Set \`amount_eur: null\` if not stated.

If a flow has no apparent ATAD2 implication, set \`is_mismatch: false\` and omit the mismatch fields. Do not over-classify — if it's clearly an arm's-length payment with no classification mismatch, it is not an ATAD2 mismatch. **Always defer to the user's yes/no answer on any hybrid-mismatch question — if Q&A says no D/NI for a flow, do not flag it.**
`;
```

- [ ] **Step 2.7: Delete the old prompt files**

```bash
git rm supabase/functions/extract-structure/prompts/stage1-entities.ts
git rm supabase/functions/extract-structure/prompts/stage2-ownership.ts
```

- [ ] **Step 2.8: Commit**

```bash
git add supabase/functions/extract-structure/formatters.ts supabase/functions/extract-structure/prompts/
git commit -m "feat(extract-structure): split prompts into initial/refine + Q&A-primary header"
```

---

## Task 3 — Write failing tests for `formatQaBlock` and stage3 header

**Files:**
- Modify: `src/lib/structure/__tests__/extract-schemas.test.ts`

- [ ] **Step 3.1: Append tests to `src/lib/structure/__tests__/extract-schemas.test.ts`**

Append at the end of the file (after the last existing `describe` block):

```ts
import { formatQaBlock, QA_PRIMACY_HEADER, type QaAnswerRow } from '../../../../supabase/functions/extract-structure/formatters';
import stage3Prompt from '../../../../supabase/functions/extract-structure/prompts/stage3-transactions';

describe('formatQaBlock', () => {
  it('includes explanation on its own line when present', () => {
    const rows: QaAnswerRow[] = [
      { question_id: '1', question_text: 'Resident?', answer: 'Yes', explanation: 'Incorporated in Amsterdam.' },
    ];
    const out = formatQaBlock(rows);
    expect(out).toContain('Q 1 (Resident?)');
    expect(out).toContain('Answer: Yes');
    expect(out).toContain('Explanation: Incorporated in Amsterdam.');
  });

  it('omits explanation line when explanation is blank or null', () => {
    const rows: QaAnswerRow[] = [
      { question_id: '2', question_text: 'PE?',       answer: 'No',  explanation: '' },
      { question_id: '3', question_text: 'Loans?',    answer: 'Yes', explanation: null },
      { question_id: '4', question_text: 'Royalties?', answer: 'Unknown', explanation: '   ' },
    ];
    const out = formatQaBlock(rows);
    expect(out).not.toContain('Explanation:');
    expect(out.split('\n\n').length).toBe(3);
  });

  it('returns empty string for zero rows', () => {
    expect(formatQaBlock([])).toBe('');
  });
});

describe('stage3 prompt', () => {
  it('begins with the Q&A primacy header', () => {
    expect(stage3Prompt.startsWith(QA_PRIMACY_HEADER)).toBe(true);
  });
});
```

- [ ] **Step 3.2: Run tests — expect new tests to fail**

```bash
npm test -- --run extract-schemas
```

Expected: the 3 `formatQaBlock` tests and the `stage3 prompt` test fail because the imports resolve (Task 2 created the files) but the assertions might still pass — actually since Task 2 also created the formatters and updated stage3, the tests should PASS here. If you reach this point and the tests pass on first run, that's the green-after-impl state of TDD; commit and move on. If they fail, fix the formatter or prompt content before committing.

- [ ] **Step 3.3: Run full test suite**

```bash
npm test -- --run
```

Expected: all existing 46 tests still pass + 4 new tests pass = 50 tests pass.

- [ ] **Step 3.4: Commit**

```bash
git add src/lib/structure/__tests__/extract-schemas.test.ts
git commit -m "test(extract-structure): cover formatQaBlock and Q&A-primary header"
```

---

## Task 4 — Extend `loadQaAnswersText` to include `explanation`

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 4.1: Edit `loadQaAnswersText` in `supabase/functions/extract-structure/index.ts`**

Replace the existing `loadQaAnswersText` function (currently at the bottom of the file, around line 371-382) with this:

```ts
async function loadQaAnswersText(client: SupabaseClient, sessionId: string): Promise<string> {
  // Loads question_id, question_text, answer AND explanation. The explanation
  // free-text is where users typically write entity names, transaction
  // details, and classification rationale — without this column we lose
  // most of the user's actual testimony.
  const { data, error } = await client
    .from("atad2_answers")
    .select("question_id, question_text, answer, explanation")
    .eq("session_id", sessionId);
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    question_id: r.question_id as string,
    question_text: r.question_text as string,
    answer: r.answer as string,
    explanation: (r.explanation ?? null) as string | null,
  }));
  return formatQaBlock(rows);
}
```

Add the import at the top of `index.ts` (in the existing import block near line 1-16):

```ts
import { formatQaBlock } from "./formatters.ts";
```

- [ ] **Step 4.2: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): load Q&A explanation column for richer LLM input"
```

---

## Task 5 — Add `phase` request parameter + routing skeleton in `extract-structure`

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 5.1: Update the request interface and entry handler**

In `supabase/functions/extract-structure/index.ts`, replace the `ExtractStructureRequest` interface (around line 25-27) and the request body parsing (around line 44-52) with:

```ts
type Phase = "docs_only" | "refine_and_transactions";

interface ExtractStructureRequest {
  session_id: string;
  phase?: Phase;
}
```

Inside the `serve(async (req) => { ... })` handler, after the JSON body parse and `session_id` validation, add phase parsing:

```ts
const phase: Phase = body.phase === "docs_only" ? "docs_only" : "refine_and_transactions";
```

Replace the existing `runExtractionPipeline(serviceClient, chart.id, body.session_id);` call (around line 82) with:

```ts
const work = runExtractionPipeline(serviceClient, chart.id, body.session_id, phase);
```

Update the response body to echo the phase:

```ts
return json({ ok: true, chart_id: chart.id, status: phase === "docs_only" ? "extracting:stage1" : "extracting:stage1", phase }, 200);
```

(Both branches set `extracting:stage1` initially — the Phase B refine path will update to `extracting:refining` after entering its branch.)

- [ ] **Step 5.2: Update `runExtractionPipeline` signature**

Replace the function declaration (around line 119-123) with:

```ts
async function runExtractionPipeline(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
  phase: Phase,
): Promise<void> {
```

Inside the function, immediately after the existing `try {` and before the `docsBlock`/`qaText` loaders, branch on phase. Replace the entire body of the existing `try { ... }` block (everything from "Build the cached system block once" through the final `draft_ready` update, lines ~125-249) with this dispatcher — the actual stage code moves into the two helper functions added in Tasks 6 and 7:

```ts
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
```

The Phase-A and Phase-B implementations come in the next two tasks. Leave stub declarations at the bottom of the file for now so the file compiles:

```ts
async function runPhaseA(_client: SupabaseClient, _chartId: string, _sessionId: string): Promise<void> {
  throw new Error("runPhaseA not yet implemented");
}

async function runPhaseB(_client: SupabaseClient, _chartId: string, _sessionId: string): Promise<void> {
  throw new Error("runPhaseB not yet implemented");
}
```

- [ ] **Step 5.3: Update prompt imports**

Replace the existing imports near line 13-15:

```ts
import stage1Prompt from "./prompts/stage1-entities.ts";
import stage2Prompt from "./prompts/stage2-ownership.ts";
import stage3Prompt from "./prompts/stage3-transactions.ts";
```

with:

```ts
import stage1InitialPrompt from "./prompts/stage1-initial.ts";
import stage1RefinePrompt from "./prompts/stage1-refine.ts";
import stage2InitialPrompt from "./prompts/stage2-initial.ts";
import stage2RefinePrompt from "./prompts/stage2-refine.ts";
import stage3Prompt from "./prompts/stage3-transactions.ts";
```

Also delete the existing `runStage1`, `runStage2`, `runStage3` helper functions at the bottom of the file (they reference the now-deleted `stage1Prompt` / `stage2Prompt` and would fail to compile). Task 6 introduces their replacements (`runStage1Initial`, `runStage1Refine`, `runStage2Initial`, `runStage2Refine`, `runStage3`). Until Task 6 lands, the file will compile thanks to the stub `runPhaseA`/`runPhaseB` even though no callers reference any stage runner — there are intentionally no callers in the dispatcher yet.

- [ ] **Step 5.4: Verify the file parses (frontend type-check covers the cross-imports)**

```bash
npx tsc --noEmit
```

Expected: 0 errors. The stage1/stage2 prompt-module references in any extract-schemas.test.ts cross-imports may also need updating — confirm tests still pass:

```bash
npm test -- --run
```

Expected: 50 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): add phase request param + pipeline dispatcher skeleton"
```

---

## Task 6 — Implement `runPhaseA` (docs-only path)

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 6.1: Implement the Phase-A pipeline**

Replace the `runPhaseA` stub with a full implementation. Place this at the bottom of `index.ts`, after the existing helpers (`runStage1`, `runStage2`, `callWithRetry`, etc.). Also re-implement `runStage1` and `runStage2` to use the new initial prompts. Replace the three `runStageN` helpers at the bottom of the file with:

```ts
async function runStage1Initial(cachedSystem: string, taxpayerName: string): Promise<Stage1OutputT> {
  const user = stage1InitialPrompt.replace("{{TAXPAYER_NAME}}", taxpayerName);
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage1Refine(
  cachedSystem: string,
  taxpayerName: string,
  existingEntities: Stage1OutputT["entities"],
): Promise<Stage1OutputT> {
  const user = stage1RefinePrompt
    .replace("{{TAXPAYER_NAME}}", taxpayerName)
    .replace("{{EXISTING_ENTITIES_JSON}}", JSON.stringify(existingEntities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage2Initial(cachedSystem: string, entities: unknown): Promise<Stage2OutputT> {
  const user = stage2InitialPrompt.replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage2Refine(
  cachedSystem: string,
  entities: unknown,
  existingOwnership: Stage2OutputT["ownership_edges"],
): Promise<Stage2OutputT> {
  const user = stage2RefinePrompt
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{EXISTING_OWNERSHIP_JSON}}", JSON.stringify(existingOwnership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage3(cachedSystem: string, entities: unknown, ownership: unknown) {
  const user = stage3Prompt
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{OWNERSHIP_JSON}}", JSON.stringify(ownership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage3Output);
}
```

Now replace the `runPhaseA` stub with the working implementation:

```ts
async function runPhaseA(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  // Phase A uses documents only — Q&A may not yet exist.
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
  const cachedSystem = `<documents>\n${docsBlock}\n</documents>`;

  // Idempotency: clear any prior ai_extracted rows for this chart so a
  // re-trigger (e.g. user re-uploaded docs) doesn't accumulate stale entities.
  await clearAiExtracted(serviceClient, chartId);

  // ----- Stage 1: entities -----
  let stage1: Stage1OutputT;
  try {
    stage1 = await runStage1Initial(cachedSystem, taxpayerName);
  } catch (err) {
    console.error(JSON.stringify({
      level: "error", event: "phaseA_stage1_failed",
      message: String(err), chart_id: chartId,
    }));
    await setStatus(serviceClient, chartId, "extraction_failed", {
      warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
    });
    return;
  }

  const tempIdToUuid = new Map<string, string>();
  for (const e of stage1.entities) {
    const { data, error } = await serviceClient
      .from("atad2_structure_entities")
      .insert({
        chart_id: chartId,
        name: e.name,
        legal_form: e.legal_form ?? null,
        jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
        entity_type: e.entity_type,
        is_taxpayer: e.is_taxpayer,
        source: "ai_extracted",
      })
      .select("id")
      .single();
    if (error) throw error;
    tempIdToUuid.set(e.temp_id, data.id);
  }

  // ----- Stage 2: ownership (graceful) -----
  await setStatus(serviceClient, chartId, "extracting:stage2");
  try {
    const stage2 = await runStage2Initial(cachedSystem, stage1.entities);
    for (const oe of stage2.ownership_edges) {
      const fromId = tempIdToUuid.get(oe.from_temp_id);
      const toId = tempIdToUuid.get(oe.to_temp_id);
      if (!fromId || !toId) continue;
      const { error: insErr } = await serviceClient
        .from("atad2_structure_edges")
        .insert({
          chart_id: chartId,
          from_entity_id: fromId,
          to_entity_id: toId,
          kind: "ownership",
          ownership_pct: oe.ownership_pct,
          ownership_voting_only: oe.voting_only ?? null,
          source: "ai_extracted",
        });
      if (insErr) throw insErr;
    }
  } catch (err) {
    console.warn(JSON.stringify({
      level: "warn", event: "phaseA_stage2_failed",
      message: String(err), chart_id: chartId,
    }));
    await appendWarning(serviceClient, chartId, {
      stage: 2, message: String(err).slice(0, 500),
    });
  }

  await setStatus(serviceClient, chartId, "phase_a_ready");
}

async function clearAiExtracted(client: SupabaseClient, chartId: string): Promise<void> {
  // Edges first to satisfy FK from edges -> entities.
  const { error: edgesDelErr } = await client
    .from("atad2_structure_edges")
    .delete()
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted");
  if (edgesDelErr) throw edgesDelErr;
  const { error: entsDelErr } = await client
    .from("atad2_structure_entities")
    .delete()
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted");
  if (entsDelErr) throw entsDelErr;
}
```

The existing idempotency clear inside the request handler (lines 60-75) is now redundant — remove it from the handler and rely on `runPhaseA` / `runPhaseB` calling `clearAiExtracted` themselves. Specifically delete this block from the `serve(...)` handler:

```ts
    // Idempotency: clear ai_extracted rows (preserves user_added/user_edited).
    // Edges first to satisfy FK from edges -> entities.
    {
      const { error: edgesDelErr } = await serviceClient
        .from("atad2_structure_edges")
        .delete()
        .eq("chart_id", chart.id)
        .eq("source", "ai_extracted");
      if (edgesDelErr) throw edgesDelErr;
      const { error: entsDelErr } = await serviceClient
        .from("atad2_structure_entities")
        .delete()
        .eq("chart_id", chart.id)
        .eq("source", "ai_extracted");
      if (entsDelErr) throw entsDelErr;
    }
```

- [ ] **Step 6.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6.3: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): implement Phase A docs-only pipeline"
```

---

## Task 7 — Implement `runPhaseB` (refine + transactions, with fallback)

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 7.1: Implement Phase B**

Replace the `runPhaseB` stub with:

```ts
async function runPhaseB(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const qaText = await loadQaAnswersText(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
  const cachedSystem =
    `<documents>\n${docsBlock}\n</documents>\n` +
    `<qa_answers>\n${qaText}\n</qa_answers>`;

  // Decide: refine path (Phase A wrote AI rows we can build on) or
  // initial-fallback (no AI rows, run from scratch).
  const existingAi = await loadExistingAiRows(serviceClient, chartId);
  const hasExisting = existingAi.entities.length > 0;

  // ----- Stage 1 -----
  let stage1: Stage1OutputT;
  let tempIdToUuid: Map<string, string>;
  if (hasExisting) {
    // Refine path. The `existingAi.entities` already carries assigned temp_ids
    // (ent_1..ent_N) that map back to DB UUIDs via existingAi.tempIdToUuid.
    await setStatus(serviceClient, chartId, "extracting:refining");
    try {
      stage1 = await runStage1Refine(cachedSystem, taxpayerName, existingAi.entities);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error", event: "phaseB_stage1_refine_failed",
        message: String(err), chart_id: chartId,
      }));
      await setStatus(serviceClient, chartId, "extraction_failed", {
        warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
      });
      return;
    }
    tempIdToUuid = await applyEntityDiff(serviceClient, chartId, existingAi.tempIdToUuid, stage1.entities);
  } else {
    // Initial-fallback path.
    await setStatus(serviceClient, chartId, "extracting:stage1");
    await clearAiExtracted(serviceClient, chartId);
    try {
      stage1 = await runStage1Initial(cachedSystem, taxpayerName);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error", event: "phaseB_stage1_initial_failed",
        message: String(err), chart_id: chartId,
      }));
      await setStatus(serviceClient, chartId, "extraction_failed", {
        warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
      });
      return;
    }
    tempIdToUuid = new Map<string, string>();
    for (const e of stage1.entities) {
      const { data, error } = await serviceClient
        .from("atad2_structure_entities")
        .insert({
          chart_id: chartId,
          name: e.name,
          legal_form: e.legal_form ?? null,
          jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
          source: "ai_extracted",
        })
        .select("id")
        .single();
      if (error) throw error;
      tempIdToUuid.set(e.temp_id, data.id);
    }
  }

  // ----- Stage 2 -----
  let stage2: Stage2OutputT = { ownership_edges: [] };
  if (hasExisting) {
    try {
      stage2 = await runStage2Refine(cachedSystem, stage1.entities, existingAi.ownershipEdges);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "phaseB_stage2_refine_failed",
        message: String(err), chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 2, message: String(err).slice(0, 500),
      });
    }
  } else {
    await setStatus(serviceClient, chartId, "extracting:stage2");
    try {
      stage2 = await runStage2Initial(cachedSystem, stage1.entities);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "phaseB_stage2_initial_failed",
        message: String(err), chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 2, message: String(err).slice(0, 500),
      });
    }
  }

  // Persist ownership: delete existing ai_extracted ownership edges, insert fresh.
  await serviceClient
    .from("atad2_structure_edges")
    .delete()
    .eq("chart_id", chartId)
    .eq("kind", "ownership")
    .eq("source", "ai_extracted");
  for (const oe of stage2.ownership_edges) {
    const fromId = tempIdToUuid.get(oe.from_temp_id);
    const toId = tempIdToUuid.get(oe.to_temp_id);
    if (!fromId || !toId) continue;
    const { error: insErr } = await serviceClient
      .from("atad2_structure_edges")
      .insert({
        chart_id: chartId,
        from_entity_id: fromId,
        to_entity_id: toId,
        kind: "ownership",
        ownership_pct: oe.ownership_pct,
        ownership_voting_only: oe.voting_only ?? null,
        source: "ai_extracted",
      });
    if (insErr) throw insErr;
  }

  // ----- Stage 3: transactions (graceful) -----
  await setStatus(serviceClient, chartId, "extracting:stage3");
  try {
    const stage3 = await runStage3(cachedSystem, stage1.entities, stage2.ownership_edges);
    for (const t of stage3.transactions) {
      const fromId = tempIdToUuid.get(t.from_temp_id);
      const toId = tempIdToUuid.get(t.to_temp_id);
      if (!fromId || !toId) continue;
      const { error: insErr } = await serviceClient
        .from("atad2_structure_edges")
        .insert({
          chart_id: chartId,
          from_entity_id: fromId,
          to_entity_id: toId,
          kind: "transaction",
          transaction_type: normalizeTransactionType(t.transaction_type),
          amount_eur: t.amount_eur ?? null,
          label: t.label ?? null,
          is_mismatch: t.is_mismatch,
          mismatch_classification: t.mismatch_classification ?? null,
          mismatch_atad2_article: t.mismatch_atad2_article ?? null,
          source: "ai_extracted",
        });
      if (insErr) throw insErr;
    }
  } catch (err) {
    console.warn(JSON.stringify({
      level: "warn", event: "phaseB_stage3_failed",
      message: String(err), chart_id: chartId,
    }));
    await appendWarning(serviceClient, chartId, {
      stage: 3, message: String(err).slice(0, 500),
    });
  }

  const { error: finalUpdateErr } = await serviceClient
    .from("atad2_structure_charts")
    .update({
      status: "draft_ready",
      draft_extracted_at: new Date().toISOString(),
    })
    .eq("id", chartId);
  if (finalUpdateErr) throw finalUpdateErr;
}

interface ExistingAi {
  entities: Stage1OutputT["entities"];
  ownershipEdges: Stage2OutputT["ownership_edges"];
  tempIdToUuid: Map<string, string>;
}

async function loadExistingAiRows(client: SupabaseClient, chartId: string): Promise<ExistingAi> {
  const { data: entityRows, error: entErr } = await client
    .from("atad2_structure_entities")
    .select("id, name, legal_form, jurisdiction_iso, entity_type, is_taxpayer")
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted")
    .order("name", { ascending: true });
  if (entErr) throw entErr;

  const entities: Stage1OutputT["entities"] = [];
  const tempIdToUuid = new Map<string, string>();
  const uuidToTempId = new Map<string, string>();
  let n = 1;
  for (const r of entityRows ?? []) {
    const temp_id = `ent_${n++}`;
    tempIdToUuid.set(temp_id, r.id as string);
    uuidToTempId.set(r.id as string, temp_id);
    entities.push({
      temp_id,
      name: r.name as string,
      legal_form: (r.legal_form ?? null) as string | null,
      jurisdiction_iso: r.jurisdiction_iso as string,
      entity_type: r.entity_type as Stage1OutputT["entities"][number]["entity_type"],
      is_taxpayer: !!r.is_taxpayer,
    });
  }

  const { data: edgeRows, error: edgeErr } = await client
    .from("atad2_structure_edges")
    .select("from_entity_id, to_entity_id, ownership_pct, ownership_voting_only")
    .eq("chart_id", chartId)
    .eq("kind", "ownership")
    .eq("source", "ai_extracted");
  if (edgeErr) throw edgeErr;

  const ownershipEdges: Stage2OutputT["ownership_edges"] = [];
  for (const e of edgeRows ?? []) {
    const ft = uuidToTempId.get(e.from_entity_id as string);
    const tt = uuidToTempId.get(e.to_entity_id as string);
    if (!ft || !tt) continue;
    ownershipEdges.push({
      from_temp_id: ft,
      to_temp_id: tt,
      ownership_pct: (e.ownership_pct ?? 0) as number,
      voting_only: (e.ownership_voting_only ?? undefined) as boolean | undefined,
    });
  }

  return { entities, ownershipEdges, tempIdToUuid };
}

async function applyEntityDiff(
  client: SupabaseClient,
  chartId: string,
  existingTempIdToUuid: Map<string, string>,
  newEntities: Stage1OutputT["entities"],
): Promise<Map<string, string>> {
  // Strategy: any temp_id in the new list that also exists in existingTempIdToUuid
  // is an UPDATE on that UUID. New temp_ids are INSERTs. Existing temp_ids
  // not present in the new list are DELETEs.
  const newTempIds = new Set(newEntities.map((e) => e.temp_id));
  const outMap = new Map<string, string>();

  // Deletes first (FK from edges → entities is satisfied because we delete
  // ai_extracted ownership edges before re-inserting in the caller).
  const toDelete: string[] = [];
  for (const [tempId, uuid] of existingTempIdToUuid) {
    if (!newTempIds.has(tempId)) toDelete.push(uuid);
  }
  if (toDelete.length > 0) {
    // Delete edges first to avoid FK violation when an entity disappears.
    const { error: delEdgesErr } = await client
      .from("atad2_structure_edges")
      .delete()
      .eq("chart_id", chartId)
      .eq("source", "ai_extracted")
      .or(toDelete.map((id) => `from_entity_id.eq.${id},to_entity_id.eq.${id}`).join(","));
    if (delEdgesErr) throw delEdgesErr;
    const { error: delEntsErr } = await client
      .from("atad2_structure_entities")
      .delete()
      .in("id", toDelete);
    if (delEntsErr) throw delEntsErr;
  }

  // Updates + inserts.
  for (const e of newEntities) {
    const existingUuid = existingTempIdToUuid.get(e.temp_id);
    if (existingUuid) {
      const { error } = await client
        .from("atad2_structure_entities")
        .update({
          name: e.name,
          legal_form: e.legal_form ?? null,
          jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
        })
        .eq("id", existingUuid);
      if (error) throw error;
      outMap.set(e.temp_id, existingUuid);
    } else {
      const { data, error } = await client
        .from("atad2_structure_entities")
        .insert({
          chart_id: chartId,
          name: e.name,
          legal_form: e.legal_form ?? null,
          jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
          source: "ai_extracted",
        })
        .select("id")
        .single();
      if (error) throw error;
      outMap.set(e.temp_id, data.id as string);
    }
  }

  return outMap;
}
```

- [ ] **Step 7.2: Type-check + tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: 0 errors, 50 tests pass.

- [ ] **Step 7.3: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): implement Phase B refine path with diff-and-apply + initial fallback"
```

---

## Task 8 — Update `AtlasLoader.stageOf` for new statuses + extract for testing

**Files:**
- Modify: `src/components/structure/AtlasLoader.tsx`
- Create: `src/components/structure/__tests__/AtlasLoader.test.tsx` (actually a pure stageOf test — see below)

- [ ] **Step 8.1: Refactor `stageOf` out of `AtlasLoader.tsx` into a named export**

In `src/components/structure/AtlasLoader.tsx`, change the existing `function stageOf(...)` to an exported function and extend its branches. Replace lines 17-25 with:

```ts
type Stage = 0 | 1 | 2 | 3 | 4;

export function stageOf(status: ChartStatus | 'loading'): Stage {
  if (status === 'loading' || status === 'extracting:stage1') return 1;
  if (status === 'extracting:stage2') return 2;
  if (status === 'phase_a_ready') return 3; // entities + ownership done, transactions next
  if (status === 'extracting:refining') return 2; // refining entities/ownership
  if (status === 'extracting:stage3') return 3;
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 4;
  return 0; // unknown / extraction_failed
}
```

- [ ] **Step 8.2: Create test file `src/components/structure/__tests__/AtlasLoader.test.tsx`**

Path: `src/components/structure/__tests__/AtlasLoader.test.tsx`.

```tsx
import { describe, it, expect } from 'vitest';
import { stageOf } from '../AtlasLoader';

describe('stageOf', () => {
  it('maps loading to stage 1', () => {
    expect(stageOf('loading')).toBe(1);
  });

  it('maps extraction stages to their numbers', () => {
    expect(stageOf('extracting:stage1')).toBe(1);
    expect(stageOf('extracting:stage2')).toBe(2);
    expect(stageOf('extracting:stage3')).toBe(3);
  });

  it('maps phase_a_ready to stage 3 (waiting on transactions)', () => {
    expect(stageOf('phase_a_ready')).toBe(3);
  });

  it('maps extracting:refining to stage 2 (refining entities/ownership)', () => {
    expect(stageOf('extracting:refining')).toBe(2);
  });

  it('maps terminal states to stage 4', () => {
    expect(stageOf('draft_ready')).toBe(4);
    expect(stageOf('user_edited')).toBe(4);
    expect(stageOf('finalized')).toBe(4);
  });

  it('maps extraction_failed to 0', () => {
    expect(stageOf('extraction_failed')).toBe(0);
  });
});
```

- [ ] **Step 8.3: Run tests**

```bash
npm test -- --run AtlasLoader
```

Expected: all 7 stageOf tests pass.

```bash
npm test -- --run
```

Expected: 57 tests pass total.

- [ ] **Step 8.4: Commit**

```bash
git add src/components/structure/AtlasLoader.tsx src/components/structure/__tests__/AtlasLoader.test.tsx
git commit -m "feat(structure): map phase_a_ready and extracting:refining in AtlasLoader stageOf"
```

---

## Task 9 — Trigger Phase A from `useStartAnalyze` (browser-side)

**Files:**
- Modify: `src/hooks/usePrefill.ts`

- [ ] **Step 9.1: Add Phase A trigger inside `useStartAnalyze`**

In `src/hooks/usePrefill.ts`, after the `if (jobErr && !\`${jobErr.message}\`.toLowerCase().includes("duplicate")) { throw jobErr; }` line (around line 295) and BEFORE step 3 (`Load distinct questions`), insert:

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

The dynamic import keeps `usePrefill.ts` from acquiring a static dependency on `extraction.ts` if that module changes later.

- [ ] **Step 9.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9.3: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "feat(structure): fire Phase A in parallel with prefill swarm at upload-continue"
```

---

## Task 10 — Update `Assessment.tsx` Continue to pass explicit `phase`

**Files:**
- Modify: `src/pages/Assessment.tsx`

- [ ] **Step 10.1: Make the existing pre-fetch call explicit**

In `src/pages/Assessment.tsx`, find the existing pre-fetch (around line 717-721):

```ts
      // Pre-fetch the structure-chart extraction so the user doesn't wait on Step 5.
      // Fire-and-forget; if this fails, Step 5 will start its own extraction as fallback.
      startExtraction(sessionId).catch((err) => {
        console.warn('[Assessment] Pre-fetch extraction failed; Step 5 will retry', err);
      });
```

Replace with the same call but pass the phase explicitly so a future reader understands intent:

```ts
      // Pre-fetch Phase B of the structure-chart extraction (refine + transactions)
      // so the user doesn't wait on Step 5. Phase A (entities + ownership from docs
      // alone) already ran at upload time via useStartAnalyze. Fire-and-forget.
      startExtraction(sessionId, 'refine_and_transactions').catch((err) => {
        console.warn('[Assessment] Phase B pre-fetch failed; Step 5 will retry', err);
      });
```

- [ ] **Step 10.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 10.3: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "chore(structure): pass explicit phase=refine_and_transactions on Q&A continue"
```

---

## Task 11 — Update `StructureChartStep` mount logic for `phase_a_ready`

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 11.1: Read the current mount effect**

The mount `useEffect` (around line 186-229 of `StructureChartStep.tsx`) currently:
1. Calls `loadChart(sessionId)`.
2. If chart exists AND `status.startsWith('extracting:')`, polls until terminal.
3. If chart doesn't exist, calls `startExtraction(sessionId)` and polls.

This is no longer correct: `startExtraction` is now async by Phase A trigger at upload time. If the user navigates to `/assessment/structure/<sessionId>` and no chart exists yet, that means Phase A is still running (or hasn't been triggered, edge case). The mount effect must not auto-fire its own extraction call.

- [ ] **Step 11.2: Update the mount effect**

Replace the existing mount `useEffect` (lines ~186-229) with:

```tsx
  useEffect(() => {
    let aborted = false;
    (async () => {
      const loaded = await loadChart(sessionId);
      if (loaded?.chart) {
        if (aborted) return;
        setChart(loaded.chart);
        setEntities(loaded.entities);
        setEdgesState(loaded.edges);
        setStatus(loaded.chart.status as ChartStatus);
        // Poll if extraction is mid-flight (any non-terminal status that isn't
        // phase_a_ready — phase_a_ready means Phase A finished and we're now
        // waiting for the user-driven Phase B trigger from Q&A).
        if (loaded.chart.status.startsWith('extracting:')) {
          await pollUntilTerminal(loaded.chart.id, async (s) => {
            if (aborted) return;
            setStatus(s);
            const refreshed = await loadChart(sessionId);
            if (refreshed && !aborted) {
              setChart(refreshed.chart);
              setEntities(refreshed.entities);
              setEdgesState(refreshed.edges);
            }
          });
        }
      } else {
        // No chart row yet. Phase A may still be priming. Show the loader and
        // wait — Phase B (triggered by the user's "Continue" from Q&A) will
        // create the chart row if Phase A never did.
        setStatus('extracting:stage1' as ChartStatus);
        let attempts = 0;
        while (!aborted && attempts < 30) {
          await new Promise((r) => setTimeout(r, 2000));
          attempts += 1;
          const polled = await loadChart(sessionId);
          if (polled?.chart) {
            setChart(polled.chart);
            setEntities(polled.entities);
            setEdgesState(polled.edges);
            setStatus(polled.chart.status as ChartStatus);
            if (polled.chart.status.startsWith('extracting:')) {
              await pollUntilTerminal(polled.chart.id, async (s) => {
                if (aborted) return;
                setStatus(s);
                const refreshed = await loadChart(sessionId);
                if (refreshed && !aborted) {
                  setChart(refreshed.chart);
                  setEntities(refreshed.entities);
                  setEdgesState(refreshed.edges);
                }
              });
            }
            return;
          }
        }
        // 60s passed and still no chart row — Phase A and Phase B both failed
        // to fire. Fall back: trigger Phase B ourselves so the user isn't stuck.
        try {
          await startExtraction(sessionId, 'refine_and_transactions');
          const refreshed = await loadChart(sessionId);
          if (refreshed) {
            setChart(refreshed.chart);
            setEntities(refreshed.entities);
            setEdgesState(refreshed.edges);
            setStatus(refreshed.chart.status as ChartStatus);
            await pollUntilTerminal(refreshed.chart.id, async (s) => {
              if (aborted) return;
              setStatus(s);
              const ref2 = await loadChart(sessionId);
              if (ref2 && !aborted) {
                setChart(ref2.chart);
                setEntities(ref2.entities);
                setEdgesState(ref2.edges);
              }
            });
          }
        } catch (err) {
          console.error('[StructureChartStep] Fallback Phase B start failed', err);
          setStatus('extraction_failed' as ChartStatus);
        }
      }
    })().catch((err) => {
      console.error(err);
      setStatus('extraction_failed' as ChartStatus);
    });
    return () => {
      aborted = true;
    };
  }, [sessionId]);
```

- [ ] **Step 11.3: Handle `phase_a_ready` arrival (user navigated direct-URL during Phase A wait)**

If after polling we arrive at status `phase_a_ready` AND the user has not yet completed Q&A, the chart will sit there with entities + ownership but no transactions. Add a small CTA below the loader for that case. In the loader render block of `StructureChartStep.tsx` (find the `<AtlasLoader ... />` JSX block around lines 422-445), add a `phaseAReadyCta` prop:

```tsx
          {showLoader ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <AtlasLoader
                status={status}
                warnings={
                  (chart?.warnings as Array<{ stage: number; message: string }>) ?? []
                }
                detail={{ entitiesFound: visibleEntities.length || undefined }}
                onSkipRemaining={chart ? async () => {
                  await forceDraftReady(
                    chart.id,
                    'Stage 3 (transactions) skipped by user — extraction was taking too long.',
                  );
                  const refreshed = await loadChart(sessionId);
                  if (refreshed) {
                    setChart(refreshed.chart);
                    setEntities(refreshed.entities);
                    setEdgesState(refreshed.edges);
                    setStatus(refreshed.chart.status as ChartStatus);
                  }
                } : undefined}
                onResumeFromPhaseA={status === 'phase_a_ready' && chart ? async () => {
                  await startExtraction(sessionId, 'refine_and_transactions');
                  await pollUntilTerminal(chart.id, async (s) => {
                    setStatus(s);
                    const refreshed = await loadChart(sessionId);
                    if (refreshed) {
                      setChart(refreshed.chart);
                      setEntities(refreshed.entities);
                      setEdgesState(refreshed.edges);
                    }
                  });
                } : undefined}
              />
            </div>
          ) : isFailed ? (
```

`showLoader` now also needs to include `phase_a_ready` so the loader stays visible:

Find the `const showLoader = status === 'loading' || isExtracting;` line (around line 399) and replace it with:

```ts
  const showLoader =
    status === 'loading' ||
    isExtracting ||
    status === 'phase_a_ready';
```

- [ ] **Step 11.4: Add `onResumeFromPhaseA` prop to `AtlasLoader`**

In `src/components/structure/AtlasLoader.tsx`, add the prop to the `Props` interface and render a button when the status is `phase_a_ready`. After the existing `onSkipRemaining?: () => void;` line in the interface, add:

```ts
  /** Optional callback for resuming Phase B from a phase_a_ready chart. */
  onResumeFromPhaseA?: () => void;
```

Update the destructuring at the top of the component:

```tsx
export function AtlasLoader({ status, warnings = [], detail, onSkipRemaining, onResumeFromPhaseA }: Props) {
```

In the render output, after the existing `showSkip && onSkipRemaining && (...)` block, add another conditional block:

```tsx
      {status === 'phase_a_ready' && onResumeFromPhaseA && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-xs text-neutral-500 max-w-sm text-center">
            Entities and ownership are ready. Generate transactions and ATAD2 mismatch analysis now.
          </p>
          <Button size="sm" onClick={onResumeFromPhaseA}>
            Generate transactions
          </Button>
        </div>
      )}
```

- [ ] **Step 11.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 11.6: Test**

```bash
npm test -- --run
```

Expected: 57 tests pass.

- [ ] **Step 11.7: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx src/components/structure/AtlasLoader.tsx
git commit -m "feat(structure): no auto-start on mount; handle phase_a_ready with Resume CTA"
```

---

## Task 12 — Final verification before deploy

**Files:** (none modified)

- [ ] **Step 12.1: Full type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 12.2: Full test suite**

```bash
npm test -- --run
```

Expected: 57 tests pass (46 existing + 4 formatQaBlock/header + 7 stageOf).

- [ ] **Step 12.3: Build**

```bash
npm run build
```

Expected: build succeeds with only the existing pdf.js chunk-size warning (no new warnings).

- [ ] **Step 12.4: Commit (only if there are uncommitted lockfile/asset changes; otherwise skip)**

```bash
git status
```

If output shows clean working tree, this step is a no-op — skip.

---

## Task 13 — Deploy updated Edge Function to VM

**Files:** none changed locally; this task only pushes the working tree to the VM.

- [ ] **Step 13.1: Verify the prerequisite worker timeout is still 600_000**

```bash
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "grep workerTimeoutMs /home/deno/functions/main/index.ts" --query "value[0].message" -o tsv
```

Expected output contains: `const workerTimeoutMs = 10 * 60 * 1000`. If not, re-apply the bump from the prior session.

- [ ] **Step 13.2: Build the Edge Function tarball locally**

```bash
tar --exclude='__tests__' --exclude='*.test.ts' -czf /tmp/extract-structure.tar.gz -C supabase/functions extract-structure
ls -la /tmp/extract-structure.tar.gz
```

Expected: tarball ~30-50 KB.

- [ ] **Step 13.3: Upload + extract on the VM**

The dev machine runs Windows / PowerShell. Use this PowerShell pattern (uses `[System.Convert]::ToBase64String` instead of bash `base64 -w0`, and writes the script to a temp file so the long base64 payload doesn't blow past PowerShell's line-length limits when passed inline):

```powershell
$bytes = [System.IO.File]::ReadAllBytes('/tmp/extract-structure.tar.gz')
$b64 = [System.Convert]::ToBase64String($bytes)
$script = @"
echo '$b64' | base64 -d > /tmp/extract-structure.tar.gz
rm -rf /root/supabase-docker/volumes/functions/extract-structure
tar -xzf /tmp/extract-structure.tar.gz -C /root/supabase-docker/volumes/functions/
ls /root/supabase-docker/volumes/functions/extract-structure/
"@
$tmp = New-TemporaryFile
Set-Content -Path $tmp.FullName -Value $script -Encoding utf8 -NoNewline
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "@$($tmp.FullName)" --query "value[0].message" -o tsv
Remove-Item $tmp.FullName
```

If WSL / Git Bash is preferred instead, the equivalent bash form is:

```bash
B64=$(base64 -w0 /tmp/extract-structure.tar.gz)
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "echo '$B64' | base64 -d > /tmp/extract-structure.tar.gz && rm -rf /root/supabase-docker/volumes/functions/extract-structure && tar -xzf /tmp/extract-structure.tar.gz -C /root/supabase-docker/volumes/functions/ && ls /root/supabase-docker/volumes/functions/extract-structure/" --query "value[0].message" -o tsv
```

Expected: directory listing includes `index.ts`, `claude.ts`, `formatters.ts`, `schemas.ts`, `verifyAuth.ts`, `documentsLoader.ts`, `deno.json`, and a `prompts/` folder with `stage1-initial.ts`, `stage1-refine.ts`, `stage2-initial.ts`, `stage2-refine.ts`, `stage3-transactions.ts`.

- [ ] **Step 13.4: Restart the functions container**

```bash
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "cd /root/supabase-docker && docker compose restart functions && sleep 3 && docker ps --filter name=supabase-edge-functions --format '{{.Names}}  {{.Status}}'" --query "value[0].message" -o tsv
```

Expected: container shows `Up` for ≥1 second after restart.

- [ ] **Step 13.5: Smoke-test the new endpoint**

```bash
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "docker logs --tail 30 supabase-edge-functions 2>&1 | tail -15" --query "value[0].message" -o tsv
```

Expected: clean startup, no syntax errors, no `Error loading module` messages.

---

## Task 14 — Manual end-to-end verification

This task is performed against the running dev server (`npm run dev` → `http://localhost:8080`) talking to the now-updated VM Edge Function.

- [ ] **Step 14.1: Reset stuck chart rows (so existing test assessments can re-run)**

```bash
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "docker exec supabase-db psql -U postgres -d postgres -c \"UPDATE atad2_structure_charts SET status = 'extraction_failed' WHERE status LIKE 'extracting:%' AND draft_extracted_at IS NULL RETURNING id;\"" --query "value[0].message" -o tsv
```

- [ ] **Step 14.2: New-assessment E2E**

In the browser:
1. Log in, start a new assessment, upload at least one document.
2. Click "Continue" on the upload page.
3. Open the database query in the VM to confirm Phase A fires:
   ```bash
   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "docker exec supabase-db psql -U postgres -d postgres -c \"SELECT id, status, draft_extracted_at FROM atad2_structure_charts ORDER BY created_at DESC LIMIT 1;\"" --query "value[0].message" -o tsv
   ```
   Within ~5s the latest row should show `status = extracting:stage1`. Within ~60s it should reach `phase_a_ready` with several entities in `atad2_structure_entities`.
4. Complete the Q&A in the browser. Add a non-trivial explanation on at least one question that names an entity not in the documents (e.g. "Our sister company in Germany is Vogel GmbH"). Hit "Continue to structure chart".
5. The chart page loads. Within ~60-90s status should walk through `extracting:refining` → `extracting:stage3` → `draft_ready`.
6. Confirm the rendered chart shows entities + ownership + transactions, and that the entity you named in the explanation (Vogel GmbH) is present.

- [ ] **Step 14.3: Re-extract path after a Q&A edit**

1. Go back to the Q&A page (browser back or sidebar navigation).
2. Edit the explanation on a hybrid-mismatch question — flip the rationale.
3. Continue back to the structure chart page; click the "Re-extract" toolbar button.
4. Verify the chart re-runs Phase B (status walks `extracting:refining` → `extracting:stage3` → `draft_ready`) and the mismatch classification of the relevant transaction reflects the user's new yes/no answer.

- [ ] **Step 14.4: Direct-URL Phase-A interception path**

1. Start another fresh assessment, upload, hit Continue on upload.
2. Wait ~10s (Phase A still mid-stage 1).
3. In a new tab, paste `http://localhost:8080/assessment/structure/<sessionId>` directly.
4. Expected: the loader appears, polling kicks in, status walks to `phase_a_ready`, and a "Generate transactions" button appears.
5. Click it. Phase B fires and walks to `draft_ready`.

- [ ] **Step 14.5: "Continue without transactions" escape hatch is not regressed**

1. While a chart sits on `extracting:stage3` for ≥30 seconds (you can force this by editing the local `STAGE3_ESCAPE_HATCH_MS` constant in `AtlasLoader.tsx` to `5_000` for the test, then revert), the "Continue without transactions" button should still appear and still flip the chart to `draft_ready` when clicked.

- [ ] **Step 14.6: Cleanup test reverts**

If you altered any constants for testing, revert them and re-commit nothing — these changes never went into a commit.

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| Phase A trigger (start-analyze sibling) | Task 9 (`useStartAnalyze` — corrected from spec's `start-analyze` Edge Function which doesn't exist) |
| Phase B trigger (Continue → Phase B) | Task 10 (`Assessment.tsx` pre-fetch explicit phase) |
| Source-priority prompt header | Task 2 (`QA_PRIMACY_HEADER` in `formatters.ts`, applied in stage1-refine, stage2-refine, stage3) |
| Q&A explanation in prompt | Task 4 (`loadQaAnswersText` selects + formats explanation) |
| Data-model `phase_a_ready` + `extracting:refining` | Task 1 (type extension; DB has no constraint to migrate) |
| Frontend `StructureChartStep` no auto-extract on mount | Task 11 |
| Frontend `AtlasLoader` handles new statuses | Task 8 |
| Re-trigger on Re-extract button | Existing `handleReExtract` in `StructureChartStep.tsx` already calls `startExtraction(sessionId)` with no phase arg → defaults to `refine_and_transactions` → goes through refine path because Phase-A rows exist. No code change needed. |
| Re-trigger on doc re-upload | `useStartAnalyze` is invoked again at the next Continue click on upload page → fires `startExtraction(sessionId, 'docs_only')` again → `runPhaseA` calls `clearAiExtracted` and starts fresh. |
| Phase-A-failed fallback in Phase B | Task 7 (`runPhaseB` checks `existingAi.entities.length > 0`) |
| `extract-schemas.test.ts` extends with new tests | Task 3 |
| Frontend `stageOf` mapper test | Task 8 |
