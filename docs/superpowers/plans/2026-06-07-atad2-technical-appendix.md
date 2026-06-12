# ATAD2 Technical Appendix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Technical appendix" step between Structure and Report that generates a fixed, article-by-article ATAD2 checklist (art. 2 + art. 12aa-12ag Wet Vpb), lets the advisor review and edit each row with an audit trail, and feeds the confirmed result into the memo.

**Architecture:** A hard-coded skeleton (the legal framework) lives in code. A new Supabase Edge Function fills each row's Decision + Reasoning + Reference from the assessment answers and structure chart, using a versioned prompt in `atad2_prompts`. Rows are stored as structured data in a new `atad2_appendix` table (one current appendix per session) with an append-only `atad2_appendix_edits` change log. A new React step renders an editable table; on confirm, the rows are serialized into a block that the memo n8n payload consumes, and into native Word tables in the combined DOCX.

**Tech Stack:** React + Vite + TypeScript, Vitest 1.6.1, Supabase (self-hosted) Edge Functions (Deno, deno.json import map), Anthropic SDK (`claude-sonnet-4-6`), Zod 3.23.8, docxtemplater (existing DOCX path).

**Source of truth for content:** [docs/technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md) (the exact skeleton rows + the `appendix_system` prompt) and [the design spec](../specs/2026-06-07-atad2-technical-appendix-design.md).

**Ship as 6 PRs (one per phase).** Each phase is independently testable. Do not deploy (commit/push only on explicit request; `main` is live). DB migrations run via `docker exec ... psql -U supabase_admin` on the VM (see CLAUDE.md), never via Supabase CLI.

---

## File Structure

**New files:**
- `src/lib/appendix/types.ts` — shared types: `Decision`, `AppendixRow`, `SkeletonRow`, `StoredAppendix`.
- `src/lib/appendix/skeleton.ts` — the fixed skeleton (the legal framework), one entry per row.
- `src/lib/appendix/skeleton.test.ts` — wait, tests live in `__tests__/`. Use `src/lib/appendix/__tests__/skeleton.test.ts`.
- `src/lib/appendix/merge.ts` — pure functions: `mergeOnRegenerate`, `computeStaleRows`.
- `src/lib/appendix/__tests__/merge.test.ts`
- `src/lib/appendix/buildAppendixBlock.ts` — serialize confirmed rows into the memo-feed block (no Reference column).
- `src/lib/appendix/__tests__/buildAppendixBlock.test.ts`
- `src/lib/appendix/client.ts` — browser-side: load/save/generate/poll appendix via Supabase.
- `src/lib/appendix/appendixDocxSections.ts` — shape confirmed rows into `appendixSections` for docxtemplater (no Reference column).
- `src/lib/appendix/__tests__/appendixDocxSections.test.ts`
- `src/pages/AssessmentAppendix.tsx` — the new step page (load, poll, gate).
- `src/components/appendix/AppendixTable.tsx` — the editable review table.
- `supabase/functions/generate-appendix/index.ts` — generation entry point.
- `supabase/functions/generate-appendix/schemas.ts` — Zod schema for the model output.
- `supabase/functions/generate-appendix/skeletonRows.ts` — Deno copy of the skeleton row ids + driving questions (server needs the id/state set for validation).
- `supabase/functions/generate-appendix/verifyAuth.ts` — copied verbatim from `extract-structure`.
- `supabase/functions/generate-appendix/claude.ts` — copied verbatim from `extract-structure`.
- `supabase/functions/generate-appendix/promptsLoader.ts` — loads `appendix_system`.
- `supabase/functions/generate-appendix/deno.json` — copied verbatim from `extract-structure`.
- `supabase/migrations/<ts>_appendix_tables.sql` — `atad2_appendix` + `atad2_appendix_edits` + prompt key CHECK update.
- `supabase/migrations/<ts>_appendix_prompt_v1.sql` — seed `appendix_system` v1.
- `supabase/migrations/<ts>_memo_prompt_v4_appendix_block.sql` — memo prompt v4 with `{{CONFIRMED_APPENDIX_BLOCK}}`.

**Modified files:**
- `src/integrations/supabase/types.ts` — add `atad2_appendix` and `atad2_appendix_edits` Row/Insert/Update (hand-maintained).
- `src/lib/admin/promptKeys.ts` — add `appendix_system` to `PromptKey`, add `Appendix` to `PromptGroup`, add descriptor.
- `src/lib/assessment/steps.ts` — insert `appendix` step at index 5; update `stepIndexForPath`.
- `src/App.tsx` — add `/assessment-appendix/:sessionId` route.
- `src/components/assessment/AssessmentShell.tsx` — keep `lockedIndexes` correct after the insert.
- `src/components/structure/StructureChartStep.tsx` — `goNext()` navigates to the appendix, not the report.
- `src/pages/AssessmentReport.tsx` — add `confirmed_appendix` to the n8n payload; pass `appendixSections` to the DOCX button.
- `src/components/DownloadMemoButton.tsx` — load confirmed appendix rows and pass `appendixSections` into `doc.render(...)`.
- `templates/memo_atad2_with_structure_placeholder.docx` — add the appendix table loop region (manual Word edit; documented in Task 6.2).

---

## Conventions (from recon, do not deviate)

- **Test command:** `npm run test` (single run, Vitest). Single file: `npm run test -- src/lib/appendix/__tests__/merge.test.ts`. Filter by name: append `-t patternName`.
- **Test location/naming:** `src/lib/<module>/__tests__/<name>.test.ts`. Import `{ describe, it, expect }` from `vitest`. Path alias `@/` = `src/`.
- **Edge function imports:** bare specifiers from `deno.json` only (`anthropic`, `supabase`, `std/http/server.ts`, `zod`). Never full URLs in code.
- **Migrations run on the VM:** `docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql` (via `az vm run-command`, see CLAUDE.md). `-U postgres` fails with "must be owner of table".
- **`types.ts` is hand-maintained** (no Supabase CLI against the self-hosted DB).
- **Decision states** (fixed everywhere): `"Not applicable" | "Potentially applicable" | "Further information needed"`. Gateway rows also allow `"In scope" | "Out of scope"` etc. per the skeleton's `allowedStates`.

---

# Phase 1: Shared types + the fixed skeleton

Pure code, no DB, no network. Fully unit-testable.

### Task 1.1: Appendix types

**Files:**
- Create: `src/lib/appendix/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// src/lib/appendix/types.ts

/** The decision an advisor (or the AI) records per row. Gateway rows use the gateway variants. */
export type Decision =
  | 'Not applicable'
  | 'Potentially applicable'
  | 'Further information needed'
  | 'In scope'
  | 'Out of scope'
  | 'Yes'
  | 'No';

/** A fixed row in the legal framework. Never generated; lives in skeleton.ts. */
export interface SkeletonRow {
  rowId: string;            // e.g. "1.b"
  sectionId: string;        // e.g. "1"
  sectionTitle: string;     // e.g. "Mismatch categories, art. 12aa(1)(a)-(g)"
  legalFramework: string;   // citation + short English label, verbatim
  effect: 'D/NI' | 'DD' | null;
  allowedStates: Decision[];
  drivenByQuestionIds: string[]; // question_ids that, if changed, flag this row stale
  /** Render only when this predicate over the answers map is true. Undefined = always render. */
  renderIfQuestionEquals?: { questionId: string; equals: string };
  flags?: Array<'contested' | 'unverified'>;
}

/** One stored row: the AI output plus the current (possibly edited) value and audit state. */
export interface AppendixRow {
  rowId: string;
  aiDecision: Decision | null;
  aiReasoning: string | null;
  aiReference: string | null;
  decision: Decision | null;     // current; equals ai* until edited
  reasoning: string | null;
  reference: string | null;
  source: 'ai' | 'edited';
  stale: boolean;
  staleReason: string | null;
  editedBy: string | null;       // user id
  editedAt: string | null;       // ISO timestamp
}

export type ReviewStatus = 'draft' | 'confirmed';
export type GenerationStatus = 'generating' | 'ready' | 'error';

/** The atad2_appendix row shape (rows stored as JSONB). */
export interface StoredAppendix {
  id: string;
  session_id: string;
  review_status: ReviewStatus;
  generation_status: GenerationStatus;
  rows: AppendixRow[];
  model: string | null;
  prompt_version: number | null;
  generated_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/appendix/types.ts
git commit -m "feat(appendix): shared types for the technical appendix"
```

---

### Task 1.2: The fixed skeleton (legal framework)

**Files:**
- Create: `src/lib/appendix/skeleton.ts`
- Test: `src/lib/appendix/__tests__/skeleton.test.ts`

The row text is taken verbatim from [docs/technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md). `STANDARD` = the three core states. Gateway rows override `allowedStates`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/appendix/__tests__/skeleton.test.ts
import { describe, it, expect } from 'vitest';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';

describe('APPENDIX_SKELETON', () => {
  it('has unique row ids', () => {
    const ids = APPENDIX_SKELETON.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('covers art. 12aa(1)(a)-(g) as seven rows in section 1', () => {
    const limbs = APPENDIX_SKELETON.filter((r) => r.sectionId === '1').map((r) => r.rowId);
    expect(limbs).toEqual(['1.a', '1.b', '1.c', '1.d', '1.e', '1.f', '1.g']);
  });
  it('only the art. 3 inbound section is conditional on Q2', () => {
    const conditional = APPENDIX_SKELETON.filter((r) => r.renderIfQuestionEquals);
    expect(conditional.every((r) => r.sectionId === '1bis')).toBe(true);
    expect(conditional.every((r) => r.renderIfQuestionEquals?.questionId === 'Q2')).toBe(true);
  });
  it('flags the contested and unverified legal points', () => {
    const byId = Object.fromEntries(APPENDIX_SKELETON.map((r) => [r.rowId, r]));
    expect(byId['1.g'].flags).toContain('contested');     // origin requirement on sub g
    expect(byId['6.1'].flags).toContain('unverified');    // art. 12af lid 2/3
  });
  it('every row has a non-empty legal framework and at least one allowed state', () => {
    for (const r of APPENDIX_SKELETON) {
      expect(r.legalFramework.length).toBeGreaterThan(0);
      expect(r.allowedStates.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/skeleton.test.ts`
Expected: FAIL ("Cannot find module '@/lib/appendix/skeleton'").

- [ ] **Step 3: Write the skeleton**

```typescript
// src/lib/appendix/skeleton.ts
import type { SkeletonRow, Decision } from './types';

const STANDARD: Decision[] = ['Not applicable', 'Potentially applicable', 'Further information needed'];

export const APPENDIX_SKELETON: SkeletonRow[] = [
  // Section 0 - Gateway and scope
  { rowId: '0.1', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Article 2(1) / Article 3 Wet Vpb 1969, subject to Dutch CIT (resident, or non-resident with a Dutch permanent establishment)', effect: null, allowedStates: ['In scope', 'Out of scope', 'Further information needed'], drivenByQuestionIds: ['Q1', 'Q2'] },
  { rowId: '0.2', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Cross-border element present', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q3'] },
  { rowId: '0.3', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Article 12ac jo. Article 10a(6) Wet Vpb 1969, related party (broad associated-enterprise test) or structured arrangement', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '0.4', sectionId: '0', sectionTitle: 'Gateway and scope (art. 2 / art. 3; art. 12ac)', legalFramework: 'Financial year starting on or after 1 Jan 2020 (Article 12ag in force)', effect: null, allowedStates: ['Yes', 'No'], drivenByQuestionIds: [] },

  // Section 1 - Mismatch categories, art. 12aa(1)(a)-(g)
  { rowId: '1.a', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(a) Wet Vpb 1969, hybrid financial instrument or hybrid transfer', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q30', 'Q8', 'Q11'] },
  { rowId: '1.b', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(b) Wet Vpb 1969, payment to a hybrid entity', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q26', 'Q27'] },
  { rowId: '1.c', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(c) Wet Vpb 1969, payment to an entity with permanent establishment(s), allocation conflict', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q12', 'Q13', 'Q14'] },
  { rowId: '1.d', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(d) Wet Vpb 1969, disregarded permanent establishment', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q14', 'Q18b'] },
  { rowId: '1.e', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(e) Wet Vpb 1969, payment by a hybrid entity (disregarded payment)', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q26', 'Q27'] },
  { rowId: '1.f', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment between head office and PE', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q20b', 'Q21b'] },
  { rowId: '1.g', sectionId: '1', sectionTitle: 'Mismatch categories, art. 12aa(1)(a)-(g)', legalFramework: 'Article 12aa(1)(g) Wet Vpb 1969, double deduction', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q19', 'Q4c', 'Q4d'], flags: ['contested'] },

  // Section 1bis - Non-resident with a Dutch PE, art. 3 (render only if Q2 = Yes)
  { rowId: '1bis.1', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Foreign head office inside or outside the EU', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q31'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.2', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(g) Wet Vpb 1969, double deduction at head office and Dutch PE', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q32'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.3', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment to the Dutch PE, included abroad or not', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q33', 'Q34'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },
  { rowId: '1bis.4', sectionId: '1bis', sectionTitle: 'Non-resident taxpayer with a Dutch PE, art. 3', legalFramework: 'Article 12aa(1)(f) Wet Vpb 1969, non-EU PE makes a deemed payment to the Dutch PE', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q35'], renderIfQuestionEquals: { questionId: 'Q2', equals: 'Yes' } },

  // Section 2 - Secondary inclusion rule, art. 12ab (limbs a/b/c/e/f only)
  { rowId: '2.1', sectionId: '2', sectionTitle: 'Secondary inclusion rule, art. 12ab', legalFramework: 'Article 12ab(1) jo. (3) Wet Vpb 1969, NL as recipient state includes income where the payer state does not deny the deduction, only for a limb a/b/c/e/f mismatch (never d, never g)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 3 - Definitions and scope, art. 12ac
  { rowId: '3.1', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Article 12ac Wet Vpb 1969, associated-enterprise / related-party test met (broad: holdings up/down/sister, consolidated group, significant influence, acting together; 25%, raised to 50% for hybrid-entity limbs)', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '3.2', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Article 12ac Wet Vpb 1969, structured arrangement', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q28'] },
  { rowId: '3.3', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Qualification under Dutch standards (FKR comparison method, from 1 Jan 2025)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '3.4', sectionId: '3', sectionTitle: 'Definitions and scope, art. 12ac', legalFramework: 'Dual-inclusion income present', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q4d', 'Q11', 'Q25'] },

  // Section 4 - Imported mismatches, art. 12ad
  { rowId: '4.1', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, NL payment to a related party or under a structured arrangement', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q5', 'Q28'] },
  { rowId: '4.2', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, hybrid mismatch (DD or D/NI) elsewhere in the financing chain', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q9', 'Q10'] },
  { rowId: '4.3', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad Wet Vpb 1969, the NL payment funds that foreign cost (direct/indirect, back-to-back)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q9', 'Q10'] },
  { rowId: '4.4', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12ad(2) Wet Vpb 1969, mismatch not neutralised in any foreign state (carve-out)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q11'] },
  { rowId: '4.5', sectionId: '4', sectionTitle: 'Imported mismatches, art. 12ad', legalFramework: 'Article 12aa/12ab Wet Vpb 1969, already neutralised in NL on the same payment', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 5A - Reverse hybrid, art. 2 (verify live lid)
  { rowId: '5A.1', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), a related participant treats the NL taxpayer as transparent (classification conflict)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q4'], flags: ['unverified'] },
  { rowId: '5A.2', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), deductible payment to that holder, not in its tax base', effect: 'D/NI', allowedStates: STANDARD, drivenByQuestionIds: ['Q4b'] },
  { rowId: '5A.3', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), costs, charges or losses also deducted in the holder’s state', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q4c'] },
  { rowId: '5A.4', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), set off against dual-inclusion income', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: ['Q4d'] },
  { rowId: '5A.5', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), 50% or more of votes, capital or profit held, directly or indirectly, by related parties (the reverse-hybrid test)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q4'] },
  { rowId: '5A.6', sectionId: '5A', sectionTitle: 'Reverse hybrid, art. 2 (verify live lid)', legalFramework: 'Article 2 Wet Vpb 1969 (verify live lid), UCITS/AIF exception, or former open CV whose CIT liability lapsed on 1 Jan 2025 (Wet FKR)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 5B - Dual residence, art. 12ae
  { rowId: '5B.1', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, dual tax residence (the NL taxpayer is also resident elsewhere)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: ['Q29'] },
  { rowId: '5B.2', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, same remunerations, payments, charges or losses deducted in both states', effect: 'DD', allowedStates: STANDARD, drivenByQuestionIds: ['Q29'] },
  { rowId: '5B.3', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae Wet Vpb 1969, set off against dual-inclusion income', effect: null, allowedStates: ['Yes', 'No', 'Further information needed'], drivenByQuestionIds: [] },
  { rowId: '5B.4', sectionId: '5B', sectionTitle: 'Dual residence, art. 12ae', legalFramework: 'Article 12ae(2) Wet Vpb 1969, for an EU Member State the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 6 - Carry-forward of denied deductions, art. 12af
  { rowId: '6.1', sectionId: '6', sectionTitle: 'Carry-forward of denied deductions, art. 12af', legalFramework: 'Article 12af Wet Vpb 1969, earlier-year denial under 12aa(1)(e)/(f)/(g), 12ae, or inclusion under 12ab(1)', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [], flags: ['unverified'] },
  { rowId: '6.2', sectionId: '6', sectionTitle: 'Carry-forward of denied deductions, art. 12af', legalFramework: 'Article 12af Wet Vpb 1969, dual-inclusion income in a later year than the denial', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },

  // Section 7 - Documentation obligation, art. 12ag
  { rowId: '7.1', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag(1) Wet Vpb 1969, within Section 2.2a, financial year from 1 Jan 2020', effect: null, allowedStates: ['Yes', 'No'], drivenByQuestionIds: ['Q1', 'Q2'] },
  { rowId: '7.2', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, inventory per remuneration, payment, deemed payment, charge or loss', effect: null, allowedStates: ['Further information needed', 'Not applicable'], drivenByQuestionIds: [] },
  { rowId: '7.3', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, records show, per item, to what extent and how Section 2.2a applies', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '7.4', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, where a correction is applied, its computation is in the file', effect: null, allowedStates: STANDARD, drivenByQuestionIds: [] },
  { rowId: '7.5', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag Wet Vpb 1969, file producible on request', effect: null, allowedStates: ['Yes', 'Further information needed'], drivenByQuestionIds: [] },
  { rowId: '7.6', sectionId: '7', sectionTitle: 'Documentation obligation, art. 12ag', legalFramework: 'Article 12ag(3) Wet Vpb 1969, checked for a ministerial regulation with extra data fields', effect: null, allowedStates: ['Yes', 'Further information needed'], drivenByQuestionIds: [], flags: ['unverified'] },
];
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/skeleton.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/skeleton.ts src/lib/appendix/__tests__/skeleton.test.ts
git commit -m "feat(appendix): fixed legal-framework skeleton (art 2 + 12aa-12ag)"
```

---

### Task 1.3: Merge + staleness logic (pure)

**Files:**
- Create: `src/lib/appendix/merge.ts`
- Test: `src/lib/appendix/__tests__/merge.test.ts`

These two pure functions encode the user's rule: regeneration refreshes AI values but keeps edited rows; a changed answer flags only the rows that lean on it.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/appendix/__tests__/merge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeOnRegenerate, computeStaleRows } from '@/lib/appendix/merge';
import type { AppendixRow } from '@/lib/appendix/types';

function row(partial: Partial<AppendixRow> & { rowId: string }): AppendixRow {
  return {
    rowId: partial.rowId,
    aiDecision: partial.aiDecision ?? 'Not applicable',
    aiReasoning: partial.aiReasoning ?? 'ai reason',
    aiReference: partial.aiReference ?? 'Q1=Yes',
    decision: partial.decision ?? partial.aiDecision ?? 'Not applicable',
    reasoning: partial.reasoning ?? partial.aiReasoning ?? 'ai reason',
    reference: partial.reference ?? partial.aiReference ?? 'Q1=Yes',
    source: partial.source ?? 'ai',
    stale: partial.stale ?? false,
    staleReason: partial.staleReason ?? null,
    editedBy: partial.editedBy ?? null,
    editedAt: partial.editedAt ?? null,
  };
}

describe('mergeOnRegenerate', () => {
  it('overwrites ai-source rows with fresh AI values', () => {
    const existing = [row({ rowId: '1.b', source: 'ai', decision: 'Not applicable' })];
    const fresh = [row({ rowId: '1.b', aiDecision: 'Potentially applicable', aiReasoning: 'new', aiReference: 'Q26=Yes' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].decision).toBe('Potentially applicable');
    expect(merged[0].reasoning).toBe('new');
    expect(merged[0].source).toBe('ai');
  });
  it('keeps the edited current value but refreshes the ai shadow so drift is visible', () => {
    const existing = [row({ rowId: '1.g', source: 'edited', decision: 'Potentially applicable', reasoning: 'human edit', editedBy: 'u1', editedAt: 't1' })];
    const fresh = [row({ rowId: '1.g', aiDecision: 'Not applicable', aiReasoning: 'fresh ai', aiReference: 'Q19=No' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].decision).toBe('Potentially applicable'); // human value kept
    expect(merged[0].reasoning).toBe('human edit');
    expect(merged[0].aiDecision).toBe('Not applicable');       // ai shadow refreshed
    expect(merged[0].source).toBe('edited');
    expect(merged[0].editedBy).toBe('u1');
  });
  it('adds brand-new fresh rows not present in existing', () => {
    const merged = mergeOnRegenerate([], [row({ rowId: '0.1' })]);
    expect(merged.map((r) => r.rowId)).toContain('0.1');
  });
});

describe('computeStaleRows', () => {
  it('flags only rows whose driving question changed', () => {
    const rows = [
      row({ rowId: '1.b', source: 'ai' }),        // driven by Q26,Q27
      row({ rowId: '1.g', source: 'edited' }),     // driven by Q19,Q4c,Q4d
    ];
    const result = computeStaleRows(rows, ['Q26']);
    const byId = Object.fromEntries(result.map((r) => [r.rowId, r]));
    expect(byId['1.b'].stale).toBe(true);
    expect(byId['1.b'].staleReason).toContain('Q26');
    expect(byId['1.g'].stale).toBe(false);
  });
  it('does not unflag a row that was already stale for another reason', () => {
    const rows = [row({ rowId: '1.b', stale: true, staleReason: 'Q27 changed' })];
    const result = computeStaleRows(rows, []);
    expect(result[0].stale).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/merge.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
// src/lib/appendix/merge.ts
import type { AppendixRow } from './types';
import { APPENDIX_SKELETON } from './skeleton';

const DRIVERS: Record<string, string[]> = Object.fromEntries(
  APPENDIX_SKELETON.map((r) => [r.rowId, r.drivenByQuestionIds]),
);

/**
 * Regeneration rule: ai-source rows take the fresh AI values; edited rows keep their
 * current value but get the fresh AI values copied into the ai* shadow so drift is visible.
 */
export function mergeOnRegenerate(existing: AppendixRow[], fresh: AppendixRow[]): AppendixRow[] {
  const existingById = new Map(existing.map((r) => [r.rowId, r]));
  return fresh.map((f) => {
    const prev = existingById.get(f.rowId);
    if (!prev || prev.source === 'ai') {
      return { ...f, source: 'ai' as const };
    }
    // edited row: keep current value, refresh ai shadow
    return {
      ...prev,
      aiDecision: f.aiDecision,
      aiReasoning: f.aiReasoning,
      aiReference: f.aiReference,
    };
  });
}

/**
 * Mark rows stale when any of their driving questions appears in changedQuestionIds.
 * Never clears an already-stale flag.
 */
export function computeStaleRows(rows: AppendixRow[], changedQuestionIds: string[]): AppendixRow[] {
  const changed = new Set(changedQuestionIds);
  return rows.map((r) => {
    if (r.stale) return r;
    const drivers = DRIVERS[r.rowId] ?? [];
    const hit = drivers.filter((q) => changed.has(q));
    if (hit.length === 0) return r;
    return { ...r, stale: true, staleReason: `Answer(s) ${hit.join(', ')} changed since this row was generated.` };
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/merge.ts src/lib/appendix/__tests__/merge.test.ts
git commit -m "feat(appendix): merge + staleness logic for regenerate and edits"
```

---

# Phase 2: Database schema

DB migrations + hand-maintained types. After writing each migration, apply it on the VM (see command in Conventions).

### Task 2.1: Tables migration

**Files:**
- Create: `supabase/migrations/<ts>_appendix_tables.sql` (name with `date +%Y%m%d%H%M%S` prefix, see existing files).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<ts>_appendix_tables.sql

create table if not exists public.atad2_appendix (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.atad2_sessions(session_id) on delete cascade,
  review_status text not null default 'draft' check (review_status in ('draft','confirmed')),
  generation_status text not null default 'generating' check (generation_status in ('generating','ready','error')),
  rows jsonb not null default '[]'::jsonb,
  model text,
  prompt_version int,
  error_message text,
  generated_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one current appendix per session
create unique index if not exists atad2_appendix_session_uniq on public.atad2_appendix(session_id);

create table if not exists public.atad2_appendix_edits (
  id uuid primary key default gen_random_uuid(),
  appendix_id uuid not null references public.atad2_appendix(id) on delete cascade,
  row_id text not null,
  field text not null check (field in ('decision','reasoning','reference')),
  old_value text,
  new_value text,
  edited_by uuid references auth.users(id),
  edited_at timestamptz not null default now()
);

create index if not exists atad2_appendix_edits_appendix on public.atad2_appendix_edits(appendix_id);

alter table public.atad2_appendix enable row level security;
alter table public.atad2_appendix_edits enable row level security;

-- Owner of the session can read/write its appendix (mirror the policy style used by atad2_answers/atad2_reports).
create policy atad2_appendix_owner on public.atad2_appendix
  for all using (
    exists (select 1 from public.atad2_sessions s where s.session_id = atad2_appendix.session_id and s.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.atad2_sessions s where s.session_id = atad2_appendix.session_id and s.user_id = auth.uid())
  );

create policy atad2_appendix_edits_owner on public.atad2_appendix_edits
  for all using (
    exists (
      select 1 from public.atad2_appendix a join public.atad2_sessions s on s.session_id = a.session_id
      where a.id = atad2_appendix_edits.appendix_id and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.atad2_appendix a join public.atad2_sessions s on s.session_id = a.session_id
      where a.id = atad2_appendix_edits.appendix_id and s.user_id = auth.uid()
    )
  );
```

> **Before writing the RLS policies, verify the exact existing policy expression** on `atad2_reports` / `atad2_answers` by reading the migration that created them (`grep -rl "create policy" supabase/migrations | xargs grep -l atad2_reports`). Match their `auth.uid()` / `user_id` join style precisely. The edge function uses the service role and bypasses RLS, so generation is unaffected; these policies only gate the browser client (load/edit/confirm).

- [ ] **Step 2: Apply on the VM and verify**

Write the SQL to a temp file and run via `az vm run-command` (see CLAUDE.md "Hele flow"). Verify:

```bash
docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -c "\d+ public.atad2_appendix"
```
Expected: table exists with the columns above.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<ts>_appendix_tables.sql
git commit -m "feat(appendix): atad2_appendix + atad2_appendix_edits tables"
```

---

### Task 2.2: Hand-maintained types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Add the two tables to the `Tables` block** (alongside `atad2_answers` etc.), matching the existing Row/Insert/Update style:

```typescript
atad2_appendix: {
  Row: {
    id: string
    session_id: string
    review_status: string
    generation_status: string
    rows: Json
    model: string | null
    prompt_version: number | null
    error_message: string | null
    generated_at: string | null
    confirmed_at: string | null
    confirmed_by: string | null
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    session_id: string
    review_status?: string
    generation_status?: string
    rows?: Json
    model?: string | null
    prompt_version?: number | null
    error_message?: string | null
    generated_at?: string | null
    confirmed_at?: string | null
    confirmed_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    session_id?: string
    review_status?: string
    generation_status?: string
    rows?: Json
    model?: string | null
    prompt_version?: number | null
    error_message?: string | null
    generated_at?: string | null
    confirmed_at?: string | null
    confirmed_by?: string | null
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
atad2_appendix_edits: {
  Row: {
    id: string
    appendix_id: string
    row_id: string
    field: string
    old_value: string | null
    new_value: string | null
    edited_by: string | null
    edited_at: string
  }
  Insert: {
    id?: string
    appendix_id: string
    row_id: string
    field: string
    old_value?: string | null
    new_value?: string | null
    edited_by?: string | null
    edited_at?: string
  }
  Update: {
    id?: string
    appendix_id?: string
    row_id?: string
    field?: string
    old_value?: string | null
    new_value?: string | null
    edited_by?: string | null
    edited_at?: string
  }
  Relationships: []
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: build succeeds (no TS errors).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(appendix): supabase types for appendix tables"
```

---

# Phase 3: Generation (prompt + edge function)

### Task 3.1: Register the prompt key

**Files:**
- Modify: `src/lib/admin/promptKeys.ts`

- [ ] **Step 1: Add `appendix_system` to `PromptKey`, add `'Appendix'` to `PromptGroup`, and add a descriptor.** Read the file first to match the exact descriptor array shape, then add:

```typescript
// in the PromptKey union, add:
  | "appendix_system"

// in the PromptGroup union, add 'Appendix'

// in the descriptors array, add:
{
  key: "appendix_system",
  label: "Technical appendix",
  group: "Appendix",
  placeholders: "{{TAXPAYER_NAME}}, {{FISCAL_YEAR}}, {{SESSION_ID}}, {{SKELETON_ROWS}}, {{ANSWERS_BLOCK}}, {{STRUCTURE_BLOCK}}",
  description: "Fills Decision + Reasoning + Reference per fixed skeleton row for the ATAD2 technical appendix.",
},
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin/promptKeys.ts
git commit -m "feat(appendix): register appendix_system prompt key"
```

---

### Task 3.2: Prompt CHECK constraint + seed migration

**Files:**
- Create: `supabase/migrations/<ts>_appendix_prompt_v1.sql`

The full prompt text is in [docs/technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md) under "Definitieve generatie-prompt". Paste it verbatim between the `$prompt$ ... $prompt$` dollar-quotes.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<ts>_appendix_prompt_v1.sql

-- 1. allow the new key (read the current constraint definition first and append, do not drop other keys)
alter table public.atad2_prompts drop constraint if exists atad2_prompts_key_check;
alter table public.atad2_prompts add constraint atad2_prompts_key_check
  check (key in (
    'prefill_swarm_system',
    'structure_stage1_initial','structure_stage1_refine',
    'structure_stage2_initial','structure_stage2_refine',
    'memo_system',
    'appendix_system'
  ));

-- 2. seed v1 active
insert into public.atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
values (
  'appendix_system', 1,
  $prompt$<<PASTE the appendix_system v1 prompt verbatim from docs/technische-bijlage-v1-skelet.md>>$prompt$,
  'claude-sonnet-4-6', 0, 8000, true,
  'v1: fills Decision + Reasoning + Reference per fixed skeleton row. Reference is internal-only.'
);
```

> **Verify the existing key list first:** `docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -c "select conname, pg_get_constraintdef(oid) from pg_constraint where conname='atad2_prompts_key_check';"` and include every existing key in the rewritten constraint.

- [ ] **Step 2: Apply on the VM and verify**

```bash
docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -c "select key, version, model, is_active from atad2_prompts where key='appendix_system';"
```
Expected: one row, version 1, is_active = t.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<ts>_appendix_prompt_v1.sql
git commit -m "feat(appendix): seed appendix_system prompt v1"
```

---

### Task 3.3: The generate-appendix edge function

**Files:**
- Create: `supabase/functions/generate-appendix/{deno.json,verifyAuth.ts,claude.ts}` (copy verbatim from `extract-structure`)
- Create: `supabase/functions/generate-appendix/skeletonRows.ts`
- Create: `supabase/functions/generate-appendix/schemas.ts`
- Create: `supabase/functions/generate-appendix/promptsLoader.ts`
- Create: `supabase/functions/generate-appendix/index.ts`

- [ ] **Step 1: Copy shared helpers verbatim**

```bash
mkdir -p supabase/functions/generate-appendix
cp supabase/functions/extract-structure/deno.json     supabase/functions/generate-appendix/deno.json
cp supabase/functions/extract-structure/verifyAuth.ts supabase/functions/generate-appendix/verifyAuth.ts
cp supabase/functions/extract-structure/claude.ts     supabase/functions/generate-appendix/claude.ts
```

- [ ] **Step 2: Server-side skeleton row ids + allowed states + drivers**

The server needs the rowIds, allowedStates and drivers to validate the model output and to seed empty rows. Mirror `src/lib/appendix/skeleton.ts` but as a minimal Deno module (no React/TS path aliases).

```typescript
// supabase/functions/generate-appendix/skeletonRows.ts
// Keep in sync with src/lib/appendix/skeleton.ts (rowId, allowedStates, drivenByQuestionIds, renderIf).
export interface ServerSkeletonRow {
  rowId: string;
  legalFramework: string;
  allowedStates: string[];
  drivenByQuestionIds: string[];
  renderIfQuestionEquals?: { questionId: string; equals: string };
}
export const SKELETON_ROWS: ServerSkeletonRow[] = [
  // <<COPY every row from src/lib/appendix/skeleton.ts as {rowId, legalFramework, allowedStates, drivenByQuestionIds, renderIfQuestionEquals}. Same 43 rows, same ids.>>
];
```

> To keep the two skeletons from drifting, the implementer copies the 43 entries here. A follow-up (out of scope for v1) could generate this Deno file from the TS skeleton at build time.

- [ ] **Step 3: Output schema (Zod)**

```typescript
// supabase/functions/generate-appendix/schemas.ts
import { z } from 'zod';

export const AppendixModelOutput = z.object({
  rows: z.array(z.object({
    rowId: z.string().min(1),
    decision: z.string().min(1),
    reasoning: z.string().min(1),
    reference: z.string(), // may be empty string
  })).min(1),
});
export type AppendixModelOutputT = z.infer<typeof AppendixModelOutput>;
```

- [ ] **Step 4: Prompt loader**

```typescript
// supabase/functions/generate-appendix/promptsLoader.ts
import type { SupabaseClient } from "supabase";

export interface LoadedAppendixPrompt { systemPrompt: string; model: string; version: number; maxTokens: number; }

export async function loadAppendixPrompt(client: SupabaseClient): Promise<LoadedAppendixPrompt> {
  const { data, error } = await client
    .from("atad2_prompts")
    .select("version, system_prompt, model, max_tokens")
    .eq("key", "appendix_system")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load appendix prompt: ${error.message}`);
  if (!data) throw new Error("No active prompt for 'appendix_system'. Seed migration not run?");
  return { systemPrompt: data.system_prompt as string, model: data.model as string, version: data.version as number, maxTokens: data.max_tokens as number };
}
```

- [ ] **Step 5: The entry point**

```typescript
// supabase/functions/generate-appendix/index.ts
import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AppendixModelOutput } from "./schemas.ts";
import { SKELETON_ROWS } from "./skeletonRows.ts";
import { loadAppendixPrompt } from "./promptsLoader.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface Answer { question_id: string; answer: string; explanation: string | null; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let body: { session_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.session_id) return json({ error: "Missing session_id" }, 400);

  const service = createServiceClient();
  const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, service);
  if (!userId) return json({ error: "Forbidden" }, 403);

  const appendixId = await ensureAppendix(service, body.session_id);

  // already generating? avoid double-run
  const { data: cur } = await service.from("atad2_appendix").select("generation_status").eq("id", appendixId).maybeSingle();
  if (cur?.generation_status === "generating" && await isFresh(service, appendixId)) {
    return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
  }

  await setGenStatus(service, appendixId, "generating", { error_message: null });

  const work = runGeneration(service, appendixId, body.session_id!, userId);
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(work);
  else void work.catch((e) => console.error(JSON.stringify({ level: "error", event: "appendix_bg", message: String(e), appendixId })));

  return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
});

async function ensureAppendix(c: SupabaseClient, sessionId: string): Promise<string> {
  const { data } = await c.from("atad2_appendix").select("id").eq("session_id", sessionId).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins, error } = await c.from("atad2_appendix").insert({ session_id: sessionId, generation_status: "generating", review_status: "draft", rows: [] }).select("id").single();
  if (error) throw error;
  return ins.id as string;
}

async function isFresh(c: SupabaseClient, appendixId: string): Promise<boolean> {
  const { data } = await c.from("atad2_appendix").select("updated_at").eq("id", appendixId).maybeSingle();
  if (!data?.updated_at) return false;
  return (Date.now() - new Date(data.updated_at as string).getTime()) < 90_000;
}

async function setGenStatus(c: SupabaseClient, id: string, status: string, extra: Record<string, unknown> = {}) {
  const { error } = await c.from("atad2_appendix").update({ generation_status: status, updated_at: new Date().toISOString(), ...extra }).eq("id", id);
  if (error) throw error;
}

async function runGeneration(c: SupabaseClient, appendixId: string, sessionId: string, _userId: string) {
  try {
    const prompt = await loadAppendixPrompt(c);

    const { data: session } = await c.from("atad2_sessions").select("taxpayer_name, fiscal_year").eq("session_id", sessionId).maybeSingle();
    const { data: answersRaw } = await c.from("atad2_answers").select("question_id, answer, explanation").eq("session_id", sessionId);
    const answers = (answersRaw ?? []) as Answer[];
    const answersByQ = new Map(answers.map((a) => [a.question_id, a]));

    // Which rows render (1bis only if Q2=Yes)
    const rows = SKELETON_ROWS.filter((r) => {
      if (!r.renderIfQuestionEquals) return true;
      return answersByQ.get(r.renderIfQuestionEquals.questionId)?.answer === r.renderIfQuestionEquals.equals;
    });

    const structureBlock = await loadStructureBlock(c, sessionId);
    const answersBlock = answers.map((a) => `Q${a.question_id} answer: ${a.answer}${a.explanation ? `\n  Explanation: ${a.explanation}` : ""}`).join("\n");
    const skeletonJson = JSON.stringify(rows.map((r) => ({ rowId: r.rowId, legalFramework: r.legalFramework, allowedStates: r.allowedStates })));

    const user = prompt.systemPrompt
      .replace("{{TAXPAYER_NAME}}", session?.taxpayer_name ?? "")
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{SESSION_ID}}", sessionId)
      .replace("{{SKELETON_ROWS}}", skeletonJson)
      .replace("{{ANSWERS_BLOCK}}", answersBlock || "(no answers recorded)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)");

    // single call; retry once on parse/validation failure
    const parsed = await callWithRetry(() => callClaude({ user }));

    // build the stored rows: AI value == current value, source ai
    const byId = new Map(parsed.rows.map((r) => [r.rowId, r]));
    const stored = rows.map((sk) => {
      const m = byId.get(sk.rowId);
      const decisionRaw = m?.decision ?? "Further information needed";
      const decision = sk.allowedStates.includes(decisionRaw) ? decisionRaw : "Further information needed";
      const reasoning = m?.reasoning ?? "The model did not return a grounded answer for this row; confirm manually.";
      const reference = m?.reference ?? "";
      return {
        rowId: sk.rowId,
        aiDecision: decision, aiReasoning: reasoning, aiReference: reference,
        decision, reasoning, reference,
        source: "ai", stale: false, staleReason: null, editedBy: null, editedAt: null,
      };
    });

    // merge: preserve any pre-existing edited rows (regeneration)
    const { data: existing } = await c.from("atad2_appendix").select("rows").eq("id", appendixId).maybeSingle();
    const existingRows = (existing?.rows ?? []) as Array<Record<string, unknown>>;
    const existingById = new Map(existingRows.map((r) => [r.rowId as string, r]));
    const merged = stored.map((fresh) => {
      const prev = existingById.get(fresh.rowId);
      if (!prev || prev.source === "ai") return fresh;
      return { ...prev, aiDecision: fresh.aiDecision, aiReasoning: fresh.aiReasoning, aiReference: fresh.aiReference };
    });

    await c.from("atad2_appendix").update({
      rows: merged, generation_status: "ready",
      model: prompt.model, prompt_version: prompt.version,
      generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", appendixId);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "appendix_generation_failed", message: String(err), appendixId }));
    await setGenStatus(c, appendixId, "error", { error_message: String(err).slice(0, 500) });
  }
}

async function callWithRetry(call: () => Promise<{ text: string }>) {
  try { return AppendixModelOutput.parse(JSON.parse(extractJson((await call()).text))); }
  catch (first) {
    try { return AppendixModelOutput.parse(JSON.parse(extractJson((await call()).text))); }
    catch { throw first; }
  }
}

async function loadStructureBlock(c: SupabaseClient, sessionId: string): Promise<string> {
  const { data: chart } = await c.from("atad2_structure_charts").select("id").eq("session_id", sessionId).maybeSingle();
  if (!chart?.id) return "";
  const { data: ents } = await c.from("atad2_structure_entities").select("id, name, entity_type, jurisdiction_iso, is_taxpayer").eq("chart_id", chart.id);
  const { data: edges } = await c.from("atad2_structure_edges").select("from_entity_id, to_entity_id, ownership_pct, kind").eq("chart_id", chart.id);
  const e = (ents ?? []).map((x: any) => `- ${x.name} [${x.entity_type}, ${x.jurisdiction_iso}${x.is_taxpayer ? ", taxpayer" : ""}]`).join("\n");
  const o = (edges ?? []).map((x: any) => `- ${x.from_entity_id} -> ${x.to_entity_id} (${x.ownership_pct ?? "?"}%, ${x.kind})`).join("\n");
  return `Entities:\n${e}\nEdges:\n${o}`;
}
```

> Note: `callClaude` from the copied `claude.ts` takes `{ cachedSystem?, systemSuffix?, user }`. Here we pass only `user` (the whole filled prompt is the user message). If you prefer caching the fixed instruction block, split the prompt: pass the static instruction as `cachedSystem` and only the per-session data as `user`. Out of scope for v1 correctness.

- [ ] **Step 6: Deploy the function to the VM and smoke test**

Follow CLAUDE.md "Edge functions" deploy (rsync into `/root/supabase-docker/volumes/functions/generate-appendix/`, restart `supabase-edge-functions`, verify md5sum). Then:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/generate-appendix" \
  -H "Authorization: Bearer <a real user JWT>" -H "Content-Type: application/json" \
  -d '{"session_id":"<an existing session>"}'
```
Expected: `{"ok":true,"appendix_id":"...","status":"generating"}`. Then query `select generation_status, jsonb_array_length(rows) from atad2_appendix where session_id='<...>';` and confirm it reaches `ready` with > 0 rows.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/generate-appendix/
git commit -m "feat(appendix): generate-appendix edge function"
```

---

# Phase 4: Browser client + review workspace

### Task 4.1: Browser client (load / generate / poll / save / confirm)

**Files:**
- Create: `src/lib/appendix/client.ts`

- [ ] **Step 1: Implement** (mirror `src/lib/structure/extraction.ts` polling constants and `src/lib/structure/client.ts` query style)

```typescript
// src/lib/appendix/client.ts
import { supabase } from '@/integrations/supabase/client';
import type { StoredAppendix, AppendixRow, GenerationStatus } from './types';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 360_000;
const TERMINAL: GenerationStatus[] = ['ready', 'error'];

export async function loadAppendix(sessionId: string): Promise<StoredAppendix | null> {
  const { data } = await supabase.from('atad2_appendix').select('*').eq('session_id', sessionId).maybeSingle();
  return data ? ({ ...data, rows: (data.rows ?? []) as AppendixRow[] } as StoredAppendix) : null;
}

export async function startAppendixGeneration(sessionId: string): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('generate-appendix', {
    body: { session_id: sessionId },
    headers: { Authorization: `Bearer ${sess.session?.access_token}` },
  });
  if (res.error) throw res.error;
}

export async function pollAppendixUntilReady(
  sessionId: string,
  onUpdate: (a: StoredAppendix) => void,
  signal?: AbortSignal,
): Promise<GenerationStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (true) {
    if (signal?.aborted) throw new Error('aborted');
    if (Date.now() > deadline) throw new Error('appendix generation timed out');
    const a = await loadAppendix(sessionId);
    if (a) { onUpdate(a); if (TERMINAL.includes(a.generation_status)) return a.generation_status; }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Persist one row edit + write the change log. */
export async function saveRowEdit(
  appendixId: string,
  rows: AppendixRow[],
  rowId: string,
  field: 'decision' | 'reasoning' | 'reference',
  oldValue: string | null,
  newValue: string | null,
  userId: string,
): Promise<void> {
  const { error: upErr } = await supabase.from('atad2_appendix').update({ rows, updated_at: new Date().toISOString() }).eq('id', appendixId);
  if (upErr) throw upErr;
  const { error: logErr } = await supabase.from('atad2_appendix_edits').insert({
    appendix_id: appendixId, row_id: rowId, field, old_value: oldValue, new_value: newValue, edited_by: userId,
  });
  if (logErr) throw logErr;
}

export async function confirmAppendix(appendixId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('atad2_appendix').update({
    review_status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: userId, updated_at: new Date().toISOString(),
  }).eq('id', appendixId);
  if (error) throw error;
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npm run build` (Expected: PASS)
```bash
git add src/lib/appendix/client.ts
git commit -m "feat(appendix): browser client (load/generate/poll/save/confirm)"
```

---

### Task 4.2: Routing (insert the step)

**Files:**
- Modify: `src/lib/assessment/steps.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/assessment/AssessmentShell.tsx`

- [ ] **Step 1: Insert the step in `ASSESSMENT_STEPS`** (between `structure` and `report`):

```typescript
export const ASSESSMENT_STEPS: readonly AssessmentStep[] = [
  { key: 'intake',       label: 'Intake',       wide: false, fullBleed: false },
  { key: 'documents',    label: 'Documents',    wide: false, fullBleed: false },
  { key: 'questions',    label: 'Questions',    wide: true,  fullBleed: false },
  { key: 'confirmation', label: 'Confirmation', wide: false, fullBleed: false },
  { key: 'structure',    label: 'Structure',    wide: true,  fullBleed: true  },
  { key: 'appendix',     label: 'Appendix',     wide: true,  fullBleed: false },
  { key: 'report',       label: 'Overview',     wide: false, fullBleed: false },
] as const;
```

- [ ] **Step 2: Update `stepIndexForPath`** (appendix = 5, report = 6):

```typescript
  if (pathname.startsWith('/assessment-confirmation/')) return 3;
  if (pathname.startsWith('/assessment/structure/')) return 4;
  if (pathname.startsWith('/assessment-appendix/')) return 5;
  if (pathname.startsWith('/assessment-report/')) return 6;
  return -1;
```

- [ ] **Step 3: Add the route in `src/App.tsx`** (inside the `AssessmentShell` element block):

```tsx
<Route path="/assessment-appendix/:sessionId" element={<ProtectedRoute><AssessmentAppendix /></ProtectedRoute>} />
```
Add the import: `import AssessmentAppendix from '@/pages/AssessmentAppendix';` (match the existing import style for `AssessmentReport`).

- [ ] **Step 4: Keep the finalized-overview lock correct in `AssessmentShell.tsx`.** Current `lockedIndexes = [0, 1, 2, 3]` locks intake/documents/questions/confirmation; structure (4) and now appendix (5) stay editable on the finalized overview. Leave `[0, 1, 2, 3]` unchanged (the conceptual locked steps are the same). Verify the `onOverview` detection still keys off the report path; report is now index 6.

- [ ] **Step 5: Type-check + commit**

Run: `npm run build` (Expected: PASS, with a temporary stub page in Task 4.3; if building before 4.3, create the page first.)
```bash
git add src/lib/assessment/steps.ts src/App.tsx src/components/assessment/AssessmentShell.tsx
git commit -m "feat(appendix): insert Appendix step between Structure and Report"
```

---

### Task 4.3: The review page + editable table

**Files:**
- Create: `src/components/appendix/AppendixTable.tsx`
- Create: `src/pages/AssessmentAppendix.tsx`
- Modify: `src/components/structure/StructureChartStep.tsx` (navigate to appendix, not report)

- [ ] **Step 1: The table component**

```tsx
// src/components/appendix/AppendixTable.tsx
import { useMemo } from 'react';
import { APPENDIX_SKELETON } from '@/lib/appendix/skeleton';
import type { AppendixRow, SkeletonRow } from '@/lib/appendix/types';

interface Props {
  rows: AppendixRow[];
  showReferences: boolean;
  onEdit: (rowId: string, field: 'decision' | 'reasoning' | 'reference', value: string) => void;
}

export function AppendixTable({ rows, showReferences, onEdit }: Props) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.rowId, r])), [rows]);
  const present = APPENDIX_SKELETON.filter((sk) => byId.has(sk.rowId));
  const sections = useMemo(() => {
    const out: { sectionId: string; sectionTitle: string; items: SkeletonRow[] }[] = [];
    for (const sk of present) {
      let s = out.find((x) => x.sectionId === sk.sectionId);
      if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, items: [] }; out.push(s); }
      s.items.push(sk);
    }
    return out;
  }, [present]);

  return (
    <div className="space-y-8">
      {sections.map((sec) => (
        <section key={sec.sectionId}>
          <h3 className="text-sm font-semibold mb-2">Section {sec.sectionId} — {sec.sectionTitle}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted text-left">
                <th className="p-2 w-12">#</th>
                <th className="p-2">Legal framework</th>
                <th className="p-2 w-44">Decision</th>
                <th className="p-2">Reasoning</th>
                {showReferences && <th className="p-2 w-48 bg-indigo-50">Reference (internal)</th>}
                <th className="p-2 w-20">Source</th>
              </tr>
            </thead>
            <tbody>
              {sec.items.map((sk) => {
                const row = byId.get(sk.rowId)!;
                return (
                  <tr key={sk.rowId} className={row.stale ? 'border-l-4 border-amber-500 align-top' : 'align-top border-b'}>
                    <td className="p-2">{sk.rowId}</td>
                    <td className="p-2">
                      {sk.legalFramework}
                      {sk.flags?.includes('contested') && <span className="ml-1 text-xs text-purple-700">[contested]</span>}
                      {sk.flags?.includes('unverified') && <span className="ml-1 text-xs text-purple-700">[unverified]</span>}
                      {row.stale && <div className="mt-1 inline-block text-xs bg-amber-100 text-amber-800 px-1.5 rounded">review again</div>}
                    </td>
                    <td className="p-2">
                      <select
                        className="border rounded px-1 py-0.5 w-full"
                        value={row.decision ?? ''}
                        onChange={(e) => onEdit(sk.rowId, 'decision', e.target.value)}
                      >
                        {sk.allowedStates.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <textarea
                        className="border rounded w-full px-1 py-0.5"
                        rows={2}
                        value={row.reasoning ?? ''}
                        onChange={(e) => onEdit(sk.rowId, 'reasoning', e.target.value)}
                      />
                    </td>
                    {showReferences && (
                      <td className="p-2 bg-indigo-50/40 text-muted-foreground">{row.reference}</td>
                    )}
                    <td className="p-2 text-xs">{row.source === 'edited'
                      ? <span className="bg-blue-100 text-blue-800 px-1.5 rounded">edited</span>
                      : <span className="text-muted-foreground">AI</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: The page** (generate-on-first-visit, poll, edit with debounce-to-DB, confirm gate, draft banner)

```tsx
// src/pages/AssessmentAppendix.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth'; // confirm the actual auth hook name/path used elsewhere
import { AppendixTable } from '@/components/appendix/AppendixTable';
import {
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix,
} from '@/lib/appendix/client';
import type { StoredAppendix, AppendixRow } from '@/lib/appendix/types';

export default function AssessmentAppendix() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appendix, setAppendix] = useState<StoredAppendix | null>(null);
  const [status, setStatus] = useState<'loading' | 'generating' | 'ready' | 'error'>('loading');
  const [showRefs, setShowRefs] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const ac = new AbortController();
    abortRef.current = ac;
    (async () => {
      let a = await loadAppendix(sessionId);
      if (!a) { await startAppendixGeneration(sessionId); a = await loadAppendix(sessionId); }
      if (cancelled) return;
      if (a) { setAppendix(a); setStatus(a.generation_status); }
      if (!a || a.generation_status === 'generating') {
        try {
          await pollAppendixUntilReady(sessionId, (upd) => { if (!cancelled) { setAppendix(upd); setStatus(upd.generation_status); } }, ac.signal);
        } catch (e) { if (!cancelled) { setStatus('error'); toast.error('Appendix generation failed', { description: String(e) }); } }
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [sessionId]);

  const handleEdit = async (rowId: string, field: 'decision' | 'reasoning' | 'reference', value: string) => {
    if (!appendix || !user) return;
    const idx = appendix.rows.findIndex((r) => r.rowId === rowId);
    if (idx < 0) return;
    const old = appendix.rows[idx];
    const oldValue = (old[field] as string) ?? '';
    const updatedRow: AppendixRow = { ...old, [field]: value, source: 'edited', editedBy: user.id, editedAt: new Date().toISOString() };
    const rows = appendix.rows.map((r, i) => (i === idx ? updatedRow : r));
    setAppendix({ ...appendix, rows }); // optimistic
    try { await saveRowEdit(appendix.id, rows, rowId, field, oldValue, value, user.id); }
    catch (e) { toast.error('Could not save edit', { description: String(e) }); }
  };

  const handleConfirm = async () => {
    if (!appendix || !user || !sessionId) return;
    try { await confirmAppendix(appendix.id, user.id); navigate(`/assessment-report/${sessionId}`); }
    catch (e) { toast.error('Could not confirm', { description: String(e) }); }
  };

  if (status === 'loading' || status === 'generating') {
    return <div className="p-8 text-sm text-muted-foreground">Generating the technical appendix… this runs in the background and can take a minute.</div>;
  }
  if (status === 'error' || !appendix) {
    return (
      <div className="p-8 space-y-3">
        <p className="text-sm text-red-600">Appendix generation failed.</p>
        <button className="border rounded px-3 py-1.5" onClick={() => sessionId && startAppendixGeneration(sessionId).then(() => location.reload())}>Try again</button>
      </div>
    );
  }

  const needReview = appendix.rows.filter((r) => r.stale).length;
  return (
    <div className="p-6 space-y-4">
      <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-900">
        <strong>Draft, pending tax review.</strong> Legal points (related-party threshold, post-FKR article numbers) not yet signed off. This banner also appears on the export.
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">{appendix.rows.length} rows{needReview > 0 ? ` · ${needReview} need review` : ''}</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1"><input type="checkbox" checked={showRefs} onChange={(e) => setShowRefs(e.target.checked)} /> Show references (internal)</label>
        <button className="bg-blue-600 text-white rounded px-3 py-1.5" onClick={handleConfirm}>Confirm appendix →</button>
      </div>
      <AppendixTable rows={appendix.rows} showReferences={showRefs} onEdit={handleEdit} />
    </div>
  );
}
```

> Confirm the real auth hook (`useAuth` path) and toast import by grepping an existing page (e.g. `AssessmentReport.tsx`) — match exactly. The `select`/`textarea`/`button` are plain elements; swap for the project's shadcn/ui components (`Select`, `Textarea`, `Button`) to match house style by reading an existing form page.

- [ ] **Step 3: Route Structure → Appendix.** In `src/components/structure/StructureChartStep.tsx`, the `goNext()` currently ends with `navigate(`/assessment-report/${sessionId}`)`. Change that one line to:

```typescript
    navigate(`/assessment-appendix/${sessionId}`);
```

- [ ] **Step 4: Manual verification (no dev-server automation in plan)**

Run `npm run dev`, walk a session to the end of Structure, click next. Expected: lands on `/assessment-appendix/:id`, shows "Generating…", then the table; editing a Decision flips Source to "edited"; "Confirm appendix" navigates to the report.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AssessmentAppendix.tsx src/components/appendix/AppendixTable.tsx src/components/structure/StructureChartStep.tsx
git commit -m "feat(appendix): review workspace page + table, wire Structure -> Appendix"
```

---

# Phase 5: Feed the memo

### Task 5.1: Serialize confirmed rows into a memo-feed block

**Files:**
- Create: `src/lib/appendix/buildAppendixBlock.ts`
- Test: `src/lib/appendix/__tests__/buildAppendixBlock.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/appendix/__tests__/buildAppendixBlock.test.ts
import { describe, it, expect } from 'vitest';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, decision: string, reasoning: string): AppendixRow => ({
  rowId, aiDecision: decision as any, aiReasoning: reasoning, aiReference: 'Q1=Yes',
  decision: decision as any, reasoning, reference: 'Q1=Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixBlock', () => {
  it('emits one line per row with rowId, decision and reasoning, and never the reference', () => {
    const out = buildAppendixBlock([row('1.b', 'Not applicable', 'No hybrid entity.')]);
    expect(out).toContain('1.b');
    expect(out).toContain('Not applicable');
    expect(out).toContain('No hybrid entity.');
    expect(out).not.toContain('Q1=Yes'); // reference is internal, never fed to the memo
  });
  it('wraps in a labelled block for the n8n payload', () => {
    const out = buildAppendixBlock([row('1.b', 'Not applicable', 'x')]);
    expect(out.startsWith('<confirmed_appendix>')).toBe(true);
    expect(out.trim().endsWith('</confirmed_appendix>')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npm run test -- src/lib/appendix/__tests__/buildAppendixBlock.test.ts` → FAIL.

- [ ] **Step 3: Implement** (mirror the XML-block style of `buildDocumentsBlock.ts`; escape angle brackets in text):

```typescript
// src/lib/appendix/buildAppendixBlock.ts
import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow } from './types';

const LABEL = new Map(APPENDIX_SKELETON.map((r) => [r.rowId, r.legalFramework]));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Confirmed rows as a grounded block for the memo prompt. Reference is intentionally omitted. */
export function buildAppendixBlock(rows: AppendixRow[]): string {
  const lines = rows.map((r) => {
    const fw = LABEL.get(r.rowId) ?? r.rowId;
    return `- [${r.rowId}] ${esc(fw)} :: ${esc(r.decision ?? '')} :: ${esc(r.reasoning ?? '')}`;
  });
  return `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>`;
}
```

- [ ] **Step 4: Run, verify pass.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/buildAppendixBlock.ts src/lib/appendix/__tests__/buildAppendixBlock.test.ts
git commit -m "feat(appendix): build confirmed-appendix block for the memo"
```

---

### Task 5.2: Send the block in the memo payload + memo prompt v4

**Files:**
- Modify: `src/pages/AssessmentReport.tsx`
- Create: `supabase/migrations/<ts>_memo_prompt_v4_appendix_block.sql`
- Manual: n8n "Build prompt + metrics" node

- [ ] **Step 1: Load the confirmed appendix and add it to the n8n payload.** In `AssessmentReport.tsx`, before the `fetch(... /atad2/generate-report ...)` call, load the appendix and build the block:

```typescript
import { loadAppendix } from '@/lib/appendix/client';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
// ...
const appendix = await loadAppendix(sessionId);
const confirmedAppendix = appendix && appendix.review_status === 'confirmed'
  ? buildAppendixBlock(appendix.rows)
  : null;
```
Then add `confirmed_appendix: confirmedAppendix,` to the `JSON.stringify({ ... })` payload object (alongside `documents_block`).

- [ ] **Step 2: Memo prompt v4 migration** (adds `{{CONFIRMED_APPENDIX_BLOCK}}`). Copy v3's full text, insert the new placeholder near `{{DOCUMENTS_BLOCK_FORMATTED}}` with an instruction to base the technical assessment on it and never contradict it, set v3 inactive, insert v4 active:

```sql
-- supabase/migrations/<ts>_memo_prompt_v4_appendix_block.sql
update atad2_prompts set is_active = false where key = 'memo_system' and is_active = true;
insert into atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
values (
  'memo_system', 4,
  $memo$<<v3 text verbatim, plus near the documents block:
"{{CONFIRMED_APPENDIX_BLOCK}}
The confirmed technical appendix above is authoritative. Base the ATAD2 technical assessment on it and do not contradict any of its conclusions. Continue to use plain language and do not cite article numbers in the memo body.">>$memo$,
  'claude-opus-4-7', 0, 16000, true,
  'v4: feed the confirmed technical appendix into the memo via {{CONFIRMED_APPENDIX_BLOCK}}; memo must not contradict it.'
);
```

- [ ] **Step 3: n8n node (manual).** In n8n at https://n8n.atad2.tax, open the workflow behind `/webhook/atad2/generate-report`, node "Build prompt + metrics". Read `confirmed_appendix` from the incoming JSON and replace `{{CONFIRMED_APPENDIX_BLOCK}}` with it (or empty string if null), the same way `documents_block` fills `{{DOCUMENTS_BLOCK_FORMATTED}}`. Save and activate.

- [ ] **Step 4: Apply the v4 migration on the VM, then end-to-end check.** Generate a memo for a session that has a confirmed appendix; confirm the memo's technical section reflects the appendix decisions and still cites no article numbers.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AssessmentReport.tsx supabase/migrations/<ts>_memo_prompt_v4_appendix_block.sql
git commit -m "feat(appendix): feed confirmed appendix into the memo (payload + prompt v4)"
```

---

# Phase 6: Combined DOCX (memo + appendix tables)

### Task 6.1: Shape rows into docxtemplater sections

**Files:**
- Create: `src/lib/appendix/appendixDocxSections.ts`
- Test: `src/lib/appendix/__tests__/appendixDocxSections.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/appendix/__tests__/appendixDocxSections.test.ts
import { describe, it, expect } from 'vitest';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string): AppendixRow => ({
  rowId, aiDecision: 'Not applicable', aiReasoning: 'r', aiReference: 'Q1=Yes',
  decision: 'Not applicable', reasoning: 'r', reference: 'Q1=Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('toAppendixSections', () => {
  it('groups rows by section and drops the reference field', () => {
    const secs = toAppendixSections([row('1.a'), row('1.b'), row('2.1')]);
    const s1 = secs.find((s) => s.sectionId === '1')!;
    expect(s1.rows.length).toBe(2);
    expect(JSON.stringify(secs)).not.toContain('Q1=Yes'); // reference excluded from export
    expect(s1.rows[0]).toHaveProperty('code');
    expect(s1.rows[0]).toHaveProperty('legalFramework');
    expect(s1.rows[0]).toHaveProperty('decision');
    expect(s1.rows[0]).toHaveProperty('reasoning');
    expect(s1.rows[0]).not.toHaveProperty('reference');
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```typescript
// src/lib/appendix/appendixDocxSections.ts
import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow } from './types';

export interface AppendixDocxRow { code: string; legalFramework: string; decision: string; reasoning: string; }
export interface AppendixDocxSection { sectionId: string; sectionTitle: string; rows: AppendixDocxRow[]; }

const META = new Map(APPENDIX_SKELETON.map((r) => [r.rowId, r]));

export function toAppendixSections(rows: AppendixRow[]): AppendixDocxSection[] {
  const out: AppendixDocxSection[] = [];
  for (const sk of APPENDIX_SKELETON) {
    const r = rows.find((x) => x.rowId === sk.rowId);
    if (!r) continue;
    let s = out.find((x) => x.sectionId === sk.sectionId);
    if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, rows: [] }; out.push(s); }
    s.rows.push({
      code: sk.rowId,
      legalFramework: META.get(sk.rowId)!.legalFramework,
      decision: r.decision ?? '',
      reasoning: r.reasoning ?? '',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass. Commit.**

```bash
git add src/lib/appendix/appendixDocxSections.ts src/lib/appendix/__tests__/appendixDocxSections.test.ts
git commit -m "feat(appendix): shape rows into docx sections (reference excluded)"
```

---

### Task 6.2: Render the appendix tables in the combined DOCX

**Files:**
- Modify: `templates/memo_atad2_with_structure_placeholder.docx` (manual Word edit)
- Modify: `src/components/DownloadMemoButton.tsx`

- [ ] **Step 1: Edit the template (manual).** Open `templates/memo_atad2_with_structure_placeholder.docx` in Word. After the memo body, add a heading "Technical appendix (technische bijlage)" and a docxtemplater table loop. Using the existing `{{ }}` delimiters and `paragraphLoop: true`, author a section + table loop:

```
{{#appendixSections}}
  Section {{sectionId}} — {{sectionTitle}}
  [Word table with a header row: #  | Legal framework | Decision | Reasoning ]
  [and a data row inside: {{#rows}} {{code}} | {{legalFramework}} | {{decision}} | {{reasoning}} {{/rows}} ]
{{/appendixSections}}
```
Save. (docxtemplater renders table-row loops when the `{{#rows}}`/`{{/rows}}` tags sit in the table's row cells; see docxtemplater "loop over table rows".)

- [ ] **Step 2: Pass the data in `DownloadMemoButton.tsx`.** Load the confirmed appendix and pass `appendixSections` into the existing `doc.render(...)` call:

```typescript
import { loadAppendix } from '@/lib/appendix/client';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
// ... where sessionId is available, before doc.render:
const appendix = await loadAppendix(sessionId);
const appendixSections = appendix && appendix.review_status === 'confirmed'
  ? toAppendixSections(appendix.rows)
  : [];
// then:
doc.render({
  ...docxData,
  structureChart: structureChartBase64 ?? '',
  hasStructureChart,
  appendixSections,
});
```

> The `dotParser` already applies `htmlToDocxFormatting` to string values, so plain text in `decision`/`reasoning` renders fine. No new dependency.

- [ ] **Step 3: Manual verification.** Download the DOCX for a session with a confirmed appendix. Expected: the memo, then the appendix as native Word tables, one per section, with columns #, Legal framework, Decision, Reasoning, and NO Reference column. Sessions without a confirmed appendix produce the memo with an empty appendix loop (no tables), unchanged behavior.

- [ ] **Step 4: Commit**

```bash
git add src/components/DownloadMemoButton.tsx templates/memo_atad2_with_structure_placeholder.docx
git commit -m "feat(appendix): render appendix tables in the combined memo DOCX"
```

---

## Self-Review (run before handing off)

- **Spec coverage:** §3 flow → Phase 4 (routing/page). §4 data model → Phase 1 (types/skeleton) + Phase 2 (tables). §5 generation → Phase 3. §6 review UI → Phase 4. §7 feed memo → Phase 5. §8 staleness → Task 1.3 + edit flow. §9 permissions → RLS in Task 2.1 (no admin role). §10 errors → edge function error status + page error state. §11 review gate → draft banner in page (Task 4.3) + DOCX banner carried by memo template. §12 testing → unit tests in 1.2/1.3/5.1/6.1. §13 out-of-scope honored (structured rows, no remark-gfm; one combined DOCX via docxtemplater loop). All covered.
- **Open verification points (must be checked during implementation, called out inline above):** exact RLS policy expression on `atad2_reports` (Task 2.1 Step 1 note); the real auth hook path and shadcn components (Task 4.3 note); the existing `atad2_prompts_key_check` key list (Task 3.2 note); docxtemplater table-row loop authoring (Task 6.2).
- **Legal sign-off gate:** the "Draft, pending tax review" banner stays until the points in [the plan §8.1](../../technische-bijlage-plan.md) are signed off (R1/R2 25%-vs-50%, R3 12ab a/b/c/e/f only, R4 12ae losses, R5 12af lid 2/3, R6 art. 2 lidnummers, R7 oorsprongseis sub g). These are content-review items, not code blockers.

---

## Notes for the implementer

- Keep `src/lib/appendix/skeleton.ts` and `supabase/functions/generate-appendix/skeletonRows.ts` in sync (same rowIds, allowedStates, drivers, renderIf). They are two runtimes (Vite TS vs Deno) so the data is duplicated by design in v1.
- The edge function uses the service role and bypasses RLS; the browser client relies on the RLS policies from Task 2.1. Test both: generation works headless; load/edit/confirm work as the signed-in owner only.
- Do not auto-deploy. DB migrations and edge-function deploys go to the VM via `az vm run-command` exactly as CLAUDE.md describes; the frontend deploys only via Azure App Service on an explicit push to `main`.
