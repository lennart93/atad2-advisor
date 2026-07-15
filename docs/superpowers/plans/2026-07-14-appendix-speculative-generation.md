# Speculatieve bijlage-generatie — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De technische bijlage draait speculatief op de prefill-suggesties zodat de Facts-pagina altijd de definitieve set toont; late stille schrijvers verdwijnen.

**Architecture:** Eén gedeelde "effectieve antwoorden"-bron (echt antwoord wint, anders suggestie) + een antwoorden-vingerafdruk die elke run opslaat op `atad2_structure_charts` en `atad2_appendix`. Twee frontend-hooks (speculatieve refine + fingerprint-keyed appendix-prewarm) orkestreren de keten; de Facts-pagina gate't op vingerafdruk-gelijkheid. Spec: `docs/superpowers/specs/2026-07-14-appendix-speculative-generation-design.md`.

**Tech Stack:** React/TS/Vite frontend, self-hosted Supabase edge functions (Deno), vitest.

## Global Constraints

- **GEEN commits/pushes en GEEN deploys** — Lennarts vaste regel: alleen op expliciet verzoek (main = live productie). Alle wijzigingen blijven in de working tree; de commit-stappen uit het standaard-skillformat zijn hier bewust weggelaten.
- Duale bestanden (frontend + Deno) moeten regel-voor-regel dezelfde pure logica bevatten (repo-patroon `skeleton.ts`/`skeletonRows.ts`).
- UI-strings: Engels, geen em-dashes, neutrale toon (geen "we").
- `src/integrations/supabase/types.ts` wordt handmatig bijgehouden.
- Testrunner: `npx vitest run <pad>`; volledige check: `npx vitest run` + `npm run build`.
- Deploy-volgorde (LATER, niet in dit plan uitvoeren): (1) migratie, (2) edge functions `extract-structure` + `generate-appendix` + `_shared`, (3) frontend via Azure.
- De `hasQaAnswers` self-chain in `extract-structure` blijft op ECHTE antwoorden staan (bewust: anders draait fase B al op halve suggesties direct na fase A en verdubbelen de model-runs).

---

### Task 1: Pure helper `effectiveAnswers` (frontend, canoniek)

**Files:**
- Create: `src/lib/assessment/effectiveAnswers.ts`
- Test: `src/lib/assessment/__tests__/effectiveAnswers.test.ts`

**Interfaces:**
- Produces (gebruikt door Tasks 2, 6, 9):
  - `interface RealAnswerInput { question_id: string; answer: string; explanation: string | null; question_text?: string | null }`
  - `interface PrefillInput { question_id: string; suggested_answer: 'yes' | 'no' | 'unknown' | null; suggested_toelichting: string | null; contextual_hint: string | null; suggested_toelichting_unknown: string | null }`
  - `interface EffectiveAnswer { question_id: string; answer: string; explanation: string | null; question_text: string | null; source: 'answer' | 'suggestion' }`
  - `mergeEffectiveAnswers(real: RealAnswerInput[], prefills: PrefillInput[]): EffectiveAnswer[]`
  - `canonicalAnswersString(answers: Array<{ question_id: string; answer: string; explanation: string | null }>): string`
  - `answersFingerprint(answers: Array<{ question_id: string; answer: string; explanation: string | null }>): Promise<string>` (sha256 hex)

- [ ] **Step 1: Schrijf de falende tests**

```ts
// src/lib/assessment/__tests__/effectiveAnswers.test.ts
import { describe, it, expect } from 'vitest';
import {
  mergeEffectiveAnswers, canonicalAnswersString, answersFingerprint,
} from '@/lib/assessment/effectiveAnswers';

const pf = (over: Partial<Parameters<typeof mergeEffectiveAnswers>[1][number]> = {}) => ({
  question_id: 'Q1', suggested_answer: 'yes' as const, suggested_toelichting: 'Because X.',
  contextual_hint: null, suggested_toelichting_unknown: null, ...over,
});

describe('mergeEffectiveAnswers', () => {
  it('real answer wins over the suggestion for the same question', () => {
    const out = mergeEffectiveAnswers(
      [{ question_id: 'Q1', answer: 'No', explanation: 'Edited.' }],
      [pf()],
    );
    expect(out).toEqual([{ question_id: 'Q1', answer: 'No', explanation: 'Edited.', question_text: null, source: 'answer' }]);
  });
  it('unanswered question falls back to yes/no suggestion with its toelichting', () => {
    const out = mergeEffectiveAnswers([], [pf()]);
    expect(out).toEqual([{ question_id: 'Q1', answer: 'yes', explanation: 'Because X.', question_text: null, source: 'suggestion' }]);
  });
  it('Route B unknown-companion becomes an unknown answer with the unknown toelichting', () => {
    const out = mergeEffectiveAnswers([], [pf({
      suggested_answer: null, suggested_toelichting: null,
      contextual_hint: 'hint', suggested_toelichting_unknown: 'It is unknown whether Y.',
    })]);
    expect(out).toEqual([{ question_id: 'Q1', answer: 'unknown', explanation: 'It is unknown whether Y.', question_text: null, source: 'suggestion' }]);
  });
  it('unknown suggestion without any toelichting is omitted', () => {
    expect(mergeEffectiveAnswers([], [pf({ suggested_answer: 'unknown', suggested_toelichting: null })])).toEqual([]);
    expect(mergeEffectiveAnswers([], [pf({ suggested_answer: null, suggested_toelichting: null })])).toEqual([]);
  });
  it('explicit unknown suggestion with toelichting is included', () => {
    const out = mergeEffectiveAnswers([], [pf({ suggested_answer: 'unknown', suggested_toelichting: null, suggested_toelichting_unknown: 'Unknown Z.' })]);
    expect(out[0]).toMatchObject({ answer: 'unknown', explanation: 'Unknown Z.' });
  });
  it('output is sorted by question_id and carries question_text when given', () => {
    const out = mergeEffectiveAnswers(
      [{ question_id: 'Q9', answer: 'Yes', explanation: null, question_text: 'Nine?' }],
      [pf({ question_id: 'Q2' })],
    );
    expect(out.map((a) => a.question_id)).toEqual(['Q2', 'Q9']);
    expect(out[1].question_text).toBe('Nine?');
  });
});

describe('canonicalAnswersString', () => {
  it('lowercases the answer, trims the explanation, sorts by question_id', () => {
    const s = canonicalAnswersString([
      { question_id: 'Q2', answer: 'Yes', explanation: '  Because X. ' },
      { question_id: 'Q1', answer: 'no', explanation: null },
    ]);
    expect(s).toBe('Q1=no|\nQ2=yes|Because X.');
  });
});

describe('answersFingerprint', () => {
  it('is stable and case/whitespace-normalized', async () => {
    const a = await answersFingerprint([{ question_id: 'Q1', answer: 'Yes', explanation: ' t ' }]);
    const b = await answersFingerprint([{ question_id: 'Q1', answer: 'yes', explanation: 't' }]);
    const c = await answersFingerprint([{ question_id: 'Q1', answer: 'no', explanation: 't' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run de tests, verwacht FAIL** (`npx vitest run src/lib/assessment/__tests__/effectiveAnswers.test.ts` → module not found)

- [ ] **Step 3: Implementeer**

```ts
// src/lib/assessment/effectiveAnswers.ts
// Pure, dependency-vrije logica. DUAL MAINTENANCE: het blok tussen de
// BEGIN/END SHARED markers staat identiek in
// supabase/functions/_shared/effectiveAnswers.ts. Beide bijwerken bij elke
// wijziging (zelfde regel als skeleton.ts / skeletonRows.ts).

// ===== BEGIN SHARED =====
export interface RealAnswerInput {
  question_id: string;
  answer: string;
  explanation: string | null;
  question_text?: string | null;
}
export interface PrefillInput {
  question_id: string;
  suggested_answer: 'yes' | 'no' | 'unknown' | null;
  suggested_toelichting: string | null;
  contextual_hint: string | null;
  suggested_toelichting_unknown: string | null;
}
export interface EffectiveAnswer {
  question_id: string;
  answer: string;
  explanation: string | null;
  question_text: string | null;
  source: 'answer' | 'suggestion';
}

/**
 * The best answer set available right now: the recorded answer where the
 * question is answered, otherwise the prefill suggestion. A plain accept
 * copies the suggestion verbatim into the answer, so speculative and final
 * sets are identical unless the user genuinely deviated.
 */
export function mergeEffectiveAnswers(
  real: RealAnswerInput[],
  prefills: PrefillInput[],
): EffectiveAnswer[] {
  const out = new Map<string, EffectiveAnswer>();
  for (const r of real) {
    if (out.has(r.question_id)) continue;
    out.set(r.question_id, {
      question_id: r.question_id,
      answer: r.answer,
      explanation: r.explanation,
      question_text: r.question_text ?? null,
      source: 'answer',
    });
  }
  for (const p of prefills) {
    if (out.has(p.question_id)) continue;
    if (p.suggested_answer === 'yes' || p.suggested_answer === 'no') {
      out.set(p.question_id, {
        question_id: p.question_id,
        answer: p.suggested_answer,
        explanation: p.suggested_toelichting?.trim() || null,
        question_text: null,
        source: 'suggestion',
      });
      continue;
    }
    // Unknown route: an explicit 'unknown' suggestion, or the Route B
    // companion (no suggested_answer, but a contextual hint with the unknown
    // toelichting). Only counts when there is actual text; a bare unknown
    // adds nothing to the model input.
    const unknownText = p.suggested_toelichting_unknown?.trim() || p.suggested_toelichting?.trim() || '';
    const isUnknownRoute = p.suggested_answer === 'unknown'
      || (p.suggested_answer === null && !!p.contextual_hint && !!p.suggested_toelichting_unknown);
    if (isUnknownRoute && unknownText) {
      out.set(p.question_id, {
        question_id: p.question_id,
        answer: 'unknown',
        explanation: unknownText,
        question_text: null,
        source: 'suggestion',
      });
    }
  }
  return [...out.values()].sort((a, b) => a.question_id.localeCompare(b.question_id));
}

/**
 * Canonical form for the fingerprint: one line per question,
 * `id=lowercase(answer)|trim(explanation)`, sorted by question_id. Lowercasing
 * bridges the 'Yes' (recorded answer) vs 'yes' (suggestion) casing difference.
 */
export function canonicalAnswersString(
  answers: Array<{ question_id: string; answer: string; explanation: string | null }>,
): string {
  return [...answers]
    .sort((a, b) => a.question_id.localeCompare(b.question_id))
    .map((a) => `${a.question_id}=${a.answer.toLowerCase()}|${(a.explanation ?? '').trim()}`)
    .join('\n');
}

/** sha256 hex over the canonical form. crypto.subtle exists in browser, Deno and Node (vitest). */
export async function answersFingerprint(
  answers: Array<{ question_id: string; answer: string; explanation: string | null }>,
): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalAnswersString(answers)),
  );
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// ===== END SHARED =====
```

- [ ] **Step 4: Run de tests, verwacht PASS** (`npx vitest run src/lib/assessment/__tests__/effectiveAnswers.test.ts`)

---

### Task 2: Deno-mirror + DB-loader in `_shared`

**Files:**
- Create: `supabase/functions/_shared/effectiveAnswers.ts` (mirror van het SHARED-blok uit Task 1)
- Create: `supabase/functions/_shared/effectiveAnswersDb.ts`
- Test: `src/lib/assessment/__tests__/effectiveAnswersParity.test.ts`

**Interfaces:**
- Consumes: het SHARED-blok uit Task 1.
- Produces (gebruikt door Tasks 4 en 5):
  - `_shared/effectiveAnswers.ts`: zelfde exports als Task 1.
  - `_shared/effectiveAnswersDb.ts`: `loadEffectiveAnswers(client, sessionId): Promise<EffectiveAnswer[]>` — leest `atad2_answers`, `atad2_question_prefills` en `atad2_questions` (voor question_text bij suggestie-rijen) en merged.

- [ ] **Step 1: Schrijf de falende pariteitstest** (cross-import patroon zoals `extract-structure/formatters.ts`)

```ts
// src/lib/assessment/__tests__/effectiveAnswersParity.test.ts
import { describe, it, expect } from 'vitest';
import * as fe from '@/lib/assessment/effectiveAnswers';
// Relative cross-import into the Deno file: it must stay dependency-free.
import * as deno from '../../../../supabase/functions/_shared/effectiveAnswers';

describe('effectiveAnswers frontend/Deno parity', () => {
  const real = [{ question_id: 'Q2', answer: 'Yes', explanation: ' t ' }];
  const prefills = [{
    question_id: 'Q1', suggested_answer: 'no' as const, suggested_toelichting: 'S.',
    contextual_hint: null, suggested_toelichting_unknown: null,
  }];
  it('same merge result', () => {
    expect(deno.mergeEffectiveAnswers(real, prefills)).toEqual(fe.mergeEffectiveAnswers(real, prefills));
  });
  it('same canonical string and fingerprint', async () => {
    const eff = fe.mergeEffectiveAnswers(real, prefills);
    expect(deno.canonicalAnswersString(eff)).toBe(fe.canonicalAnswersString(eff));
    expect(await deno.answersFingerprint(eff)).toBe(await fe.answersFingerprint(eff));
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL** (module not found)

- [ ] **Step 3: Maak `supabase/functions/_shared/effectiveAnswers.ts`**: kopieer het volledige SHARED-blok uit Task 1 letterlijk (zelfde header-commentaar, met de verwijzing andersom: "mirror van src/lib/assessment/effectiveAnswers.ts"). Geen Deno-specifieke imports (het bestand moet cross-importeerbaar blijven voor de pariteitstest).

- [ ] **Step 4: Maak `supabase/functions/_shared/effectiveAnswersDb.ts`**

```ts
// supabase/functions/_shared/effectiveAnswersDb.ts
// Deno-only loader rond de pure merge. Structureel getypeerde client zodat dit
// bestand niet aan een import-map hangt.
import {
  mergeEffectiveAnswers,
  type EffectiveAnswer, type PrefillInput, type RealAnswerInput,
} from "./effectiveAnswers.ts";

interface QueryResult { data: unknown; error: { message: string } | null }
interface MinimalDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): PromiseLike<QueryResult>;
    };
  };
}

export async function loadEffectiveAnswers(client: MinimalDb, sessionId: string): Promise<EffectiveAnswer[]> {
  const [answersRes, prefillsRes] = await Promise.all([
    client.from("atad2_answers")
      .select("question_id, question_text, answer, explanation").eq("session_id", sessionId),
    client.from("atad2_question_prefills")
      .select("question_id, suggested_answer, suggested_toelichting, contextual_hint, suggested_toelichting_unknown")
      .eq("session_id", sessionId),
  ]);
  const real = ((answersRes.data ?? []) as RealAnswerInput[]);
  const prefills = ((prefillsRes.data ?? []) as PrefillInput[]);
  const merged = mergeEffectiveAnswers(real, prefills);

  // Suggestion rows carry no question_text; the structure-refine prompt wants
  // it. Fetch it once from the question bank (one row per answer option, so
  // dedupe by question_id). Best-effort: a miss leaves question_text null.
  if (merged.some((a) => a.source === "suggestion")) {
    try {
      const qRes = await (client.from("atad2_questions")
        .select("question_id, question_text") as unknown as {
          eq?: never;
        } & PromiseLike<QueryResult>);
      const byId = new Map<string, string>();
      for (const q of (qRes.data ?? []) as Array<{ question_id: string; question_text: string }>) {
        if (!byId.has(q.question_id)) byId.set(q.question_id, q.question_text);
      }
      for (const a of merged) {
        if (a.question_text == null) a.question_text = byId.get(a.question_id) ?? null;
      }
    } catch { /* question_text stays null */ }
  }
  return merged;
}
```

LET OP voor de implementer: de select op `atad2_questions` heeft geen `.eq(...)`-filter (vragenbank is sessie-onafhankelijk); als de `MinimalDb`-typing daarvoor knelt, versimpel de interface naar `from(table: string): any` — runtime is een echte supabase-js client, de typing is alleen lokaal gemak.

- [ ] **Step 5: Run de pariteitstest, verwacht PASS** (`npx vitest run src/lib/assessment/__tests__/effectiveAnswersParity.test.ts`)

---

### Task 3: Migratie + handmatige types

**Files:**
- Create: `supabase/migrations/20260714130000_answers_fingerprint_columns.sql`
- Modify: `src/integrations/supabase/types.ts` (tabellen `atad2_structure_charts` en `atad2_appendix`)
- Modify: `src/lib/structure/types.ts` (StructureChart), `src/lib/structure/client.ts:11-13` (CHART_COLUMNS)
- Modify: `src/lib/appendix/types.ts` (StoredAppendix), `src/lib/appendix/client.ts:15-39` (loadAppendix-mapping)

**Interfaces:**
- Produces: kolom `answers_fingerprint: string | null` beschikbaar op `StructureChart` (via `loadChart`) en `StoredAppendix` (via `loadAppendix`). Tasks 6, 7 en 9 lezen die.

- [ ] **Step 1: Schrijf de migratie**

```sql
-- 20260714130000_answers_fingerprint_columns.sql
-- Vingerafdruk van de effectieve antwoorden-set die een run gebruikte.
-- Nullable: oude dossiers en nog-niet-herdraaide runs hebben geen waarde.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS answers_fingerprint text;
ALTER TABLE public.atad2_appendix
  ADD COLUMN IF NOT EXISTS answers_fingerprint text;
```

- [ ] **Step 2: `src/integrations/supabase/types.ts`**: voeg in de `Row`, `Insert` en `Update` interfaces van `atad2_structure_charts` én `atad2_appendix` toe: `answers_fingerprint: string | null` (Row) / `answers_fingerprint?: string | null` (Insert, Update). Zoek de tabelblokken op naam.

- [ ] **Step 3: Frontend-types + selects**
  - `src/lib/structure/types.ts`: voeg `answers_fingerprint: string | null;` toe aan het `StructureChart`-type (zoek `export interface StructureChart` of het type-alias).
  - `src/lib/structure/client.ts:11-13`: breid `CHART_COLUMNS` uit met `, answers_fingerprint`.
  - `src/lib/appendix/types.ts`: voeg `answers_fingerprint: string | null;` toe aan `StoredAppendix`.
  - `src/lib/appendix/client.ts` in `loadAppendix`: voeg toe aan het return-object: `answers_fingerprint: (data as { answers_fingerprint?: string | null }).answers_fingerprint ?? null,`.

- [ ] **Step 4: Check** `npm run build` → geen type-errors. LET OP: lokaal draaien tegen de VM-database werkt pas na de migratie (deploy-volgorde); de code leest de kolom alleen defensief.

---

### Task 4: `extract-structure` op effectieve antwoorden + vingerafdruk-write

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts` (met name `loadQaAnswersText` rond regel 307 en de final update in `runPhaseB` rond regel 693-700)

**Interfaces:**
- Consumes: `loadEffectiveAnswers` (Task 2), `answersFingerprint` (Task 2), bestaande `formatQaBlock`.
- Produces: `atad2_structure_charts.answers_fingerprint` gevuld na elke geslaagde Phase B-run.

- [ ] **Step 1: Imports toevoegen** bovenin `index.ts`:

```ts
import { loadEffectiveAnswers } from "../_shared/effectiveAnswersDb.ts";
import { answersFingerprint } from "../_shared/effectiveAnswers.ts";
```

- [ ] **Step 2: Vervang `loadQaAnswersText` (regel ~307-324)** door een versie die effectieve antwoorden levert plus de vingerafdruk:

```ts
async function loadQaAnswersText(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ qaText: string; fingerprint: string }> {
  // Effective answers: the recorded answer where the question is answered,
  // otherwise the prefill suggestion. This is what makes the refine pass able
  // to run speculatively while the user is still in the questionnaire.
  const rows = await loadEffectiveAnswers(client, sessionId);
  const qaText = formatQaBlock(rows.map((r) => ({
    question_id: r.question_id,
    question_text: r.question_text ?? "",
    answer: r.answer,
    explanation: r.explanation,
  })));
  return { qaText, fingerprint: await answersFingerprint(rows) };
}
```

- [ ] **Step 3: Pas de aanroep in `runPhaseB` aan (regel ~583)**:

```ts
const { qaText, fingerprint: answersFp } = await loadQaAnswersText(serviceClient, sessionId);
```

(de bestaande `cachedSystem`-regel gebruikt `qaText` en blijft verder gelijk). Grep daarna binnen het bestand op `loadQaAnswersText` en pas ELKE aanroep aan het nieuwe return-type aan (verwacht: alleen deze ene in `runPhaseB`; fase A is docs-only).

- [ ] **Step 4: Schrijf de vingerafdruk in de final update (regel ~693-700), kolom-missing-safe** (patroon `finalizeChart` in `src/lib/structure/client.ts`):

```ts
const finalPatch = {
  status: "draft_ready",
  draft_extracted_at: new Date().toISOString(),
};
const { error: finalUpdateErr } = await serviceClient
  .from("atad2_structure_charts")
  .update({ ...finalPatch, answers_fingerprint: answersFp })
  .eq("id", chartId);
if (finalUpdateErr) {
  // answers_fingerprint column may not exist yet (migration not applied).
  // Fall back without it so the run still lands.
  console.warn(JSON.stringify({
    level: "warn", event: "fingerprint_write_failed",
    message: String(finalUpdateErr.message), chart_id: chartId,
  }));
  const { error: legacyErr } = await serviceClient
    .from("atad2_structure_charts").update(finalPatch).eq("id", chartId);
  if (legacyErr) throw legacyErr;
}
```

- [ ] **Step 5: NIET wijzigen**: `hasQaAnswers` (regel ~335) en de self-chain op regel ~180 blijven op echte antwoorden tellen (zie Global Constraints). Voeg boven `hasQaAnswers` één regel commentaar toe: `// Deliberately REAL answers only: self-chaining B on half-filled suggestions right after Phase A would double the model runs; the speculative start is the frontend's job (useSpeculativeRefine).`

- [ ] **Step 6: Verifieer** met `npx vitest run` (bestaande suites raken dit Deno-bestand niet, maar de pariteitstest uit Task 2 bewaakt de gedeelde logica) en lees de diff na op TypeScript-fouten (Deno-bestanden zitten niet in `npm run build`).

---

### Task 5: `generate-appendix` op effectieve antwoorden + vingerafdruk-write

**Files:**
- Modify: `supabase/functions/generate-appendix/index.ts` (answers-load rond regel 238-249, final update rond regel 535-540)

**Interfaces:**
- Consumes: `loadEffectiveAnswers`, `answersFingerprint` (Task 2).
- Produces: `atad2_appendix.answers_fingerprint` gevuld na elke geslaagde run.

- [ ] **Step 1: Imports toevoegen**:

```ts
import { loadEffectiveAnswers } from "../_shared/effectiveAnswersDb.ts";
import { answersFingerprint } from "../_shared/effectiveAnswers.ts";
```

- [ ] **Step 2: Vervang de answers-load in `runGeneration` (regel ~238-241)**:

```ts
// Effective answers: recorded answers win, prefill suggestions fill the gaps.
// This lets the definitive-looking run happen while the user is still in the
// questionnaire; the stored fingerprint tells the Facts page whether this run
// matches the final answers.
const effective = await loadEffectiveAnswers(c, sessionId);
const answersFp = await answersFingerprint(effective);
const answers: Answer[] = effective.map((a) => ({
  question_id: a.question_id, answer: a.answer, explanation: a.explanation,
}));
const answersByQ = new Map(answers.map((a) => [a.question_id, a]));
```

- [ ] **Step 3: Maak de 1bis-renderregel case-onafhankelijk (regel ~246-249)** — suggesties zijn lowercase ('yes'), echte antwoorden mogelijk 'Yes'; zonder dit zou een speculatieve run 1bis-rijen weglaten terwijl de vingerafdruk (die lowercased) wél matcht:

```ts
const rows = allRows.filter((r) => {
  if (!r.renderIfQuestionEquals) return true;
  const got = answersByQ.get(r.renderIfQuestionEquals.questionId)?.answer;
  return got?.toLowerCase() === r.renderIfQuestionEquals.equals.toLowerCase();
});
```

- [ ] **Step 4: Schrijf de vingerafdruk in de final update (regel ~535-540), kolom-missing-safe**:

```ts
const finalRow = {
  rows: reviewed, facts: factsToStore, facts_input_hash: factsHashToStore,
  generation_status: "ready",
  model: prompt.model, prompt_version: prompt.version,
  generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
const { error: finalErr } = await c.from("atad2_appendix")
  .update({ ...finalRow, answers_fingerprint: answersFp }).eq("id", appendixId);
if (finalErr) {
  // answers_fingerprint column may not exist yet (migration not applied).
  console.warn(JSON.stringify({ level: "warn", event: "appendix_fingerprint_write_failed", message: String(finalErr.message), appendixId }));
  const { error: legacyErr } = await c.from("atad2_appendix").update(finalRow).eq("id", appendixId);
  if (legacyErr) throw legacyErr;
}
```

- [ ] **Step 5: Check consistentie**: `evidenceNotes` en `answersBlock` (regel ~254-261) werken ongewijzigd door op de nieuwe `answers`-array; controleer dat er verder geen enkele andere plek in het bestand `atad2_answers` leest (grep binnen het bestand).

- [ ] **Step 6: Run** `npx vitest run` (pariteits- en bestaande appendix-tests blijven groen).

---

### Task 6: Client-loader + `useSpeculativeRefine` + settled-signaal

**Files:**
- Create: `src/lib/assessment/effectiveAnswersClient.ts`
- Create: `src/hooks/useSpeculativeRefine.ts`
- Modify: `src/hooks/useFactsheetPrewarm.ts` (settled-flag), `src/pages/AssessmentUpload.tsx`, `src/pages/Assessment.tsx`, `src/pages/AssessmentConfirmation.tsx` (mounts)
- Test: `src/lib/assessment/__tests__/speculativeRefine.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers, `loadChart` (`src/lib/structure/client.ts`), `startExtraction` (`src/lib/structure/extraction.ts`).
- Produces:
  - `currentEffectiveFingerprint(sessionId: string): Promise<{ fingerprint: string; count: number }>` — gebruikt door Task 9.
  - `shouldFireRefine(input: { chartStatus: string | null; chartFingerprint: string | null; fingerprint: string }): boolean` — pure, getest.
  - `useSpeculativeRefine(sessionId: string | null | undefined, active: boolean): void`
  - `FactsheetPrewarmState.settled: boolean`

- [ ] **Step 1: Schrijf de falende test voor de pure beslisfunctie**

```ts
// src/lib/assessment/__tests__/speculativeRefine.test.ts
import { describe, it, expect } from 'vitest';
import { shouldFireRefine } from '@/hooks/useSpeculativeRefine';

describe('shouldFireRefine', () => {
  const fp = 'abc';
  it('fires when the chart has no or another fingerprint and is not extracting', () => {
    expect(shouldFireRefine({ chartStatus: 'phase_a_ready', chartFingerprint: null, fingerprint: fp })).toBe(true);
    expect(shouldFireRefine({ chartStatus: 'draft_ready', chartFingerprint: 'oud', fingerprint: fp })).toBe(true);
    expect(shouldFireRefine({ chartStatus: null, chartFingerprint: null, fingerprint: fp })).toBe(true);
  });
  it('does not fire when the chart already carries this fingerprint', () => {
    expect(shouldFireRefine({ chartStatus: 'draft_ready', chartFingerprint: fp, fingerprint: fp })).toBe(false);
  });
  it('does not fire while an extraction is running', () => {
    expect(shouldFireRefine({ chartStatus: 'extracting:stage1', chartFingerprint: null, fingerprint: fp })).toBe(false);
    expect(shouldFireRefine({ chartStatus: 'extracting:refining', chartFingerprint: 'oud', fingerprint: fp })).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL**

- [ ] **Step 3: Maak `src/lib/assessment/effectiveAnswersClient.ts`**

```ts
import { supabase } from '@/integrations/supabase/client';
import {
  mergeEffectiveAnswers, answersFingerprint,
  type PrefillInput, type RealAnswerInput,
} from './effectiveAnswers';

/**
 * Fingerprint of the CURRENT effective answer set (recorded answers win,
 * suggestions fill the gaps). The same computation the edge functions store,
 * so equality means "that run reflects what the answers are right now".
 */
export async function currentEffectiveFingerprint(
  sessionId: string,
): Promise<{ fingerprint: string; count: number }> {
  const [{ data: answers }, { data: prefills }] = await Promise.all([
    supabase.from('atad2_answers')
      .select('question_id, answer, explanation').eq('session_id', sessionId),
    supabase.from('atad2_question_prefills')
      .select('question_id, suggested_answer, suggested_toelichting, contextual_hint, suggested_toelichting_unknown')
      .eq('session_id', sessionId),
  ]);
  const eff = mergeEffectiveAnswers(
    (answers ?? []) as RealAnswerInput[],
    (prefills ?? []) as PrefillInput[],
  );
  return { fingerprint: await answersFingerprint(eff), count: eff.length };
}
```

- [ ] **Step 4: Maak `src/hooks/useSpeculativeRefine.ts`**

```ts
import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startExtraction } from '@/lib/structure/extraction';
import { currentEffectiveFingerprint } from '@/lib/assessment/effectiveAnswersClient';

/** Once per session+fingerprint, across all mounts of this hook. */
const firedKeys = new Set<string>();

export function shouldFireRefine(input: {
  chartStatus: string | null;
  chartFingerprint: string | null;
  fingerprint: string;
}): boolean {
  if (input.chartStatus?.startsWith('extracting')) return false;
  return input.chartFingerprint !== input.fingerprint;
}

/**
 * Speculative structure refine: as soon as the effective answers (suggestions
 * merged with any recorded answers) exist and the chart does not yet carry
 * their fingerprint, fire a refine pass. The appendix prewarm then follows the
 * refined chart automatically. Mounted on the upload page (active once the
 * factsheet pipeline is settled), the questionnaire and the confirmation page.
 */
export function useSpeculativeRefine(sessionId: string | null | undefined, active: boolean): void {
  useEffect(() => {
    if (!sessionId || !active) return;
    let cancelled = false;
    (async () => {
      try {
        const { fingerprint, count } = await currentEffectiveFingerprint(sessionId);
        if (cancelled || count === 0) return;
        const key = `${sessionId}:${fingerprint}`;
        if (firedKeys.has(key)) return;
        const chart = (await loadChart(sessionId))?.chart ?? null;
        if (cancelled) return;
        if (!shouldFireRefine({
          chartStatus: chart?.status ?? null,
          chartFingerprint: chart?.answers_fingerprint ?? null,
          fingerprint,
        })) return;
        firedKeys.add(key);
        await startExtraction(sessionId, 'refine');
      } catch (err) {
        // 409 = an extraction is already running; the self-chain or a later
        // mount picks it up. Anything else is best-effort background work.
        if ((err as { status?: number })?.status !== 409) {
          console.warn('[useSpeculativeRefine]', err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, active]);
}
```

- [ ] **Step 5: Settled-flag op `useFactsheetPrewarm`** (`src/hooks/useFactsheetPrewarm.ts`):
  - Breid `FactsheetPrewarmState` uit met `settled: boolean` en de initiële state met `settled: false`.
  - In de tick: op de plek waar `delay = 60_000` wordt gezet (pipeline settled, regel ~104-106) óók `setState((s) => ({ ...s, settled: true }))`; en in de `!allTerminal`-tak en de `stale`-tak expliciet `settled: false` meenemen in de bestaande `setState`-aanroepen.

- [ ] **Step 6: Mounts**
  - `src/pages/AssessmentUpload.tsx` (regel ~46-56): na de bestaande prewarm-hooks: `useSpeculativeRefine(sessionId, factsheetPrewarm.settled && !swarmRunning);`
  - `src/pages/Assessment.tsx`: naast de bestaande `useAppendixPrewarm(sessionId)`: `useSpeculativeRefine(sessionId, true);` (import toevoegen).
  - `src/pages/AssessmentConfirmation.tsx`: importeer en mount zowel `useAppendixPrewarm(sessionId)` als `useSpeculativeRefine(sessionId, true)` (haal `sessionId` uit de bestaande route-params van die pagina).

- [ ] **Step 7: Run** `npx vitest run src/lib/assessment/__tests__/speculativeRefine.test.ts` → PASS; daarna `npm run build`.

---

### Task 7: `useAppendixPrewarm` op vingerafdruk-sleutel, phaseA weg

**Files:**
- Modify: `src/hooks/useAppendixPrewarm.ts` (volledige herschrijving van de milestone-logica)
- Test: `src/hooks/__tests__/useAppendixPrewarm.test.ts` (nieuw; het pure deel)

**Interfaces:**
- Consumes: `loadChart` (levert nu `answers_fingerprint`, Task 3), `startAppendixGeneration`.
- Produces: `appendixPrewarmKey(sessionId: string, chart: { status: string | null; answers_fingerprint: string | null } | null): string | null` — pure, getest; `null` = (nog) niet vuren.

- [ ] **Step 1: Schrijf de falende test**

```ts
// src/hooks/__tests__/useAppendixPrewarm.test.ts
import { describe, it, expect } from 'vitest';
import { appendixPrewarmKey } from '@/hooks/useAppendixPrewarm';

describe('appendixPrewarmKey', () => {
  it('fires only on draft-and-later chart statuses', () => {
    expect(appendixPrewarmKey('s1', { status: 'phase_a_ready', answers_fingerprint: null })).toBeNull();
    expect(appendixPrewarmKey('s1', { status: 'extracting:stage1', answers_fingerprint: null })).toBeNull();
    expect(appendixPrewarmKey('s1', null)).toBeNull();
    for (const st of ['draft_ready', 'user_edited', 'finalized']) {
      expect(appendixPrewarmKey('s1', { status: st, answers_fingerprint: 'abc' })).toBe('s1:draft:abc');
    }
  });
  it('a re-refined chart (new fingerprint) yields a new key, a legacy chart a stable one', () => {
    expect(appendixPrewarmKey('s1', { status: 'draft_ready', answers_fingerprint: 'v2' })).toBe('s1:draft:v2');
    expect(appendixPrewarmKey('s1', { status: 'draft_ready', answers_fingerprint: null })).toBe('s1:draft:legacy');
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL** (export bestaat nog niet)

- [ ] **Step 3: Herschrijf de hook**

```ts
// src/hooks/useAppendixPrewarm.ts
import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';

/** Keys that already fired, shared across mounts (upload, Q&A, confirmation). */
const prewarmedKeys = new Set<string>();

/**
 * One appendix generation per refined-chart state. The key includes the
 * chart's answers fingerprint, so a chart that is re-refined on deviating
 * answers automatically fires a fresh generation, while the same chart state
 * never fires twice. The docs-only (phase A) prewarm is gone: its output was
 * never shown as definitive and only cost a duplicate set of model calls.
 */
export function appendixPrewarmKey(
  sessionId: string,
  chart: { status: string | null; answers_fingerprint: string | null } | null,
): string | null {
  const status = chart?.status;
  if (status !== 'draft_ready' && status !== 'user_edited' && status !== 'finalized') return null;
  return `${sessionId}:draft:${chart?.answers_fingerprint ?? 'legacy'}`;
}

export function useAppendixPrewarm(sessionId: string | null | undefined): void {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      try {
        const c = await loadChart(sessionId);
        const key = appendixPrewarmKey(sessionId, c?.chart ?? null);
        if (key && !prewarmedKeys.has(key)) {
          prewarmedKeys.add(key);
          startAppendixGeneration(sessionId).catch(() => {});
        }
      } catch { /* keep polling */ }
      // Keep polling while mounted: a re-refine (deviating answers) produces a
      // new fingerprint and must fire again.
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);
}
```

- [ ] **Step 4: Run** `npx vitest run src/hooks/__tests__/useAppendixPrewarm.test.ts` → PASS.

---

### Task 8: Wachtketen uit `Assessment.tsx`

**Files:**
- Modify: `src/pages/Assessment.tsx` (regel ~1152-1204 in `completeAssessment`)

**Interfaces:**
- Consumes: niets nieuws; de orkestratie is volledig overgenomen door Tasks 6, 7 en 9.

- [ ] **Step 1: Vervang** het blok vanaf het commentaar "Pre-fetch Phase B of the structure-chart extraction" tot en met de afsluitende `})();` van de async closure (regel ~1152-1204) door:

```ts
// The speculative chain (useSpeculativeRefine + useAppendixPrewarm, also
// mounted on the confirmation page) compares the answers fingerprint and
// re-runs the structure refine and appendix generation only when the final
// answers deviate from the suggestions the speculative runs used. The Facts
// page gates on the same fingerprint, so nothing needs to be awaited here.
```

- [ ] **Step 2: Ruim imports op**: verwijder de dan ongebruikte imports `startExtraction`, `loadAppendix`, `pollAppendixUntilReady`, `startAppendixGeneration` en `loadChart` uit `Assessment.tsx` — maar ALLEEN voor zover ze nergens anders in het bestand meer gebruikt worden (grep binnen het bestand; `useAppendixPrewarm`/`useSpeculativeRefine` blijven).

- [ ] **Step 3: Run** `npm run build` + `npx vitest run` → groen.

---

### Task 9: Facts-poortwachter op de bijlage-pagina

**Files:**
- Create: `src/lib/appendix/factsGate.ts`
- Test: `src/lib/appendix/__tests__/factsGate.test.ts`
- Modify: `src/pages/AssessmentAppendix.tsx` (init-effect regel ~98-150 + laad-scherm rond regel ~305)

**Interfaces:**
- Consumes: `currentEffectiveFingerprint` (Task 6), `loadAppendix`, `loadChart`, `startExtraction`, `startAppendixGeneration`, bestaand `isStaleGenerating`.
- Produces: `decideFactsGate(input: FactsGateInput): FactsGateDecision` — pure, getest.

- [ ] **Step 1: Schrijf de falende tests**

```ts
// src/lib/appendix/__tests__/factsGate.test.ts
import { describe, it, expect } from 'vitest';
import { decideFactsGate } from '@/lib/appendix/factsGate';

const base = {
  currentFingerprint: 'fp1',
  chartStatus: 'draft_ready' as string | null,
  chartFingerprint: 'fp1' as string | null,
};
const appendix = (over: Partial<{ generation_status: string; review_status: string; answers_fingerprint: string | null; generatingIsFresh: boolean }> = {}) => ({
  generation_status: 'ready', review_status: 'draft', answers_fingerprint: 'fp1', generatingIsFresh: false, ...over,
});

describe('decideFactsGate', () => {
  it('shows a ready appendix whose fingerprint matches the current answers', () => {
    expect(decideFactsGate({ ...base, appendix: appendix() })).toEqual({ kind: 'show' });
  });
  it('grandfathers a confirmed appendix regardless of fingerprint', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ review_status: 'confirmed', answers_fingerprint: null }) }))
      .toEqual({ kind: 'show' });
  });
  it('waits without action while a fresh generation runs', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ generation_status: 'generating', generatingIsFresh: true, answers_fingerprint: null }) }))
      .toEqual({ kind: 'wait', action: 'none' });
  });
  it('starts a refine when the chart does not carry the current fingerprint', () => {
    expect(decideFactsGate({ ...base, chartFingerprint: 'oud', appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-refine' });
  });
  it('waits without action while the chart is extracting', () => {
    expect(decideFactsGate({ ...base, chartStatus: 'extracting:refining', chartFingerprint: 'oud', appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'none' });
  });
  it('starts the appendix when the chart is current but the appendix is not', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
    expect(decideFactsGate({ ...base, appendix: null }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
  it('a session without any chart skips the chart requirement', () => {
    expect(decideFactsGate({ ...base, chartStatus: null, chartFingerprint: null, appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
  it('an errored generation with a current chart restarts the appendix', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ generation_status: 'error', answers_fingerprint: null }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
});
```

- [ ] **Step 2: Run, verwacht FAIL**

- [ ] **Step 3: Implementeer `src/lib/appendix/factsGate.ts`**

```ts
// Poortwachter van de Facts-pagina: feiten worden pas getoond wanneer de
// opgeslagen bijlage-run de HUIDIGE effectieve antwoorden weerspiegelt.
// Grandfathering: een al bevestigde bijlage (bestaande dossiers, of van vóór
// de fingerprint-kolom) wordt altijd getoond; de gate geldt vóór bevestiging.

export interface FactsGateInput {
  appendix: {
    generation_status: string;
    review_status: string;
    answers_fingerprint: string | null;
    /** isStaleGenerating al toegepast door de aanroeper. */
    generatingIsFresh: boolean;
  } | null;
  currentFingerprint: string;
  chartStatus: string | null;      // null = deze sessie heeft geen chart
  chartFingerprint: string | null;
}

export type FactsGateDecision =
  | { kind: 'show' }
  | { kind: 'wait'; action: 'none' | 'start-refine' | 'start-appendix' };

export function decideFactsGate(i: FactsGateInput): FactsGateDecision {
  const a = i.appendix;
  if (a?.review_status === 'confirmed') return { kind: 'show' };
  if (a && a.generation_status === 'ready' && a.answers_fingerprint === i.currentFingerprint) {
    return { kind: 'show' };
  }
  if (a?.generation_status === 'generating' && a.generatingIsFresh) {
    return { kind: 'wait', action: 'none' };
  }
  const hasChart = i.chartStatus !== null;
  if (hasChart && i.chartFingerprint !== i.currentFingerprint) {
    if (i.chartStatus?.startsWith('extracting')) return { kind: 'wait', action: 'none' };
    return { kind: 'wait', action: 'start-refine' };
  }
  return { kind: 'wait', action: 'start-appendix' };
}
```

- [ ] **Step 4: Run de tests, verwacht PASS**

- [ ] **Step 5: Wire in `AssessmentAppendix.tsx`** — vervang het init-effect (regel ~98-150) door een gate-lus. Behoud `mergeServerUpdate`, `dirtyRowIds` en de bestaande handlers ongewijzigd:

```ts
useEffect(() => {
  if (!sessionId) return;
  let cancelled = false;
  const fired = new Set<string>(); // action-dedup binnen deze mount

  (async () => {
    const deadline = Date.now() + 8 * 60_000;
    try {
      while (!cancelled) {
        const [a, c, fp] = await Promise.all([
          loadAppendix(sessionId),
          loadChart(sessionId).catch(() => null),
          currentEffectiveFingerprint(sessionId),
        ]);
        if (cancelled) return;
        const decision = decideFactsGate({
          appendix: a ? {
            generation_status: a.generation_status,
            review_status: a.review_status,
            answers_fingerprint: a.answers_fingerprint,
            generatingIsFresh: a.generation_status === 'generating' && !isStaleGenerating(a.updated_at),
          } : null,
          currentFingerprint: fp.fingerprint,
          chartStatus: c?.chart?.status ?? null,
          chartFingerprint: c?.chart?.answers_fingerprint ?? null,
        });
        if (decision.kind === 'show') {
          setAppendix(a);
          setPhase(a && a.generation_status !== 'generating' ? a.generation_status : 'ready');
          return;
        }
        setPhase('generating');
        const actionKey = `${decision.action}:${fp.fingerprint}`;
        if (decision.action === 'start-refine' && !fired.has(actionKey)) {
          fired.add(actionKey);
          startExtraction(sessionId, 'refine').catch(() => { /* gate keeps polling */ });
        }
        if (decision.action === 'start-appendix' && !fired.has(actionKey)) {
          fired.add(actionKey);
          startAppendixGeneration(sessionId).catch(() => { /* gate keeps polling */ });
        }
        if (Date.now() > deadline) throw new Error('The appendix did not become ready in time. Retry from this page.');
        await new Promise((r) => setTimeout(r, 4000));
      }
    } catch (e) {
      if (!cancelled) {
        setPhase('error');
        toast.error('Appendix generation failed', { description: String(e) });
      }
    }
  })();

  return () => { cancelled = true; };
}, [sessionId]);
```

Imports toevoegen: `decideFactsGate` uit `@/lib/appendix/factsGate`, `currentEffectiveFingerprint` uit `@/lib/assessment/effectiveAnswersClient`, `loadChart` (bestaat al in dit bestand), `startExtraction` uit `@/lib/structure/extraction`. `pollAppendixUntilReady` blijft in gebruik door `handleRetry`/`handleRecheckRelationships` — niet verwijderen.

- [ ] **Step 6: Wachtstatus-copy**: zoek in dit bestand het laad-/generating-scherm (de branch rond regel ~305, `phase === 'loading' || (phase === 'generating' && !hasContent)`). Zet daar de zichtbare koptekst/omschrijving op: koptekst `Processing your answers`, subtekst `The appendix is being brought in line with the assessment answers. This usually takes a moment.` (Engels, geen em-dash, neutraal). Als de branch een generiek loader-component zonder tekst-props gebruikt, voeg de twee regels tekst direct onder de loader toe in deze branch.

- [ ] **Step 7: Belangrijk gedragsdetail**: door de gate toont de pagina tijdens een verversing GEEN oude inhoud meer vóór de eerste 'show' (voorheen kon `hasContent` verouderde rijen tonen terwijl `refining` liep). Controleer dat de `refining`-banner-logica (regel ~282) blijft compileren; hij wordt na 'show' alleen nog gebruikt door de handmatige Retry/Re-check-flows.

- [ ] **Step 8: Run** `npx vitest run` (incl. bestaande `AssessmentAppendix`/appendix-suites) + `npm run build` → groen. Pas bestaande tests aan die het oude init-gedrag (direct tonen op 'ready') aannemen: die moeten nu een chart+fingerprint-match mocken of de gate-inputs meegeven.

---

### Task 10: Structure-stap raakt de bijlage niet meer

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx` (regel ~186-218, 833, 848, 877)
- Delete: `src/lib/appendix/facts/registerSync.ts`, `src/lib/appendix/__tests__/registerSync.test.ts`

**Interfaces:**
- Consumes: n.v.t. — dit is uitsluitend verwijderen (besluit 2 uit de spec: chart-wijzigingen hebben nergens meer invloed op de bijlage).

- [ ] **Step 1:** Verwijder in `StructureChartStep.tsx`:
  - de functie `maybeResyncAppendix` (regel ~211-218) en alle drie de aanroepen (regel ~833, ~848 en in de onClick op ~877 — daar alleen de aanroep weghalen, de `navigate(...)` blijft);
  - de import van `registerMatchesChart` (regel 38) en de import van `startAppendixGeneration` (regel 36) — `loadAppendix` blijft (de hidden-filter richting bijlage → chart, regel ~196-209, blijft bestaan);
  - `appendixRegisterRef` alleen verwijderen als hij na het schrappen van `maybeResyncAppendix` nergens meer wordt gelezen behálve in het load-effect; in dat geval ook de toewijzing in dat effect schrappen (de `hidden`-verwerking blijft);
  - de nu onjuiste commentaarregels "On leaving this step: ... appendix refresh in the background" (regel ~190-193) vervangen door: `// Chart edits deliberately never touch the appendix (advisor decision, Jul 2026): the appendix is reviewed and confirmed before this step and stays as reviewed.`
  - controleer of `buildEntityRegister` in dit bestand nog ergens anders wordt gebruikt; zo nee, import weghalen.

- [ ] **Step 2:** Verwijder `src/lib/appendix/facts/registerSync.ts` en `src/lib/appendix/__tests__/registerSync.test.ts` (grep eerst repo-breed op `registerMatchesChart` en `registerSync` om zeker te zijn dat er geen andere gebruiker is).

- [ ] **Step 3: Run** `npx vitest run` + `npm run build` → groen.

---

### Task 11: Deploy-script + eindcontrole

**Files:**
- Create: `supabase/deploy/deploy_speculative_appendix.sh`

**Interfaces:**
- Consumes: alle voorgaande tasks.
- Produces: één idempotent VM-script voor de latere deploy (NIET uitvoeren in dit plan).

- [ ] **Step 1: Schrijf het deploy-script** (patroon `deploy_factsheet_phase2.sh`: DASH-pad, rsync incl. `_shared`, restart, verificatie):

```bash
#!/usr/bin/env bash
# Deploy speculatieve bijlage-generatie. Draaien op de VM via az run-command.
# Volgorde: migratie -> edge functions -> (daarna frontend via Azure, apart).
set -euo pipefail

cd /root/atad2-advisor && git pull

# 1. Migratie (idempotent; tabellen zijn van supabase_admin)
docker exec -i $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260714130000_answers_fingerprint_columns.sql

# 2. Edge functions: _shared + extract-structure + generate-appendix (DASH-pad!)
for fn in _shared extract-structure generate-appendix; do
  rsync -av --delete "/root/atad2-advisor/supabase/functions/$fn/" \
    "/root/supabase-docker/volumes/functions/$fn/"
done
docker restart $(docker ps --filter name=supabase-edge-functions -q)
sleep 5

# 3. Verificatie: volledige mappen (les van het prod-incident 7 jul) + md5
for fn in extract-structure generate-appendix; do
  echo "== $fn =="
  ls "/root/atad2-advisor/supabase/functions/$fn" | wc -l
  docker exec $(docker ps --filter name=supabase-edge-functions -q) sh -c "ls /home/deno/functions/$fn | wc -l"
done
md5sum /root/atad2-advisor/supabase/functions/_shared/effectiveAnswers.ts
docker exec $(docker ps --filter name=supabase-edge-functions -q) \
  md5sum /home/deno/functions/_shared/effectiveAnswers.ts
```

- [ ] **Step 2: Eindcontrole van de hele working tree**: `npx vitest run` (volledige suite) en `npm run build` → beide groen. Grep als sluitstuk repo-breed op `phaseA` in `src/hooks/` (mag alleen nog in `phaseAPrewarm.ts` voor de STRUCTURE-prewarm voorkomen, die blijft) en op `maybeResyncAppendix` (0 hits).

- [ ] **Step 3: NIET committen, NIET deployen.** Meld Lennart de teststatus en de latere deploy-volgorde (migratie → edge → frontend).
