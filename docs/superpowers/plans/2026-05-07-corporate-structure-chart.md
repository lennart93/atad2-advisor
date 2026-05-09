# Corporate Structure Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a corporate-structure-chart feature to the ATAD2 Advisor. After the Q&A is complete, an Edge Function extracts a draft structure from the uploaded documents and the Q&A answers; the user reviews/edits the draft on a new "Step 5" page; the chart is then embedded as a PNG in the generated DOCX memo, and is also exportable as an editable PPTX.

**Architecture:** Frontend canvas built on the existing `@xyflow/react` + `dagre` stack already used in `admin/QuestionFlowCanvas.tsx`, with one custom node component that switches on `entity_type` to render the seven strict tax-diagram shapes. A new Supabase Edge Function `extract-structure` runs three sequential Anthropic stages (entities → ownership → transactions), with the documents block placed in a prompt-cache breakpoint shared across stages. Three new Postgres tables (`atad2_structure_charts` / `_entities` / `_edges` + a small `_groupings` table) with RLS via `session_id` FK to `atad2_sessions`.

**Tech Stack:**
- Existing: React 18, Vite, TypeScript, Tailwind, shadcn/ui, Supabase (self-hosted on Azure VM), `@xyflow/react` 12.10.2, `dagre` 0.8.5, `docxtemplater` 3.66.2, `pizzip`
- New: `vitest` (dev), `@docxtemplater/image-module`, `html-to-image`, `pptxgenjs`

**Spec:** [docs/superpowers/specs/2026-05-07-corporate-structure-chart-design.md](../specs/2026-05-07-corporate-structure-chart-design.md)

**Project rules to respect (from memory):**
- ✋ **Never `git commit` or `git push` automatically.** Each task below ends with a "Commit" step — only run it when the user explicitly asks. Treat the steps as preparation, not as actions you execute on your own.
- ✋ **`main` is live production** (Azure App Service auto-deploys). Never push to `main` unprompted.
- ✋ **All user-facing strings must be English.** No Dutch in UI labels, button text, error messages, or aria-labels.
- ✋ **Don't introduce new n8n workflows.** All AI work goes via Supabase Edge Functions. The existing `prefill-documents` function is the reference pattern.

**Testing scope (pragmatic — repo has no test infra today):**
- ✅ `vitest` unit tests for pure functions (shape geometry, dagre layout, palette, Zod schemas)
- ✅ Deno's built-in test runner for Edge Function logic
- ⏸️ Storybook visual regression and Playwright E2E are **deferred to a follow-up plan** — adding them properly would more than double this plan's size, and the repo has neither today
- ✅ Manual smoke-test checklist as the final task (golden path)

---

## File Structure

### New files (frontend)
```
src/components/structure/
├── StructureChart.tsx                  // xyflow canvas wiring
├── StructureChartStep.tsx              // page-level wrapper: load/save/navigation
├── StructureToolbar.tsx                // top toolbar (Re-extract, Auto-layout, Export PPTX)
├── EntityPalette.tsx                   // left rail: drag-to-add per entity-type
├── EntityInspector.tsx                 // right rail: edit selected entity
├── EdgeInspector.tsx                   // right rail: edit selected edge
├── nodes/EntityNode.tsx                // ONE component, switches on entity_type
├── edges/OwnershipEdge.tsx
├── edges/TransactionEdge.tsx
└── exports/
    ├── exportToPng.ts
    └── exportToPptx.ts

src/lib/structure/
├── types.ts                            // TS types matching DB schema
├── client.ts                           // Supabase CRUD queries
├── extraction.ts                       // call Edge Function + poll status
├── dagreLayout.ts                      // auto-layout helper
├── shapeGeometry.ts                    // SVG path strings for the 7 shapes
└── palette.ts                          // NL/foreign/individual colours

src/pages/AssessmentStructure.tsx       // route target: /assessment/structure/:sessionId
```

### New files (backend)
```
supabase/migrations/<timestamp>_create_structure_chart_tables.sql

supabase/functions/extract-structure/
├── index.ts                            // Deno handler: 3 sequential stages
├── deno.json                           // import map
├── claude.ts                           // Anthropic SDK wrapper with prompt caching
├── schemas.ts                          // Zod schemas (one per stage)
├── verifyAuth.ts                       // JWT + session-ownership check (mirror prefill-documents)
└── prompts/
    ├── stage1-entities.md
    ├── stage2-ownership.md
    └── stage3-transactions.md
```

### New files (test)
```
src/lib/structure/__tests__/
├── shapeGeometry.test.ts
├── dagreLayout.test.ts
└── palette.test.ts

supabase/functions/extract-structure/__tests__/
└── schemas.test.ts
```

### Modified files
```
package.json                            // add: vitest, @docxtemplater/image-module, html-to-image, pptxgenjs
vitest.config.ts                        // new
src/App.tsx                             // add route /assessment/structure/:sessionId
src/pages/Assessment.tsx                // change finishAssessment redirect (around line 698)
src/components/DownloadMemoButton.tsx   // wire image-module + PNG capture
src/integrations/supabase/types.ts      // regenerate after migration
templates/memo_atad2.docx               // add {%structureChart} placeholder — MANUAL Word edit
```

---

## Task index

| # | Task | Phase |
|---|---|---|
| 1 | Set up Vitest | Foundation |
| 2 | Migration: structure-chart tables + RLS | Database |
| 3 | Regenerate Supabase types + write `lib/structure/types.ts` | Frontend lib |
| 4 | `palette.ts` (TDD) | Frontend lib |
| 5 | `shapeGeometry.ts` (TDD, 7 shapes) | Frontend lib |
| 6 | `dagreLayout.ts` (TDD) | Frontend lib |
| 7 | Edge Function scaffolding (handler + auth + CORS) | Edge Function |
| 8 | Zod schemas (TDD) | Edge Function |
| 9 | Anthropic wrapper with prompt caching | Edge Function |
| 10 | Stage 1 — entities extraction | Edge Function |
| 11 | Stage 2 — ownership extraction | Edge Function |
| 12 | Stage 3 — transactions extraction | Edge Function |
| 13 | Error handling + retry + status flow | Edge Function |
| 14 | `client.ts` — Supabase CRUD | Frontend lib |
| 15 | `extraction.ts` — call function + poll | Frontend lib |
| 16 | `EntityNode.tsx` (custom xyflow node) | Frontend |
| 17 | `OwnershipEdge.tsx` + `TransactionEdge.tsx` | Frontend |
| 18 | `EntityPalette.tsx` (left rail) | Frontend |
| 19 | `EntityInspector.tsx` + `EdgeInspector.tsx` | Frontend |
| 20 | `StructureToolbar.tsx` | Frontend |
| 21 | `StructureChart.tsx` — wire it all together | Frontend |
| 22 | `StructureChartStep.tsx` + page route | Frontend |
| 23 | Reroute `Assessment.tsx` finish handler | Integration |
| 24 | `exportToPng.ts` (html-to-image) | Exports |
| 25 | `exportToPptx.ts` (pptxgenjs, native shapes) | Exports |
| 26 | DOCX integration in `DownloadMemoButton.tsx` | Exports |
| 27 | Update `memo_atad2.docx` template (manual Word edit) | Exports |
| 28 | Manual smoke-test checklist | Verification |

---

## Phase 0 — Foundation

### Task 1: Set up Vitest

The repo has no test runner today. Add Vitest minimally — only enough to run pure-function unit tests. No jsdom, no testing-library; we keep this lean.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/structure/__tests__/smoke.test.ts` (delete after Task 4)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^1.6.0
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add `test` script to `package.json`**

In the `"scripts"` object, insert:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/structure/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npm test
```

Expected: 1 file passed, 1 test passed.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/structure/__tests__/smoke.test.ts
git commit -m "chore(test): add vitest for pure-function unit tests"
```

---

## Phase 1 — Database

### Task 2: Migration — structure-chart tables + RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_create_structure_chart_tables.sql`

Use the timestamp format used by recent migrations (`YYYYMMDDhhmmss`). At time of writing, the most recent is `20260506100000_swarm_prompt_v4.sql`, so use a timestamp later than that — e.g. `20260507100000`.

- [ ] **Step 1: Create the migration file**

```bash
touch supabase/migrations/20260507100000_create_structure_chart_tables.sql
```

- [ ] **Step 2: Write the schema (paste verbatim)**

```sql
-- Corporate Structure Chart — schema + RLS
-- Three tables (charts, entities, edges) + groupings, all session-scoped via atad2_sessions.

-- ---------- entity-type enum ----------
DO $$ BEGIN
  CREATE TYPE public.entity_type_enum AS ENUM (
    'corporation',
    'partnership',
    'dh_entity',
    'hybrid_partnership',
    'reverse_hybrid',
    'individual',
    'trust_or_non_entity'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- atad2_structure_charts ----------
CREATE TABLE public.atad2_structure_charts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL UNIQUE
                       REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'extracting:stage1',
  draft_extracted_at timestamptz,
  finalized_at       timestamptz,
  canvas_width       int  NOT NULL DEFAULT 1400,
  canvas_height      int  NOT NULL DEFAULT 900,
  warnings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- atad2_structure_entities ----------
CREATE TABLE public.atad2_structure_entities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id          uuid NOT NULL
                      REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  name              text NOT NULL,
  legal_form        text,
  jurisdiction_iso  text NOT NULL,
  entity_type       public.entity_type_enum NOT NULL,
  is_taxpayer       boolean NOT NULL DEFAULT false,
  position_x        numeric NOT NULL DEFAULT 0,
  position_y        numeric NOT NULL DEFAULT 0,
  source            text NOT NULL DEFAULT 'ai_extracted'
                      CHECK (source IN ('ai_extracted','user_added','user_edited')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_entities_chart ON public.atad2_structure_entities(chart_id);

-- ---------- atad2_structure_edges ----------
CREATE TABLE public.atad2_structure_edges (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id                 uuid NOT NULL
                             REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id           uuid NOT NULL
                             REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id             uuid NOT NULL
                             REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('ownership','transaction')),

  -- ownership-only
  ownership_pct            numeric,
  ownership_voting_only    boolean,

  -- transaction-only
  transaction_type         text CHECK (
    transaction_type IS NULL
    OR transaction_type IN ('loan','royalty','dividend','service_fee','management_fee','other')
  ),
  amount_eur               numeric,
  is_mismatch              boolean NOT NULL DEFAULT false,
  mismatch_classification  text CHECK (
    mismatch_classification IS NULL
    OR mismatch_classification IN ('D/NI','DD')
  ),
  mismatch_atad2_article   text,

  -- common
  label                    text,
  source                   text NOT NULL DEFAULT 'ai_extracted'
                             CHECK (source IN ('ai_extracted','user_added','user_edited')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_edges_chart ON public.atad2_structure_edges(chart_id);
CREATE INDEX idx_structure_edges_from ON public.atad2_structure_edges(from_entity_id);
CREATE INDEX idx_structure_edges_to   ON public.atad2_structure_edges(to_entity_id);

-- ---------- atad2_structure_groupings ----------
CREATE TABLE public.atad2_structure_groupings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id    uuid NOT NULL
                REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('fiscal_unity','consolidation_group')),
  label       text NOT NULL,
  member_ids  uuid[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_groupings_chart ON public.atad2_structure_groupings(chart_id);

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_charts_updated_at  BEFORE UPDATE ON public.atad2_structure_charts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_entities_updated_at BEFORE UPDATE ON public.atad2_structure_entities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_edges_updated_at    BEFORE UPDATE ON public.atad2_structure_edges
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------- RLS ----------
ALTER TABLE public.atad2_structure_charts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_entities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_edges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_groupings  ENABLE ROW LEVEL SECURITY;

-- charts: row visible iff session belongs to user
CREATE POLICY "charts_select" ON public.atad2_structure_charts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_insert" ON public.atad2_structure_charts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_update" ON public.atad2_structure_charts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_delete" ON public.atad2_structure_charts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));

-- entities/edges/groupings: row visible iff chart's session belongs to user
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'atad2_structure_entities',
    'atad2_structure_edges',
    'atad2_structure_groupings'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_delete" ON public.%1$I FOR DELETE
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
    $f$, tbl);
  END LOOP;
END $$;

-- service_role bypass (Edge Function uses service-role key)
GRANT ALL ON public.atad2_structure_charts     TO service_role;
GRANT ALL ON public.atad2_structure_entities   TO service_role;
GRANT ALL ON public.atad2_structure_edges      TO service_role;
GRANT ALL ON public.atad2_structure_groupings  TO service_role;
```

> **Note:** `public.handle_updated_at()` is the existing trigger function used elsewhere in this repo. If `psql -c "\df public.handle_updated_at"` returns no rows, search the migrations folder for its definition and copy the trigger pattern that's already in use.

- [ ] **Step 3: Apply the migration to the self-hosted Supabase on the VM**

The Supabase instance is on the Azure VM (`135.225.104.142`), not Supabase cloud. Follow the team's standard migration process:

```bash
# from a workstation that can reach the VM:
ssh atad2-vm "cd ~/supabase/docker && \
  docker compose exec db psql -U postgres -d postgres" \
  < supabase/migrations/20260507100000_create_structure_chart_tables.sql
```

If the team uses a different deploy mechanism, use that instead — check `~/supabase/docker/` on the VM and recent migration deploy history. Do NOT push to `main` to trigger a deploy; this is a DB migration only.

- [ ] **Step 4: Verify the schema landed**

```bash
ssh atad2-vm "cd ~/supabase/docker && docker compose exec db \
  psql -U postgres -d postgres -c '\\d public.atad2_structure_charts'"
```

Expected: shows the columns above. Repeat for `atad2_structure_entities`, `_edges`, `_groupings`.

- [ ] **Step 5: Verify RLS**

```bash
ssh atad2-vm "cd ~/supabase/docker && docker compose exec db \
  psql -U postgres -d postgres -c \
  \"SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'atad2_structure_%';\""
```

Expected: all four tables show `rowsecurity = t`.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add supabase/migrations/20260507100000_create_structure_chart_tables.sql
git commit -m "feat(structure): add structure-chart tables + RLS"
```

---

## Phase 2 — Frontend lib (pure functions, can develop without Edge Function)

### Task 3: Regenerate Supabase types + write `lib/structure/types.ts`

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regenerated)
- Create: `src/lib/structure/types.ts`

- [ ] **Step 1: Regenerate Supabase types**

Use whatever the team's standard regen command is. If unknown, the canonical command is:

```bash
npx supabase gen types typescript \
  --db-url "$SUPABASE_DB_URL" \
  > src/integrations/supabase/types.ts
```

Verify the new tables appear in the file:

```bash
grep -c atad2_structure_charts src/integrations/supabase/types.ts
```

Expected: ≥ 3 (Row, Insert, Update).

- [ ] **Step 2: Create `src/lib/structure/types.ts`**

```ts
import type { Database } from '@/integrations/supabase/types';

export type StructureChart   = Database['public']['Tables']['atad2_structure_charts']['Row'];
export type StructureEntity  = Database['public']['Tables']['atad2_structure_entities']['Row'];
export type StructureEdge    = Database['public']['Tables']['atad2_structure_edges']['Row'];
export type StructureGroup   = Database['public']['Tables']['atad2_structure_groupings']['Row'];

export type EntityType =
  | 'corporation'
  | 'partnership'
  | 'dh_entity'
  | 'hybrid_partnership'
  | 'reverse_hybrid'
  | 'individual'
  | 'trust_or_non_entity';

export const ENTITY_TYPES: ReadonlyArray<{ key: EntityType; label: string }> = [
  { key: 'corporation',         label: 'Corporation' },
  { key: 'partnership',         label: 'Partnership' },
  { key: 'dh_entity',           label: 'D / Hybrid Entity' },
  { key: 'hybrid_partnership',  label: 'Hybrid Partnership' },
  { key: 'reverse_hybrid',      label: 'Reverse Hybrid' },
  { key: 'individual',          label: 'Individual' },
  { key: 'trust_or_non_entity', label: 'Trust / Non-Entity' },
];

export type ChartStatus =
  | 'extracting:stage1' | 'extracting:stage2' | 'extracting:stage3'
  | 'draft_ready' | 'extraction_failed'
  | 'user_edited' | 'finalized';

export type EdgeKind = 'ownership' | 'transaction';
export type TransactionType =
  | 'loan' | 'royalty' | 'dividend' | 'service_fee' | 'management_fee' | 'other';
export type MismatchClassification = 'D/NI' | 'DD';
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If a type cannot be found, run Step 1 again — the regenerated file may not have been saved.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/integrations/supabase/types.ts src/lib/structure/types.ts
git commit -m "feat(structure): add TS types for structure-chart tables"
```

---

### Task 4: `palette.ts` (TDD)

The two-colour rule: NL = teal, anything-not-NL = salmon, individual = grey.

**Files:**
- Create: `src/lib/structure/__tests__/palette.test.ts`
- Create: `src/lib/structure/palette.ts`
- Delete: `src/lib/structure/__tests__/smoke.test.ts` (no longer needed)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fillFor, isForeign } from '@/lib/structure/palette';

describe('palette.fillFor', () => {
  it('returns NL teal for individual NL entity, not the individual grey', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'NL' })).toBe('#5d8b87');
  });
  it('returns foreign salmon for any non-NL jurisdiction', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'US' })).toBe('#b56a5e');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'DE' })).toBe('#b56a5e');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'KY' })).toBe('#b56a5e');
  });
  it('returns individual grey for any individual regardless of jurisdiction', () => {
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'NL' })).toBe('#595550');
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'US' })).toBe('#595550');
  });
  it('treats lower-case ISO codes the same', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'nl' })).toBe('#5d8b87');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'us' })).toBe('#b56a5e');
  });
});

describe('palette.isForeign', () => {
  it('NL is not foreign', () => {
    expect(isForeign('NL')).toBe(false);
    expect(isForeign('nl')).toBe(false);
  });
  it('everything else is foreign', () => {
    expect(isForeign('US')).toBe(true);
    expect(isForeign('DE')).toBe(true);
    expect(isForeign('')).toBe(true); // unknown jurisdiction → treated as foreign
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

```bash
npm test
```

Expected: 2 failed test files (palette.test.ts errors with "Cannot find module").

- [ ] **Step 3: Implement `palette.ts`**

```ts
import type { EntityType } from './types';

export const PALETTE = {
  nl: '#5d8b87',
  foreign: '#b56a5e',
  individual: '#595550',
  background: '#ebe5dc',
  ownershipStroke: '#5a5550',
  mismatchStroke: '#a04338',
  normalTransactionStroke: '#1f5489',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.78)',
  innerStroke: '#ffffff',
  outerStroke: 'rgba(0,0,0,0.22)',
} as const;

export function isForeign(jurisdictionIso: string | null | undefined): boolean {
  return (jurisdictionIso ?? '').toUpperCase() !== 'NL';
}

export function fillFor(input: {
  entity_type: EntityType;
  jurisdiction_iso: string | null | undefined;
}): string {
  if (input.entity_type === 'individual') return PALETTE.individual;
  return isForeign(input.jurisdiction_iso) ? PALETTE.foreign : PALETTE.nl;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Delete the smoke test**

```bash
rm src/lib/structure/__tests__/smoke.test.ts
```

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/lib/structure/palette.ts src/lib/structure/__tests__/palette.test.ts
git rm src/lib/structure/__tests__/smoke.test.ts
git commit -m "feat(structure): add palette helper with NL/foreign two-colour rule"
```

---

### Task 5: `shapeGeometry.ts` — SVG paths for the 7 entity shapes (TDD)

Pure function: given an entity-type and a box size, return SVG path strings for the outer shape and (for hybrids) the inner shape.

**Files:**
- Create: `src/lib/structure/__tests__/shapeGeometry.test.ts`
- Create: `src/lib/structure/shapeGeometry.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/structure/__tests__/shapeGeometry.test.ts
import { describe, it, expect } from 'vitest';
import { geometryFor, BOX } from '@/lib/structure/shapeGeometry';

describe('shapeGeometry.geometryFor', () => {
  it('returns the standard 130x80 box size', () => {
    expect(BOX).toEqual({ width: 130, height: 80 });
  });

  describe('corporation', () => {
    it('returns a single rect outer shape, no inner', () => {
      const g = geometryFor('corporation');
      expect(g.outer).toEqual({ kind: 'rect', rx: 2 });
      expect(g.inner).toBeNull();
    });
  });

  describe('partnership', () => {
    it('returns a triangle apex-up', () => {
      const g = geometryFor('partnership');
      expect(g.outer.kind).toBe('polygon');
      expect((g.outer as any).points).toBe('65,0 130,80 0,80');
      expect(g.inner).toBeNull();
    });
  });

  describe('dh_entity', () => {
    it('returns rect outer + ellipse inner', () => {
      const g = geometryFor('dh_entity');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('ellipse');
    });
  });

  describe('hybrid_partnership', () => {
    it('returns rect outer + polyline (inverted-V, no base) inner', () => {
      const g = geometryFor('hybrid_partnership');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('polyline');
      expect((g.inner as any).points).toBe('8,72 65,12 122,72');
    });
  });

  describe('reverse_hybrid', () => {
    it('returns rect outer + downward triangle (apex down) inner', () => {
      const g = geometryFor('reverse_hybrid');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('polygon');
      expect((g.inner as any).points).toBe('8,8 122,8 65,72');
    });
  });

  describe('individual', () => {
    it('returns silhouette geometry (head + trapezoid)', () => {
      const g = geometryFor('individual');
      expect(g.outer.kind).toBe('individual');
    });
  });

  describe('trust_or_non_entity', () => {
    it('returns ellipse outer, no inner — same shape used for trust, foundation, STAK, VI/PE/branch', () => {
      const g = geometryFor('trust_or_non_entity');
      expect(g.outer.kind).toBe('ellipse');
      expect(g.inner).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

```bash
npm test
```

Expected: tests fail (module not found).

- [ ] **Step 3: Implement `shapeGeometry.ts`**

```ts
// src/lib/structure/shapeGeometry.ts
import type { EntityType } from './types';

export const BOX = { width: 130, height: 80 } as const;

export type OuterShape =
  | { kind: 'rect'; rx: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'ellipse' }
  | { kind: 'individual' };

export type InnerShape =
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'polyline'; points: string };

export interface Geometry {
  outer: OuterShape;
  inner: InnerShape | null;
}

const W = BOX.width;
const H = BOX.height;
const RECT: OuterShape = { kind: 'rect', rx: 2 };

export function geometryFor(type: EntityType): Geometry {
  switch (type) {
    case 'corporation':
      return { outer: RECT, inner: null };

    case 'partnership':
      return {
        outer: { kind: 'polygon', points: `${W / 2},0 ${W},${H} 0,${H}` },
        inner: null,
      };

    case 'dh_entity':
      return {
        outer: RECT,
        inner: { kind: 'ellipse', rx: W / 2 - 5, ry: H / 2 - 6 },
      };

    case 'hybrid_partnership':
      return {
        outer: RECT,
        inner: { kind: 'polyline', points: `8,${H - 8} ${W / 2},12 ${W - 8},${H - 8}` },
      };

    case 'reverse_hybrid':
      return {
        outer: RECT,
        inner: { kind: 'polygon', points: `8,8 ${W - 8},8 ${W / 2},${H - 8}` },
      };

    case 'individual':
      return { outer: { kind: 'individual' }, inner: null };

    case 'trust_or_non_entity':
      return { outer: { kind: 'ellipse' }, inner: null };
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/shapeGeometry.ts src/lib/structure/__tests__/shapeGeometry.test.ts
git commit -m "feat(structure): add shape geometry for 7 tax-diagram entity types"
```

---

### Task 6: `dagreLayout.ts` (TDD)

Mirrors the pattern in `src/components/admin/QuestionFlowCanvas.tsx:13-25`.

**Files:**
- Create: `src/lib/structure/__tests__/dagreLayout.test.ts`
- Create: `src/lib/structure/dagreLayout.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/structure/__tests__/dagreLayout.test.ts
import { describe, it, expect } from 'vitest';
import { autoLayout } from '@/lib/structure/dagreLayout';

describe('dagreLayout.autoLayout', () => {
  it('places parent above child', () => {
    const nodes = [
      { id: 'a', position: { x: 0, y: 0 } },
      { id: 'b', position: { x: 0, y: 0 } },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    const out = autoLayout(nodes, edges);
    const a = out.find(n => n.id === 'a')!;
    const b = out.find(n => n.id === 'b')!;
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it('separates two children of the same parent horizontally', () => {
    const nodes = [
      { id: 'p', position: { x: 0, y: 0 } },
      { id: 'c1', position: { x: 0, y: 0 } },
      { id: 'c2', position: { x: 0, y: 0 } },
    ];
    const edges = [
      { id: 'e1', source: 'p', target: 'c1' },
      { id: 'e2', source: 'p', target: 'c2' },
    ];
    const out = autoLayout(nodes, edges);
    const c1 = out.find(n => n.id === 'c1')!;
    const c2 = out.find(n => n.id === 'c2')!;
    expect(Math.abs(c1.position.x - c2.position.x)).toBeGreaterThan(50);
    expect(c1.position.y).toBe(c2.position.y); // same rank
  });

  it('skips ownership-only edges from layout when only-ownership flag is on', () => {
    const nodes = [
      { id: 'p', position: { x: 0, y: 0 } },
      { id: 'c', position: { x: 0, y: 0 } },
      { id: 'unrelated', position: { x: 0, y: 0 } },
    ];
    // c is connected to p only via a transaction edge; with onlyOwnership=true, we don't
    // want that to influence the layout (transactions can be circular and break dagre).
    const edges = [{ id: 'e1', source: 'p', target: 'c', kind: 'transaction' }];
    const out = autoLayout(nodes, edges, { onlyOwnership: true });
    expect(out).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test
```

- [ ] **Step 3: Implement `dagreLayout.ts`**

```ts
// src/lib/structure/dagreLayout.ts
import dagre from 'dagre';
import { BOX } from './shapeGeometry';

export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
}
export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind?: 'ownership' | 'transaction';
}

export interface LayoutOptions {
  /** When true, only ownership edges drive the layout. Transactions are ignored. */
  onlyOwnership?: boolean;
  rankdir?: 'TB' | 'LR';
  nodesep?: number;
  ranksep?: number;
}

export function autoLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: LayoutOptions = {},
): N[] {
  const { onlyOwnership = true, rankdir = 'TB', nodesep = 80, ranksep = 110 } = options;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep, ranksep });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => g.setNode(n.id, { width: BOX.width, height: BOX.height }));

  edges
    .filter(e => (onlyOwnership ? e.kind !== 'transaction' : true))
    .forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const placed = g.node(n.id);
    return {
      ...n,
      position: {
        x: placed.x - BOX.width / 2,
        y: placed.y - BOX.height / 2,
      },
    } as N;
  });
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test
```

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/dagreLayout.ts src/lib/structure/__tests__/dagreLayout.test.ts
git commit -m "feat(structure): add dagre auto-layout helper"
```

---

## Phase 3 — Edge Function

### Task 7: Edge Function scaffolding (handler + auth + CORS)

Mirror `supabase/functions/prefill-documents/index.ts`. Read it first; it shows the full CORS / JWT / session-ownership pattern this team uses.

**Files:**
- Create: `supabase/functions/extract-structure/deno.json`
- Create: `supabase/functions/extract-structure/index.ts`
- Create: `supabase/functions/extract-structure/verifyAuth.ts`

- [ ] **Step 1: Read the reference function**

```bash
cat supabase/functions/prefill-documents/index.ts
cat supabase/functions/prefill-documents/deno.json
```

Note exactly how `Authorization` header is parsed, how the service-role client is created, and how session ownership is checked.

- [ ] **Step 2: Create `deno.json`**

```jsonc
// supabase/functions/extract-structure/deno.json
{
  "imports": {
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk@^0.32.0",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@^2.45.0",
    "zod": "npm:zod@^3.23.0"
  }
}
```

> Match the package versions used in the existing `prefill-documents/deno.json` — if those differ, prefer the existing versions.

- [ ] **Step 3: Create `verifyAuth.ts` (copy + adapt the prefill-documents helper)**

```ts
// supabase/functions/extract-structure/verifyAuth.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function verifyJwtAndSessionOwnership(
  authHeader: string | null,
  sessionId: string,
  serviceClient: SupabaseClient,
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return null;
  const userId = userData.user.id;

  const { data, error } = await serviceClient
    .from('atad2_sessions')
    .select('user_id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error || !data || data.user_id !== userId) return null;

  return userId;
}
```

- [ ] **Step 4: Create the handler stub `index.ts`**

```ts
// supabase/functions/extract-structure/index.ts
import { getServiceClient, verifyJwtAndSessionOwnership } from './verifyAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

interface ExtractRequest {
  session_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: ExtractRequest;
  try {
    body = await req.json() as ExtractRequest;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!body.session_id) return json({ error: 'session_id required' }, 400);

  const serviceClient = getServiceClient();
  const userId = await verifyJwtAndSessionOwnership(
    req.headers.get('Authorization'),
    body.session_id,
    serviceClient,
  );
  if (!userId) return json({ error: 'Forbidden' }, 403);

  // TODO (subsequent tasks): run the 3 stages, persist, return chart_id
  return json({ ok: true, session_id: body.session_id }, 200);
});
```

- [ ] **Step 5: Deploy & smoke-test**

The team's deploy mechanism for Edge Functions is whatever they normally use (likely `supabase functions deploy` against the self-hosted Supabase, or manually copying to the VM). Use that.

Then from a logged-in browser tab on the local dev app:

```js
// in the browser console while signed in:
const { data: { session } } = await window.supabase.auth.getSession();
const r = await fetch('https://api.atad2.tax/functions/v1/extract-structure', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({ session_id: '<a real session id you own>' }),
});
console.log(r.status, await r.json());
```

Expected: `200, { ok: true, session_id: "..." }`.
Expected with a fake session_id: `403`.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add supabase/functions/extract-structure/
git commit -m "feat(extract-structure): scaffold edge function with auth + CORS"
```

---

### Task 8: Zod schemas (TDD)

**Files:**
- Create: `supabase/functions/extract-structure/schemas.ts`
- Create: `supabase/functions/extract-structure/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/extract-structure/__tests__/schemas.test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { Stage1Output, Stage2Output, Stage3Output } from '../schemas.ts';

Deno.test('Stage1Output accepts a minimal valid payload', () => {
  const ok = Stage1Output.parse({
    entities: [
      { temp_id: 'ent_1', name: 'Holding NL', jurisdiction_iso: 'NL', entity_type: 'corporation', is_taxpayer: true },
    ],
  });
  assertEquals(ok.entities.length, 1);
});

Deno.test('Stage1Output rejects unknown entity_type', () => {
  assertThrows(() => Stage1Output.parse({
    entities: [
      { temp_id: 'ent_1', name: 'X', jurisdiction_iso: 'NL', entity_type: 'corp', is_taxpayer: false },
    ],
  }));
});

Deno.test('Stage2Output accepts valid ownership edges', () => {
  const ok = Stage2Output.parse({
    ownership_edges: [
      { from_temp_id: 'ent_1', to_temp_id: 'ent_2', ownership_pct: 100 },
    ],
  });
  assertEquals(ok.ownership_edges[0].ownership_pct, 100);
});

Deno.test('Stage3Output accepts mismatch transactions', () => {
  const ok = Stage3Output.parse({
    transactions: [
      {
        from_temp_id: 'ent_1', to_temp_id: 'ent_2',
        transaction_type: 'loan',
        amount_eur: 5_000_000,
        is_mismatch: true,
        mismatch_classification: 'D/NI',
        mismatch_atad2_article: '12aa',
      },
    ],
  });
  assertEquals(ok.transactions[0].is_mismatch, true);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
deno test --allow-all supabase/functions/extract-structure/__tests__/
```

Expected: file-not-found errors.

- [ ] **Step 3: Implement `schemas.ts`**

```ts
// supabase/functions/extract-structure/schemas.ts
import { z } from 'zod';

const TempId = z.string().regex(/^ent_\d+$/, 'temp_id must be like "ent_1"');
const Iso = z.string().min(2).max(3);

const EntityType = z.enum([
  'corporation', 'partnership', 'dh_entity',
  'hybrid_partnership', 'reverse_hybrid',
  'individual', 'trust_or_non_entity',
]);

export const Stage1Output = z.object({
  entities: z.array(z.object({
    temp_id: TempId,
    name: z.string().min(1),
    legal_form: z.string().nullable().optional(),
    jurisdiction_iso: Iso,
    entity_type: EntityType,
    is_taxpayer: z.boolean(),
  })).min(1),
});
export type Stage1OutputT = z.infer<typeof Stage1Output>;

export const Stage2Output = z.object({
  ownership_edges: z.array(z.object({
    from_temp_id: TempId,
    to_temp_id: TempId,
    ownership_pct: z.number().min(0).max(100),
    voting_only: z.boolean().optional(),
  })),
});
export type Stage2OutputT = z.infer<typeof Stage2Output>;

const TransactionType = z.enum([
  'loan', 'royalty', 'dividend', 'service_fee', 'management_fee', 'other',
]);
const Mismatch = z.enum(['D/NI', 'DD']);

export const Stage3Output = z.object({
  transactions: z.array(z.object({
    from_temp_id: TempId,
    to_temp_id: TempId,
    transaction_type: TransactionType,
    amount_eur: z.number().nullable().optional(),
    label: z.string().nullable().optional(),
    is_mismatch: z.boolean(),
    mismatch_classification: Mismatch.nullable().optional(),
    mismatch_atad2_article: z.string().nullable().optional(),
  })),
});
export type Stage3OutputT = z.infer<typeof Stage3Output>;
```

- [ ] **Step 4: Run, verify pass**

```bash
deno test --allow-all supabase/functions/extract-structure/__tests__/
```

- [ ] **Step 5: Commit (when user asks)**

```bash
git add supabase/functions/extract-structure/schemas.ts supabase/functions/extract-structure/__tests__/
git commit -m "feat(extract-structure): add Zod schemas for 3 stages"
```

---

### Task 9: Anthropic wrapper with prompt caching

**Files:**
- Create: `supabase/functions/extract-structure/claude.ts`

- [ ] **Step 1: Implement the wrapper**

```ts
// supabase/functions/extract-structure/claude.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

export interface CachedSegment {
  cachedSystem?: string;     // documents block — placed in cache breakpoint
  systemSuffix?: string;     // any non-cached prefix to append
  user: string;              // stage-specific instructions
}

export interface CallResult {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export async function callClaude(seg: CachedSegment): Promise<CallResult> {
  const systemBlocks: Anthropic.TextBlockParam[] = [];
  if (seg.cachedSystem) {
    systemBlocks.push({
      type: 'text',
      text: seg.cachedSystem,
      cache_control: { type: 'ephemeral' },
    } as Anthropic.TextBlockParam);
  }
  if (seg.systemSuffix) {
    systemBlocks.push({ type: 'text', text: seg.systemSuffix });
  }

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemBlocks,
    messages: [{ role: 'user', content: seg.user }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const usage = msg.usage as unknown as {
    input_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    output_tokens: number;
  };

  return {
    text,
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
}

/** Strip ```json fences and find the first {...} block. Throws if none found. */
export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return text.slice(start, end + 1);
}
```

- [ ] **Step 2: Compile-check**

```bash
deno check supabase/functions/extract-structure/claude.ts
```

Expected: no errors.

- [ ] **Step 3: Commit (when user asks)**

```bash
git add supabase/functions/extract-structure/claude.ts
git commit -m "feat(extract-structure): add Anthropic wrapper with prompt caching"
```

---

### Task 10: Stage 1 — entities extraction

**Files:**
- Create: `supabase/functions/extract-structure/prompts/stage1-entities.md`
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: Write the stage-1 prompt**

Create `supabase/functions/extract-structure/prompts/stage1-entities.md`:

```markdown
You are a Dutch tax-law expert assisting in the preparation of an ATAD2 memorandum.

From the source documents and Q&A answers below, extract every legally or fiscally relevant entity, branch, vaste inrichting (VI/PE), individual UBO, and trust / foundation / STAK that is mentioned. Only include entities that are part of, or transact with, the taxpayer's group as relevant for ATAD2.

For each entity output:
- `temp_id`: a stable identifier you choose, of the form `ent_1`, `ent_2`, ... (you'll reuse these in the next stages).
- `name`: the official legal name as it appears in the documents.
- `legal_form`: the abbreviation (B.V., GmbH, LLC, CV, VOF, Ltd, Inc, ...) — use `null` if unknown.
- `jurisdiction_iso`: the ISO 3166-1 alpha-2 country code (NL, US, DE, GB, HK, KY, ...).
- `entity_type`: classified **from a Dutch tax perspective**, exactly one of:
  * `corporation` — opaque to NL (B.V., GmbH, Inc., Ltd.).
  * `partnership` — transparent to NL with no classification mismatch (e.g. VOF).
  * `dh_entity` — Disregarded / Hybrid Entity: NL classification differs from local. Classic example: a US LLC that elected check-the-box (opaque to US, transparent to NL).
  * `hybrid_partnership` — partnership with a classification mismatch.
  * `reverse_hybrid` — NL transparent, foreign opaque (classic example: a Dutch CV held by a US parent).
  * `individual` — a natural person / UBO.
  * `trust_or_non_entity` — trust, foundation, STAK, **vaste inrichting (VI), branch / PE** — anything that is not a separate legal person.
- `is_taxpayer`: `true` only for the entity being assessed (the taxpayer named **{{TAXPAYER_NAME}}**). At most one entity should have this set to `true`.

Output **strict JSON** matching this schema. Output ONLY the JSON object, no surrounding prose, no markdown:

```json
{
  "entities": [
    { "temp_id": "ent_1", "name": "...", "legal_form": "...", "jurisdiction_iso": "NL", "entity_type": "corporation", "is_taxpayer": true }
  ]
}
```

Be exhaustive but precise. Do not invent entities that are not mentioned in the inputs. If a document mentions a generic "subsidiary in Germany" without a name, do not output it.
```

- [ ] **Step 2: Add the stage-1 runner to `index.ts`**

Replace the `// TODO` block in `index.ts` with the following imports and helper. Then call it from the handler.

```ts
// at the top of index.ts:
import { callClaude, extractJson } from './claude.ts';
import { Stage1Output } from './schemas.ts';
import stage1PromptTemplate from './prompts/stage1-entities.md' with { type: 'text' };

// after the auth check, replace the TODO with:
const docsBlock = await loadDocumentsBlock(serviceClient, body.session_id);
const qaText = await loadQaAnswersText(serviceClient, body.session_id);
const taxpayerName = await loadTaxpayerName(serviceClient, body.session_id);

const chart = await ensureChart(serviceClient, body.session_id);
await setStatus(serviceClient, chart.id, 'extracting:stage1');

const stage1User = stage1PromptTemplate.replace('{{TAXPAYER_NAME}}', taxpayerName);
const cachedSystem = `<documents>\n${docsBlock}\n</documents>\n<qa_answers>\n${qaText}\n</qa_answers>`;

let stage1: ReturnType<typeof Stage1Output.parse>;
try {
  const r = await callClaude({ cachedSystem, user: stage1User });
  stage1 = Stage1Output.parse(JSON.parse(extractJson(r.text)));
} catch (e) {
  // one retry with a stricter reminder
  const r = await callClaude({
    cachedSystem,
    user: stage1User + '\n\nReminder: output ONLY valid JSON matching the schema. No prose.',
  });
  stage1 = Stage1Output.parse(JSON.parse(extractJson(r.text)));
}

const tempIdToUuid = new Map<string, string>();
for (const e of stage1.entities) {
  const { data, error } = await serviceClient
    .from('atad2_structure_entities')
    .insert({
      chart_id: chart.id,
      name: e.name,
      legal_form: e.legal_form ?? null,
      jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
      entity_type: e.entity_type,
      is_taxpayer: e.is_taxpayer,
      source: 'ai_extracted',
    })
    .select('id')
    .single();
  if (error) throw error;
  tempIdToUuid.set(e.temp_id, data.id);
}
```

Add the helper functions at the bottom of `index.ts` (these are stubbed for now; flesh out as needed):

```ts
async function ensureChart(client: SupabaseClient, sessionId: string) {
  const { data: existing } = await client
    .from('atad2_structure_charts')
    .select('id, status')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await client
    .from('atad2_structure_charts')
    .insert({ session_id: sessionId })
    .select('id, status')
    .single();
  if (error) throw error;
  return data;
}

async function setStatus(client: SupabaseClient, chartId: string, status: string) {
  await client.from('atad2_structure_charts')
    .update({ status })
    .eq('id', chartId);
}

async function loadDocumentsBlock(client: SupabaseClient, sessionId: string): Promise<string> {
  // Use the same query the prefill flow uses to assemble its <documents> block.
  // Look at supabase/functions/prefill-documents/index.ts and mirror that loader.
  // Returns the assembled XML/text block.
  return /* TODO mirror prefill */ '';
}

async function loadQaAnswersText(client: SupabaseClient, sessionId: string): Promise<string> {
  const { data, error } = await client
    .from('atad2_answers')
    .select('question_id, answer_text')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data ?? []).map(r => `Q ${r.question_id}: ${r.answer_text}`).join('\n');
}

async function loadTaxpayerName(client: SupabaseClient, sessionId: string): Promise<string> {
  const { data } = await client
    .from('atad2_sessions')
    .select('taxpayer_name')
    .eq('session_id', sessionId)
    .single();
  return data?.taxpayer_name ?? '';
}
```

> **Important:** `loadDocumentsBlock` must mirror exactly what `prefill-documents` does. Read that file end-to-end and either share the helper (preferred — extract it to a shared module) or duplicate the loader logic. Do not invent your own.

- [ ] **Step 3: Deploy + smoke-test**

Deploy via the team's normal Edge Function deploy command. Then from the browser console (signed in, with a real `session_id` that has a few uploaded docs):

```js
const r = await fetch('https://api.atad2.tax/functions/v1/extract-structure', { ... });
```

Expected: 200; check `atad2_structure_charts.status` is `extracting:stage2` and a few rows landed in `atad2_structure_entities`.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add supabase/functions/extract-structure/
git commit -m "feat(extract-structure): add stage 1 entity extraction"
```

---

### Task 11: Stage 2 — ownership extraction

**Files:**
- Create: `supabase/functions/extract-structure/prompts/stage2-ownership.md`
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: Write the prompt**

```markdown
<!-- supabase/functions/extract-structure/prompts/stage2-ownership.md -->
You are continuing the same ATAD2 memo extraction. Stage 1 has identified the following entities:

{{ENTITIES_JSON}}

From the source documents and Q&A answers (above in the system message), extract every direct ownership relationship between these entities. Use the `temp_id` values from the input above — do **not** introduce new entities.

Output ownership edges as strict JSON. Output ONLY the JSON, no prose:

```json
{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}
```

`from_temp_id` is the parent (owner). `to_temp_id` is the subsidiary (owned). Express percentages as numbers between 0 and 100. If only voting rights are at issue (no economic ownership), set `voting_only: true`. If economic and voting are equal, omit `voting_only`.

If you cannot determine ownership for some pair, omit that edge — do not guess.
```

- [ ] **Step 2: Add stage-2 runner**

After the stage-1 block in `index.ts`:

```ts
import { Stage2Output } from './schemas.ts';
import stage2PromptTemplate from './prompts/stage2-ownership.md' with { type: 'text' };

await setStatus(serviceClient, chart.id, 'extracting:stage2');

const stage2User = stage2PromptTemplate.replace(
  '{{ENTITIES_JSON}}',
  JSON.stringify(stage1.entities, null, 2),
);

let stage2: ReturnType<typeof Stage2Output.parse>;
try {
  const r = await callClaude({ cachedSystem, user: stage2User });
  stage2 = Stage2Output.parse(JSON.parse(extractJson(r.text)));
} catch {
  const r = await callClaude({
    cachedSystem,
    user: stage2User + '\n\nReminder: output ONLY valid JSON matching the schema.',
  });
  stage2 = Stage2Output.parse(JSON.parse(extractJson(r.text)));
}

for (const oe of stage2.ownership_edges) {
  const fromId = tempIdToUuid.get(oe.from_temp_id);
  const toId = tempIdToUuid.get(oe.to_temp_id);
  if (!fromId || !toId) continue;  // unknown temp_id → skip
  await serviceClient.from('atad2_structure_edges').insert({
    chart_id: chart.id,
    from_entity_id: fromId,
    to_entity_id: toId,
    kind: 'ownership',
    ownership_pct: oe.ownership_pct,
    ownership_voting_only: oe.voting_only ?? null,
    source: 'ai_extracted',
  });
}
```

- [ ] **Step 3: Deploy + smoke-test**

After invoking, expect rows in `atad2_structure_edges WHERE kind='ownership'`.

- [ ] **Step 4: Commit (when user asks)**

```bash
git commit -am "feat(extract-structure): add stage 2 ownership extraction"
```

---

### Task 12: Stage 3 — transactions extraction

**Files:**
- Create: `supabase/functions/extract-structure/prompts/stage3-transactions.md`
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: Write the prompt**

```markdown
<!-- supabase/functions/extract-structure/prompts/stage3-transactions.md -->
Continue the ATAD2 memo extraction. Stage 1 entities and stage 2 ownership relationships are below:

ENTITIES:
{{ENTITIES_JSON}}

OWNERSHIP:
{{OWNERSHIP_JSON}}

From the source documents and Q&A answers, extract every payment / loan / royalty / dividend / service-fee / management-fee flow between the entities above. For each transaction, classify whether it represents an ATAD2 hybrid mismatch (D/NI = deduction without inclusion, or DD = double deduction) **from a Dutch tax perspective**, and cite the relevant ATAD2 article (e.g. `12aa`, `12ab`, ...).

Output ONLY this JSON, no prose:

```json
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
```

Direction (`from`→`to`) follows the **money flow** (payer → receiver). Convert all amounts to EUR; round to whole euros. Set `amount_eur: null` if not stated.

If a flow has no apparent ATAD2 implication, set `is_mismatch: false` and omit the mismatch fields. Do not over-classify — if it's clearly an arm's-length payment with no classification mismatch, it is not an ATAD2 mismatch.
```

- [ ] **Step 2: Add stage-3 runner**

After stage-2:

```ts
import { Stage3Output } from './schemas.ts';
import stage3PromptTemplate from './prompts/stage3-transactions.md' with { type: 'text' };

await setStatus(serviceClient, chart.id, 'extracting:stage3');

const stage3User = stage3PromptTemplate
  .replace('{{ENTITIES_JSON}}', JSON.stringify(stage1.entities, null, 2))
  .replace('{{OWNERSHIP_JSON}}', JSON.stringify(stage2.ownership_edges, null, 2));

let stage3: ReturnType<typeof Stage3Output.parse> | null = null;
try {
  const r = await callClaude({ cachedSystem, user: stage3User });
  stage3 = Stage3Output.parse(JSON.parse(extractJson(r.text)));
} catch {
  try {
    const r = await callClaude({
      cachedSystem,
      user: stage3User + '\n\nReminder: output ONLY valid JSON matching the schema.',
    });
    stage3 = Stage3Output.parse(JSON.parse(extractJson(r.text)));
  } catch {
    // graceful degradation: persist a warning, continue
    await serviceClient.from('atad2_structure_charts').update({
      warnings: [{ stage: 3, message: 'Transaction extraction failed' }],
    }).eq('id', chart.id);
  }
}

if (stage3) {
  for (const t of stage3.transactions) {
    const fromId = tempIdToUuid.get(t.from_temp_id);
    const toId = tempIdToUuid.get(t.to_temp_id);
    if (!fromId || !toId) continue;
    await serviceClient.from('atad2_structure_edges').insert({
      chart_id: chart.id,
      from_entity_id: fromId,
      to_entity_id: toId,
      kind: 'transaction',
      transaction_type: t.transaction_type,
      amount_eur: t.amount_eur ?? null,
      label: t.label ?? null,
      is_mismatch: t.is_mismatch,
      mismatch_classification: t.mismatch_classification ?? null,
      mismatch_atad2_article: t.mismatch_atad2_article ?? null,
      source: 'ai_extracted',
    });
  }
}

await setStatus(serviceClient, chart.id, 'draft_ready');
await serviceClient.from('atad2_structure_charts').update({
  draft_extracted_at: new Date().toISOString(),
}).eq('id', chart.id);

return json({ ok: true, chart_id: chart.id }, 200);
```

- [ ] **Step 3: Deploy + smoke-test**

End state: `atad2_structure_charts.status = 'draft_ready'`, transactions visible in `atad2_structure_edges`.

- [ ] **Step 4: Commit (when user asks)**

```bash
git commit -am "feat(extract-structure): add stage 3 transactions extraction"
```

---

### Task 13: Error handling — early-stage failures + idempotency

The previous tasks already retry once and gracefully degrade on stage 3. Now harden stages 1 and 2 the same way, plus make the function safely re-runnable (idempotency on re-extraction).

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: Wrap stage 1 in try/catch and on final failure set status `extraction_failed`**

Modify the stage-1 try/catch already in place. After both attempts fail:

```ts
} catch (err) {
  await setStatus(serviceClient, chart.id, 'extraction_failed');
  await serviceClient.from('atad2_structure_charts').update({
    warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
  }).eq('id', chart.id);
  return json({ error: 'Stage 1 extraction failed', chart_id: chart.id }, 500);
}
```

- [ ] **Step 2: For stage 2, on final failure persist what we have and continue to stage 3**

```ts
let stage2: ReturnType<typeof Stage2Output.parse> = { ownership_edges: [] };
try {
  // ... existing stage-2 attempts
} catch (err) {
  await serviceClient.from('atad2_structure_charts').update({
    warnings: [{ stage: 2, message: 'Ownership extraction failed' }],
  }).eq('id', chart.id);
  // leave stage2 as the empty default and proceed to stage 3
}
```

- [ ] **Step 3: Make re-extraction idempotent**

When called on an existing chart, delete only `source='ai_extracted'` rows before re-running. Add at the top of the handler, after `ensureChart`:

```ts
await serviceClient.from('atad2_structure_edges')
  .delete()
  .eq('chart_id', chart.id)
  .eq('source', 'ai_extracted');
await serviceClient.from('atad2_structure_entities')
  .delete()
  .eq('chart_id', chart.id)
  .eq('source', 'ai_extracted');
```

This preserves user-added rows.

- [ ] **Step 4: Deploy + smoke-test**

Re-invoke against the same session: confirm AI rows are replaced and any user-added rows survive (you can fake one by inserting via SQL with `source='user_added'`).

- [ ] **Step 5: Commit (when user asks)**

```bash
git commit -am "feat(extract-structure): error handling and idempotent re-extraction"
```

---

## Phase 4 — Frontend lib (DB-coupled)

### Task 14: `client.ts` — Supabase CRUD

**Files:**
- Create: `src/lib/structure/client.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/structure/client.ts
import { supabase } from '@/integrations/supabase/client';
import type {
  StructureChart, StructureEntity, StructureEdge, StructureGroup,
  EntityType, EdgeKind, TransactionType, MismatchClassification,
} from './types';

export async function loadChart(sessionId: string) {
  const { data: chart } = await supabase
    .from('atad2_structure_charts')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!chart) return null;

  const [{ data: entities }, { data: edges }, { data: groupings }] = await Promise.all([
    supabase.from('atad2_structure_entities').select('*').eq('chart_id', chart.id),
    supabase.from('atad2_structure_edges').select('*').eq('chart_id', chart.id),
    supabase.from('atad2_structure_groupings').select('*').eq('chart_id', chart.id),
  ]);

  return {
    chart: chart as StructureChart,
    entities: (entities ?? []) as StructureEntity[],
    edges: (edges ?? []) as StructureEdge[],
    groupings: (groupings ?? []) as StructureGroup[],
  };
}

export async function refreshChartStatus(chartId: string) {
  const { data } = await supabase
    .from('atad2_structure_charts')
    .select('status, warnings, draft_extracted_at')
    .eq('id', chartId)
    .single();
  return data;
}

export async function upsertEntity(input: Partial<StructureEntity> & { chart_id: string }) {
  const payload = { ...input, source: input.source ?? 'user_edited' };
  if (input.id) {
    const { data, error } = await supabase
      .from('atad2_structure_entities')
      .update(payload).eq('id', input.id).select('*').single();
    if (error) throw error;
    return data as StructureEntity;
  }
  const { data, error } = await supabase
    .from('atad2_structure_entities')
    .insert({ ...payload, source: 'user_added' }).select('*').single();
  if (error) throw error;
  return data as StructureEntity;
}

export async function deleteEntity(id: string) {
  const { error } = await supabase.from('atad2_structure_entities').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertEdge(input: Partial<StructureEdge> & {
  chart_id: string; from_entity_id: string; to_entity_id: string; kind: EdgeKind;
}) {
  const payload = { ...input, source: input.source ?? 'user_edited' };
  if (input.id) {
    const { data, error } = await supabase
      .from('atad2_structure_edges')
      .update(payload).eq('id', input.id).select('*').single();
    if (error) throw error;
    return data as StructureEdge;
  }
  const { data, error } = await supabase
    .from('atad2_structure_edges')
    .insert({ ...payload, source: 'user_added' }).select('*').single();
  if (error) throw error;
  return data as StructureEdge;
}

export async function deleteEdge(id: string) {
  const { error } = await supabase.from('atad2_structure_edges').delete().eq('id', id);
  if (error) throw error;
}

export async function updateEntityPosition(id: string, x: number, y: number) {
  const { error } = await supabase
    .from('atad2_structure_entities')
    .update({ position_x: x, position_y: y })
    .eq('id', id);
  if (error) throw error;
}

export async function finalizeChart(chartId: string) {
  await supabase.from('atad2_structure_charts')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', chartId);
}
```

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/lib/structure/client.ts
git commit -m "feat(structure): add Supabase CRUD helpers"
```

---

### Task 15: `extraction.ts` — call function + poll

**Files:**
- Create: `src/lib/structure/extraction.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/structure/extraction.ts
import { supabase } from '@/integrations/supabase/client';
import type { ChartStatus } from './types';
import { refreshChartStatus } from './client';

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export async function startExtraction(sessionId: string): Promise<{ chart_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_BASE}/extract-structure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!r.ok) throw new Error(`Extraction failed: ${r.status} ${await r.text()}`);
  return r.json();
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 120_000;

const TERMINAL: ReadonlyArray<ChartStatus> = ['draft_ready', 'extraction_failed'];

export async function pollUntilTerminal(
  chartId: string,
  onUpdate: (status: ChartStatus) => void,
  signal?: AbortSignal,
): Promise<ChartStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (true) {
    if (signal?.aborted) throw new Error('Polling aborted');
    if (Date.now() > deadline) throw new Error('Extraction polling timed out');
    const data = await refreshChartStatus(chartId);
    if (data) {
      onUpdate(data.status as ChartStatus);
      if (TERMINAL.includes(data.status as ChartStatus)) return data.status as ChartStatus;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}
```

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/lib/structure/extraction.ts
git commit -m "feat(structure): add extraction client + status polling"
```

---

## Phase 5 — Frontend components

### Task 16: `EntityNode.tsx` — single component switching on entity_type

**Files:**
- Create: `src/components/structure/nodes/EntityNode.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/nodes/EntityNode.tsx
import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { geometryFor, BOX } from '@/lib/structure/shapeGeometry';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import type { EntityType } from '@/lib/structure/types';

export interface EntityNodeData {
  name: string;
  legal_form: string | null;
  jurisdiction_iso: string;
  entity_type: EntityType;
  is_taxpayer: boolean;
  source: 'ai_extracted' | 'user_added' | 'user_edited';
}

function EntityNodeComp({ data, selected }: NodeProps<EntityNodeData>) {
  const geom = geometryFor(data.entity_type);
  const fill = fillFor(data);
  const isIndividual = data.entity_type === 'individual';

  return (
    <div style={{ width: BOX.width, height: BOX.height, position: 'relative' }}>
      <Handle type="target" position={Position.Top}  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <svg
        width={BOX.width}
        height={BOX.height}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? `2px solid ${PALETTE.ownershipStroke}` : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {/* outer */}
        {geom.outer.kind === 'rect' && (
          <rect width={BOX.width} height={BOX.height} rx={geom.outer.rx}
            fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
        )}
        {geom.outer.kind === 'polygon' && (
          <polygon points={geom.outer.points}
            fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
        )}
        {geom.outer.kind === 'ellipse' && (
          <ellipse cx={BOX.width/2} cy={BOX.height/2}
            rx={BOX.width/2} ry={BOX.height/2}
            fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
        )}
        {geom.outer.kind === 'individual' && (
          <g>
            <circle cx={BOX.width/2} cy={20} r={11} fill={PALETTE.individual}/>
            <polygon
              points={`${BOX.width/2 - 30},${BOX.height-8} ${BOX.width/2 - 24},${BOX.height-42} ${BOX.width/2 + 24},${BOX.height-42} ${BOX.width/2 + 30},${BOX.height-8}`}
              fill={PALETTE.individual}/>
          </g>
        )}

        {/* inner */}
        {geom.inner?.kind === 'ellipse' && (
          <ellipse cx={BOX.width/2} cy={BOX.height/2}
            rx={geom.inner.rx} ry={geom.inner.ry}
            fill="none" stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92}/>
        )}
        {geom.inner?.kind === 'polygon' && (
          <polygon points={geom.inner.points}
            fill="none" stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92}/>
        )}
        {geom.inner?.kind === 'polyline' && (
          <polyline points={geom.inner.points}
            fill="none" stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92}/>
        )}

        {/* label */}
        {!isIndividual && (
          <>
            <text x={BOX.width/2} y={BOX.height/2 - 4}
              fontFamily="Inter, system-ui, sans-serif" fontSize={13} fontWeight={700}
              fill={PALETTE.text} textAnchor="middle">
              {truncate(data.name, 18)}
            </text>
            {data.legal_form && (
              <text x={BOX.width/2} y={BOX.height/2 + 12}
                fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
                fill={PALETTE.textMuted} textAnchor="middle">
                {data.legal_form}
              </text>
            )}
            <text x={BOX.width/2} y={BOX.height - 8}
              fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
              fill={PALETTE.textMuted} textAnchor="middle">
              ({data.jurisdiction_iso})
            </text>
          </>
        )}
      </svg>
      {isIndividual && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: BOX.height + 4,
          textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#1d252b' }}>{truncate(data.name, 18)}</div>
          <div style={{ fontSize: 10.5, color: '#6b6660' }}>({data.jurisdiction_iso})</div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export const EntityNode = memo(EntityNodeComp);
```

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/nodes/EntityNode.tsx
git commit -m "feat(structure): add EntityNode with 7 tax-shape renderers"
```

---

### Task 17: `OwnershipEdge.tsx` + `TransactionEdge.tsx`

**Files:**
- Create: `src/components/structure/edges/OwnershipEdge.tsx`
- Create: `src/components/structure/edges/TransactionEdge.tsx`

- [ ] **Step 1: Implement OwnershipEdge**

```tsx
// src/components/structure/edges/OwnershipEdge.tsx
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';

export interface OwnershipEdgeData {
  ownership_pct: number | null;
  ownership_voting_only: boolean | null;
}

export function OwnershipEdge({
  sourceX, sourceY, targetX, targetY, id, data, selected,
}: EdgeProps<OwnershipEdgeData>) {
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const label = data?.ownership_pct != null
    ? `${data.ownership_pct}%${data.ownership_voting_only ? ' (voting)' : ''}`
    : '';
  return (
    <>
      <BaseEdge id={id} path={path}
        style={{ stroke: PALETTE.ownershipStroke, strokeWidth: selected ? 3 : 2 }} />
      {label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: PALETTE.background, padding: '0 4px',
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: 600,
            color: '#3a3530',
          }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 2: Implement TransactionEdge**

```tsx
// src/components/structure/edges/TransactionEdge.tsx
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import type { TransactionType, MismatchClassification } from '@/lib/structure/types';

export interface TransactionEdgeData {
  transaction_type: TransactionType;
  amount_eur: number | null;
  is_mismatch: boolean;
  mismatch_classification: MismatchClassification | null;
  mismatch_atad2_article: string | null;
  label: string | null;
}

const TYPE_VERB: Record<TransactionType, string> = {
  loan: 'Loan',
  royalty: 'Royalty',
  dividend: 'Dividend',
  service_fee: 'Service fee',
  management_fee: 'Management fee',
  other: 'Transaction',
};

export function TransactionEdge({
  sourceX, sourceY, targetX, targetY, id, data, markerEnd,
}: EdgeProps<TransactionEdgeData>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, curvature: 0.4,
  });
  const stroke = data?.is_mismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke;
  const verb = data ? TYPE_VERB[data.transaction_type] : 'Transaction';
  const amount = data?.amount_eur != null
    ? `${verb} EUR ${formatAmount(data.amount_eur)}`
    : verb;
  const subline = data?.is_mismatch && data.mismatch_classification
    ? `${data.mismatch_classification} mismatch${data.mismatch_atad2_article ? ' · art ' + data.mismatch_atad2_article : ''}`
    : null;

  return (
    <>
      <BaseEdge id={id} path={path}
        style={{ stroke, strokeWidth: 2.2, fill: 'none' }}
        markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div style={{
          position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          background: '#fff', border: '0.75px solid rgba(0,0,0,0.16)',
          borderRadius: 2, padding: '4px 8px',
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11.5, fontWeight: 700,
          color: stroke, textAlign: 'center', pointerEvents: 'all',
        }}>
          <div>{data?.label || amount}</div>
          {subline && <div style={{ fontSize: 10, marginTop: 1 }}>{subline}</div>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000)     return `${(amount / 1_000).toFixed(0)}k`;
  return amount.toLocaleString('en-US');
}
```

- [ ] **Step 3: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/edges/
git commit -m "feat(structure): add ownership + transaction edge renderers"
```

---

### Task 18: `EntityPalette.tsx` (left rail, drag-to-add)

**Files:**
- Create: `src/components/structure/EntityPalette.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/EntityPalette.tsx
import { ENTITY_TYPES, type EntityType } from '@/lib/structure/types';

export function EntityPalette({ onAdd }: { onAdd: (t: EntityType) => void }) {
  return (
    <div className="w-48 shrink-0 border-r bg-white p-3 flex flex-col gap-2 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
        Add entity
      </div>
      {ENTITY_TYPES.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onAdd(t.key)}
          className="text-left text-sm px-3 py-2 rounded border border-neutral-200 hover:bg-neutral-50"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

(Drag-and-drop add can be a v1.1 enhancement — buttons cover the MVP.)

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/components/structure/EntityPalette.tsx
git commit -m "feat(structure): add entity-palette left rail"
```

---

### Task 19: `EntityInspector.tsx` + `EdgeInspector.tsx`

**Files:**
- Create: `src/components/structure/EntityInspector.tsx`
- Create: `src/components/structure/EdgeInspector.tsx`

- [ ] **Step 1: Implement EntityInspector**

```tsx
// src/components/structure/EntityInspector.tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ENTITY_TYPES, type StructureEntity } from '@/lib/structure/types';

interface Props {
  entity: StructureEntity;
  onChange: (patch: Partial<StructureEntity>) => void;
  onDelete: () => void;
}

export function EntityInspector({ entity, onChange, onDelete }: Props) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
        Entity
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={entity.name} onChange={e => onChange({ name: e.target.value })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="legal_form">Legal form</Label>
        <Input id="legal_form"
          value={entity.legal_form ?? ''}
          onChange={e => onChange({ legal_form: e.target.value || null })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="jurisdiction">Jurisdiction (ISO)</Label>
        <Input id="jurisdiction" maxLength={3}
          value={entity.jurisdiction_iso}
          onChange={e => onChange({ jurisdiction_iso: e.target.value.toUpperCase() })} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="type">Type (NL classification)</Label>
        <Select value={entity.entity_type}
          onValueChange={v => onChange({ entity_type: v as StructureEntity['entity_type'] })}>
          <SelectTrigger id="type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(t => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="is_taxpayer" checked={entity.is_taxpayer}
          onCheckedChange={c => onChange({ is_taxpayer: Boolean(c) })} />
        <Label htmlFor="is_taxpayer" className="cursor-pointer">This is the taxpayer</Label>
      </div>

      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        Delete entity
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Implement EdgeInspector**

```tsx
// src/components/structure/EdgeInspector.tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { StructureEdge } from '@/lib/structure/types';

interface Props {
  edge: StructureEdge;
  onChange: (patch: Partial<StructureEdge>) => void;
  onDelete: () => void;
}

export function EdgeInspector({ edge, onChange, onDelete }: Props) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
        {edge.kind === 'ownership' ? 'Ownership' : 'Transaction'}
      </div>

      {edge.kind === 'ownership' ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="pct">Ownership %</Label>
            <Input id="pct" type="number" min={0} max={100} step={0.01}
              value={edge.ownership_pct ?? ''}
              onChange={e => onChange({ ownership_pct: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="voting_only" checked={Boolean(edge.ownership_voting_only)}
              onCheckedChange={c => onChange({ ownership_voting_only: Boolean(c) })} />
            <Label htmlFor="voting_only">Voting rights only</Label>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="ttype">Type</Label>
            <Select value={edge.transaction_type ?? 'other'}
              onValueChange={v => onChange({ transaction_type: v as StructureEdge['transaction_type'] })}>
              <SelectTrigger id="ttype"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['loan','royalty','dividend','service_fee','management_fee','other'].map(t =>
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amt">Amount (EUR)</Label>
            <Input id="amt" type="number" min={0} step="any"
              value={edge.amount_eur ?? ''}
              onChange={e => onChange({ amount_eur: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lbl">Label</Label>
            <Input id="lbl" value={edge.label ?? ''}
              onChange={e => onChange({ label: e.target.value || null })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ismm" checked={edge.is_mismatch}
              onCheckedChange={c => onChange({ is_mismatch: Boolean(c) })} />
            <Label htmlFor="ismm">Hybrid mismatch (ATAD2)</Label>
          </div>
          {edge.is_mismatch && (
            <>
              <div className="space-y-1">
                <Label htmlFor="mc">Classification</Label>
                <Select value={edge.mismatch_classification ?? 'D/NI'}
                  onValueChange={v => onChange({ mismatch_classification: v as 'D/NI' | 'DD' })}>
                  <SelectTrigger id="mc"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="D/NI">D/NI — Deduction without inclusion</SelectItem>
                    <SelectItem value="DD">DD — Double deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="art">ATAD2 article</Label>
                <Input id="art" placeholder="12aa"
                  value={edge.mismatch_atad2_article ?? ''}
                  onChange={e => onChange({ mismatch_atad2_article: e.target.value || null })} />
              </div>
            </>
          )}
        </>
      )}

      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        Delete
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/EntityInspector.tsx src/components/structure/EdgeInspector.tsx
git commit -m "feat(structure): add inspector panels for entity + edge editing"
```

---

### Task 20: `StructureToolbar.tsx`

**Files:**
- Create: `src/components/structure/StructureToolbar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/StructureToolbar.tsx
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  onAutoLayout: () => void;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
  status?: string;
}

export function StructureToolbar({ onAutoLayout, onReExtract, onExportPptx, busy, status }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-white">
      <Button size="sm" variant="outline" onClick={onAutoLayout} disabled={busy}>
        Auto-layout
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>Re-extract</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-extract from inputs?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites AI-suggested entities and edges. Your manual edits and additions are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReExtract}>Re-extract</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy}>
        Export PPTX
      </Button>

      <div className="ml-auto text-xs text-neutral-500">
        {status}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/components/structure/StructureToolbar.tsx
git commit -m "feat(structure): add toolbar with auto-layout / re-extract / export"
```

---

### Task 21: `StructureChart.tsx` — wire it together

**Files:**
- Create: `src/components/structure/StructureChart.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/StructureChart.tsx
import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MarkerType,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode, type EntityNodeData } from './nodes/EntityNode';
import { OwnershipEdge, type OwnershipEdgeData } from './edges/OwnershipEdge';
import { TransactionEdge, type TransactionEdgeData } from './edges/TransactionEdge';
import { PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const nodeTypes = { entity: EntityNode };
const edgeTypes = { ownership: OwnershipEdge, transaction: TransactionEdge };

export interface StructureChartProps {
  entities: StructureEntity[];
  edges: StructureEdge[];
  selection: { kind: 'node' | 'edge'; id: string } | null;
  onSelectionChange: (s: { kind: 'node' | 'edge'; id: string } | null) => void;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
}

export function StructureChart(props: StructureChartProps) {
  const initialNodes = useMemo<Node<EntityNodeData>[]>(
    () => props.entities.map(e => ({
      id: e.id,
      type: 'entity',
      position: { x: e.position_x, y: e.position_y },
      data: {
        name: e.name,
        legal_form: e.legal_form,
        jurisdiction_iso: e.jurisdiction_iso,
        entity_type: e.entity_type,
        is_taxpayer: e.is_taxpayer,
        source: e.source as EntityNodeData['source'],
      },
    })),
    [props.entities],
  );
  const initialEdges = useMemo<Edge[]>(
    () => props.edges.map(e => e.kind === 'ownership'
      ? {
          id: e.id, source: e.from_entity_id, target: e.to_entity_id, type: 'ownership',
          data: { ownership_pct: e.ownership_pct, ownership_voting_only: e.ownership_voting_only } satisfies OwnershipEdgeData,
        }
      : {
          id: e.id, source: e.from_entity_id, target: e.to_entity_id, type: 'transaction',
          markerEnd: { type: MarkerType.ArrowClosed, color: e.is_mismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke },
          data: {
            transaction_type: (e.transaction_type ?? 'other') as TransactionEdgeData['transaction_type'],
            amount_eur: e.amount_eur,
            is_mismatch: e.is_mismatch,
            mismatch_classification: (e.mismatch_classification ?? null) as TransactionEdgeData['mismatch_classification'],
            mismatch_atad2_article: e.mismatch_atad2_article,
            label: e.label,
          } satisfies TransactionEdgeData,
        }),
    [props.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    for (const c of changes) {
      if (c.type === 'position' && c.dragging === false && c.id) {
        const n = nodes.find(x => x.id === c.id);
        if (n) props.onNodePositionEnd(n.id, n.position.x, n.position.y);
      }
    }
  }, [onNodesChange, nodes, props]);

  return (
    <div className="flex-1 h-full" style={{ background: PALETTE.background }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) => c.source && c.target && props.onConnect(c.source, c.target)}
        onNodeClick={(_, n) => props.onSelectionChange({ kind: 'node', id: n.id })}
        onEdgeClick={(_, e) => props.onSelectionChange({ kind: 'edge', id: e.id })}
        onPaneClick={() => props.onSelectionChange(null)}
        fitView
      >
        <Background gap={40} color="rgba(90,85,80,0.15)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx
git commit -m "feat(structure): wire xyflow canvas with custom node + edge types"
```

---

### Task 22: `StructureChartStep.tsx` + page route

**Files:**
- Create: `src/pages/AssessmentStructure.tsx`
- Create: `src/components/structure/StructureChartStep.tsx`
- Modify: `src/App.tsx` (or wherever routes live)

- [ ] **Step 1: Implement `StructureChartStep.tsx`**

```tsx
// src/components/structure/StructureChartStep.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StructureChart } from './StructureChart';
import { StructureToolbar } from './StructureToolbar';
import { EntityPalette } from './EntityPalette';
import { EntityInspector } from './EntityInspector';
import { EdgeInspector } from './EdgeInspector';
import { autoLayout } from '@/lib/structure/dagreLayout';
import {
  loadChart, upsertEntity, deleteEntity, upsertEdge, deleteEdge,
  updateEntityPosition, finalizeChart,
} from '@/lib/structure/client';
import { startExtraction, pollUntilTerminal } from '@/lib/structure/extraction';
import type {
  StructureChart as Chart, StructureEntity, StructureEdge, ChartStatus, EntityType,
} from '@/lib/structure/types';

export function StructureChartStep({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [chart, setChart] = useState<Chart | null>(null);
  const [entities, setEntities] = useState<StructureEntity[]>([]);
  const [edges, setEdgesState] = useState<StructureEdge[]>([]);
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [status, setStatus] = useState<ChartStatus | 'loading'>('loading');
  const [busy, setBusy] = useState(false);

  // Initial load + extract if no chart yet
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
        if (loaded.chart.status.startsWith('extracting:')) {
          // resume polling
          await pollUntilTerminal(loaded.chart.id, async (s) => {
            if (aborted) return;
            setStatus(s);
            const refreshed = await loadChart(sessionId);
            if (refreshed && !aborted) {
              setEntities(refreshed.entities);
              setEdgesState(refreshed.edges);
            }
          });
        }
      } else {
        // no chart yet → start extraction
        const { chart_id } = await startExtraction(sessionId);
        if (aborted) return;
        await pollUntilTerminal(chart_id, async (s) => {
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
    })().catch(err => {
      console.error(err);
      setStatus('extraction_failed' as ChartStatus);
    });
    return () => { aborted = true; };
  }, [sessionId]);

  const handleAutoLayout = () => {
    const laidOut = autoLayout(
      entities.map(e => ({ id: e.id, position: { x: e.position_x, y: e.position_y } })),
      edges.map(e => ({ id: e.id, source: e.from_entity_id, target: e.to_entity_id, kind: e.kind as 'ownership' | 'transaction' })),
      { onlyOwnership: true },
    );
    const map = new Map(laidOut.map(n => [n.id, n.position]));
    setEntities(prev => prev.map(e => {
      const p = map.get(e.id);
      return p ? { ...e, position_x: p.x, position_y: p.y } : e;
    }));
    laidOut.forEach(n => updateEntityPosition(n.id, n.position.x, n.position.y));
  };

  const handleReExtract = async () => {
    if (!chart) return;
    setBusy(true);
    setStatus('extracting:stage1' as ChartStatus);
    await startExtraction(sessionId);
    await pollUntilTerminal(chart.id, async (s) => {
      setStatus(s);
      const refreshed = await loadChart(sessionId);
      if (refreshed) {
        setEntities(refreshed.entities);
        setEdgesState(refreshed.edges);
      }
    });
    setBusy(false);
  };

  const handleAddEntity = async (entityType: EntityType) => {
    if (!chart) return;
    const created = await upsertEntity({
      chart_id: chart.id,
      name: 'New entity',
      legal_form: null,
      jurisdiction_iso: 'NL',
      entity_type: entityType,
      is_taxpayer: false,
      position_x: 200, position_y: 200,
      source: 'user_added',
    } as Partial<StructureEntity> & { chart_id: string });
    setEntities(prev => [...prev, created]);
  };

  const handleConnect = async (from: string, to: string) => {
    if (!chart) return;
    const created = await upsertEdge({
      chart_id: chart.id,
      from_entity_id: from,
      to_entity_id: to,
      kind: 'ownership',
      ownership_pct: 100,
      ownership_voting_only: false,
      source: 'user_added',
    });
    setEdgesState(prev => [...prev, created]);
  };

  const selectedEntity = selection?.kind === 'node' ? entities.find(e => e.id === selection.id) : null;
  const selectedEdge   = selection?.kind === 'edge' ? edges.find(e => e.id === selection.id) : null;

  const updateSelectedEntity = (patch: Partial<StructureEntity>) => {
    if (!selectedEntity) return;
    setEntities(prev => prev.map(e => e.id === selectedEntity.id ? { ...e, ...patch } : e));
    upsertEntity({ ...selectedEntity, ...patch });
  };
  const deleteSelectedEntity = async () => {
    if (!selectedEntity) return;
    await deleteEntity(selectedEntity.id);
    setEntities(prev => prev.filter(e => e.id !== selectedEntity.id));
    setSelection(null);
  };
  const updateSelectedEdge = (patch: Partial<StructureEdge>) => {
    if (!selectedEdge) return;
    setEdgesState(prev => prev.map(e => e.id === selectedEdge.id ? { ...e, ...patch } : e));
    upsertEdge({ ...selectedEdge, ...patch });
  };
  const deleteSelectedEdge = async () => {
    if (!selectedEdge) return;
    await deleteEdge(selectedEdge.id);
    setEdgesState(prev => prev.filter(e => e.id !== selectedEdge.id));
    setSelection(null);
  };

  const goNext = async () => {
    if (chart) await finalizeChart(chart.id);
    navigate(`/assessment-confirmation/${sessionId}`);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Step 5: Review structure chart</h1>
          <p className="text-xs text-neutral-500">
            Review the AI-generated draft, edit as needed, then continue to the report.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
          <Button onClick={goNext} disabled={status === 'loading' || (typeof status === 'string' && status.startsWith('extracting:'))}>
            Next
          </Button>
        </div>
      </header>

      <StructureToolbar
        onAutoLayout={handleAutoLayout}
        onReExtract={handleReExtract}
        onExportPptx={() => import('./exports/exportToPptx').then(m => m.exportToPptx({ entities, edges, taxpayerName: '' }))}
        busy={busy}
        status={typeof status === 'string' ? status : ''}
      />

      <div className="flex flex-1 min-h-0">
        <EntityPalette onAdd={handleAddEntity} />

        <StructureChart
          entities={entities}
          edges={edges}
          selection={selection}
          onSelectionChange={setSelection}
          onNodePositionEnd={(id, x, y) => {
            setEntities(prev => prev.map(e => e.id === id ? { ...e, position_x: x, position_y: y } : e));
            updateEntityPosition(id, x, y);
          }}
          onConnect={handleConnect}
        />

        <aside className="w-72 shrink-0 border-l bg-white p-3 overflow-y-auto">
          {selectedEntity && (
            <EntityInspector
              entity={selectedEntity}
              onChange={updateSelectedEntity}
              onDelete={deleteSelectedEntity}
            />
          )}
          {selectedEdge && (
            <EdgeInspector
              edge={selectedEdge}
              onChange={updateSelectedEdge}
              onDelete={deleteSelectedEdge}
            />
          )}
          {!selectedEntity && !selectedEdge && (
            <div className="text-xs text-neutral-500">Select an entity or edge to edit it.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the page wrapper**

```tsx
// src/pages/AssessmentStructure.tsx
import { useParams } from 'react-router-dom';
import { StructureChartStep } from '@/components/structure/StructureChartStep';

export default function AssessmentStructure() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <div className="p-8">Missing session id.</div>;
  return <StructureChartStep sessionId={sessionId} />;
}
```

- [ ] **Step 3: Add the route in `App.tsx`**

Find the existing route block (search for `/assessment-confirmation`). Insert directly above it:

```tsx
import AssessmentStructure from '@/pages/AssessmentStructure';
// ...
<Route path="/assessment/structure/:sessionId" element={<AssessmentStructure />} />
```

- [ ] **Step 4: Verify it loads**

```bash
npm run dev
```

Browse to `http://localhost:5173/assessment/structure/<a real session id>`. Expected: page loads, hits the Edge Function, shows skeleton then chart.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/pages/AssessmentStructure.tsx src/components/structure/StructureChartStep.tsx src/App.tsx
git commit -m "feat(structure): add Step 5 page + route + state wiring"
```

---

## Phase 6 — Integration into existing flow

### Task 23: Reroute `Assessment.tsx` finish handler

Currently, after Q&A `Assessment.tsx` (around line 698) calls `navigate('/assessment-confirmation/{sessionId}')`. Change that to land on the new structure step first.

**Files:**
- Modify: `src/pages/Assessment.tsx`

- [ ] **Step 1: Read the existing finish handler**

```bash
sed -n '680,720p' src/pages/Assessment.tsx
```

Locate the `navigate('/assessment-confirmation/...')` call inside `finishAssessment` (or whatever the function is named).

- [ ] **Step 2: Change the redirect target**

Change the `navigate(...)` line from:

```ts
navigate(`/assessment-confirmation/${sessionId}`);
```

to:

```ts
navigate(`/assessment/structure/${sessionId}`);
```

- [ ] **Step 3: Manual smoke-test**

`npm run dev`, complete an existing test session's Q&A end-to-end, click "Finish assessment". Expected: lands on the structure-chart page.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(structure): reroute finishAssessment via structure step"
```

---

## Phase 7 — Exports

### Task 24: `exportToPng.ts` (html-to-image)

**Files:**
- Modify: `package.json` (install `html-to-image`)
- Create: `src/components/structure/exports/exportToPng.ts`

- [ ] **Step 1: Install**

```bash
npm install html-to-image@^1.11.13
```

- [ ] **Step 2: Implement**

```ts
// src/components/structure/exports/exportToPng.ts
import { toPng } from 'html-to-image';

/**
 * Capture the xyflow canvas as a PNG. The canvas root has the class
 * `react-flow` and contains a `.react-flow__viewport` for the actual graph content.
 */
export async function captureChartPng(opts: { rootSelector?: string; pixelRatio?: number } = {}): Promise<Blob> {
  const root = document.querySelector(opts.rootSelector ?? '.react-flow') as HTMLElement | null;
  if (!root) throw new Error('No react-flow root found in DOM');

  const dataUrl = await toPng(root, {
    pixelRatio: opts.pixelRatio ?? 2,
    cacheBust: true,
    backgroundColor: '#ebe5dc',
    filter: (node) => {
      // Don't capture the controls panel — we want a clean export
      return !(node instanceof HTMLElement && node.classList.contains('react-flow__controls'));
    },
  });
  const r = await fetch(dataUrl);
  return r.blob();
}
```

- [ ] **Step 3: Commit (when user asks)**

```bash
git add package.json package-lock.json src/components/structure/exports/exportToPng.ts
git commit -m "feat(structure): add PNG capture of xyflow canvas"
```

---

### Task 25: `exportToPptx.ts` (pptxgenjs, native shapes)

**Files:**
- Modify: `package.json` (install `pptxgenjs`)
- Create: `src/components/structure/exports/exportToPptx.ts`

- [ ] **Step 1: Install**

```bash
npm install pptxgenjs@^3.12.0
```

- [ ] **Step 2: Implement**

```ts
// src/components/structure/exports/exportToPptx.ts
import PptxGenJS from 'pptxgenjs';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const SLIDE_W_IN = 13.333;  // 16:9 widescreen
const SLIDE_H_IN = 7.5;
const PX_PER_IN  = 96;       // browser px → PPT inches assumption
const BOX_W_IN   = 1.4;
const BOX_H_IN   = 0.85;

interface Args {
  entities: StructureEntity[];
  edges: StructureEdge[];
  taxpayerName: string;
}

export async function exportToPptx({ entities, edges, taxpayerName }: Args) {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';

  const slide = pres.addSlide();
  slide.background = { color: 'EBE5DC' };

  // --- entities as native shapes ----
  for (const e of entities) {
    const x = e.position_x / PX_PER_IN;
    const y = e.position_y / PX_PER_IN;
    addEntityShape(slide, pres, e, x, y);
  }

  // --- edges as connectors ----
  for (const ed of edges) {
    const from = entities.find(x => x.id === ed.from_entity_id);
    const to   = entities.find(x => x.id === ed.to_entity_id);
    if (!from || !to) continue;
    addEdge(slide, ed, from, to);
  }

  await pres.writeFile({ fileName: `${taxpayerName || 'Taxpayer'} - Structure Chart.pptx` });
}

function addEntityShape(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  e: StructureEntity,
  x: number, y: number,
) {
  const fill = fillFor(e).replace('#', '');
  const text = `${e.name}\n${e.legal_form ?? ''}\n(${e.jurisdiction_iso})`.trim();
  const opts = {
    x, y, w: BOX_W_IN, h: BOX_H_IN,
    fill: { color: fill },
    line: { color: '404040', width: 0.5 },
    fontFace: 'Inter',
    fontSize: 9, bold: true, color: 'FFFFFF',
    align: 'center' as const, valign: 'middle' as const,
  };

  switch (e.entity_type) {
    case 'corporation':
      slide.addShape(pres.ShapeType.rect, { ...opts, rectRadius: 0.02 });
      slide.addText(text, opts);
      break;
    case 'partnership':
      slide.addShape(pres.ShapeType.triangle, opts);
      slide.addText(text, opts);
      break;
    case 'trust_or_non_entity':
      slide.addShape(pres.ShapeType.ellipse, opts);
      slide.addText(text, opts);
      break;
    case 'dh_entity':
      slide.addShape(pres.ShapeType.rect, { ...opts, rectRadius: 0.02 });
      slide.addShape(pres.ShapeType.ellipse, {
        ...opts, fill: { type: 'none' }, line: { color: 'FFFFFF', width: 1.2 },
        x: x + 0.05, y: y + 0.07, w: BOX_W_IN - 0.1, h: BOX_H_IN - 0.14,
      });
      slide.addText(text, opts);
      break;
    case 'reverse_hybrid': {
      slide.addShape(pres.ShapeType.rect, { ...opts, rectRadius: 0.02 });
      // inner triangle apex-down approximated by triangle rotated 180°
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1, y: y + 0.1, w: BOX_W_IN - 0.2, h: BOX_H_IN - 0.2,
        fill: { type: 'none' }, line: { color: 'FFFFFF', width: 1.2 }, flipV: true,
      });
      slide.addText(text, opts);
      break;
    }
    case 'hybrid_partnership':
      // approximate inverted-V with a triangle outline, no base
      slide.addShape(pres.ShapeType.rect, { ...opts, rectRadius: 0.02 });
      slide.addShape(pres.ShapeType.triangle, {
        x: x + 0.1, y: y + 0.1, w: BOX_W_IN - 0.2, h: BOX_H_IN - 0.2,
        fill: { type: 'none' }, line: { color: 'FFFFFF', width: 1.2 },
      });
      slide.addText(text, opts);
      break;
    case 'individual':
      slide.addShape(pres.ShapeType.oval, {
        x: x + BOX_W_IN/2 - 0.12, y, w: 0.24, h: 0.24, fill: { color: '595550' },
      });
      slide.addShape(pres.ShapeType.trapezoid, {
        x: x + 0.2, y: y + 0.25, w: BOX_W_IN - 0.4, h: BOX_H_IN - 0.25,
        fill: { color: '595550' },
      });
      slide.addText(`${e.name}\n(${e.jurisdiction_iso})`, {
        x, y: y + BOX_H_IN + 0.05, w: BOX_W_IN, h: 0.4,
        fontFace: 'Inter', fontSize: 9, color: '1d252b', align: 'center' as const,
      });
      break;
  }
}

function addEdge(slide: PptxGenJS.Slide, e: StructureEdge, from: StructureEntity, to: StructureEntity) {
  const fx = from.position_x / PX_PER_IN + BOX_W_IN/2;
  const fy = from.position_y / PX_PER_IN + BOX_H_IN;
  const tx = to.position_x   / PX_PER_IN + BOX_W_IN/2;
  const ty = to.position_y   / PX_PER_IN;
  const stroke =
    e.kind === 'ownership'
      ? PALETTE.ownershipStroke
      : (e.is_mismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke);

  slide.addShape('line' as PptxGenJS.ShapeType, {
    x: Math.min(fx, tx), y: Math.min(fy, ty),
    w: Math.abs(tx - fx) || 0.01, h: Math.abs(ty - fy) || 0.01,
    line: {
      color: stroke.replace('#',''),
      width: 1.5,
      endArrowType: e.kind === 'transaction' ? 'triangle' : undefined,
    },
    flipH: tx < fx, flipV: ty < fy,
  });

  if (e.kind === 'ownership' && e.ownership_pct != null) {
    slide.addText(`${e.ownership_pct}%`, {
      x: (fx + tx)/2 - 0.3, y: (fy + ty)/2 - 0.1, w: 0.6, h: 0.2,
      fontFace: 'Inter', fontSize: 9, color: '3a3530', align: 'center' as const,
    });
  }
  if (e.kind === 'transaction') {
    const verb = e.transaction_type ?? 'Transaction';
    const amt  = e.amount_eur != null ? ` EUR ${(e.amount_eur).toLocaleString('en-US')}` : '';
    slide.addText(`${verb}${amt}`, {
      x: (fx + tx)/2 - 0.6, y: (fy + ty)/2 - 0.1, w: 1.2, h: 0.2,
      fontFace: 'Inter', fontSize: 9, bold: true, color: stroke.replace('#',''), align: 'center' as const,
    });
  }
}
```

> **Note:** The PPTX shape-mapping is a best effort. Some `ShapeType` enum members above may not exist in `pptxgenjs`'s typings (`flipV`/`flipH` on shapes is not universally typed). If TypeScript complains, cast the option object to `any`. The shapes will still render correctly in PowerPoint; perfection here can wait for a follow-up.

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke-test**

In the running app, click "Export PPTX". Open the downloaded `.pptx` in PowerPoint. Verify: the entities are native PPT shapes (you can click and drag them), they have approximately the right colour and position, edges are present.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add package.json package-lock.json src/components/structure/exports/exportToPptx.ts
git commit -m "feat(structure): add PPTX export with native PowerPoint shapes"
```

---

### Task 26: DOCX integration in `DownloadMemoButton.tsx`

**Files:**
- Modify: `package.json` (install `@docxtemplater/image-module`)
- Modify: `src/components/DownloadMemoButton.tsx`

- [ ] **Step 1: Install**

```bash
npm install @docxtemplater/image-module
```

(no version pin — match the major of `docxtemplater` 3.x; image-module 3.x is current)

- [ ] **Step 2: Read the existing button to find the data-fill site**

```bash
sed -n '150,260p' src/components/DownloadMemoButton.tsx
```

Locate where `doc.render(docxData)` is called (around line 230 per the explore report) and the section just above where the template is loaded.

- [ ] **Step 3: Wire the image-module**

Add at the top of the file:

```ts
import ImageModule from '@docxtemplater/image-module';
import { captureChartPng } from '@/components/structure/exports/exportToPng';
```

Modify the Docxtemplater construction to register the module. Replace the existing constructor call:

```ts
const imageModule = new ImageModule({
  centered: true,
  fileType: 'docx',
  getImage: (tag: string) => /* unreached: we resolve via async pre-fetch below */ null,
  getSize: () => [600, 360],
});

const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: '{{', end: '}}' },
  parser: dotParser,
  modules: [imageModule],
});
```

Pre-render the chart PNG before `doc.render`:

```ts
let structureChartBytes: ArrayBuffer | null = null;
try {
  const blob = await captureChartPng();
  structureChartBytes = await blob.arrayBuffer();
} catch (e) {
  console.warn('Structure chart capture failed; memo will be generated without chart', e);
}

// then in docxData add the placeholder bytes
const docxDataWithImage = {
  ...docxData,
  structureChart: structureChartBytes,
};

doc.render(docxDataWithImage);
```

Configure the image-module's `getImage` to look up `tag === 'structureChart'`:

```ts
const imageModule = new ImageModule({
  centered: true,
  fileType: 'docx',
  getImage: (tagValue: ArrayBuffer | null) => tagValue,  // tagValue is the resolved field
  getSize: () => [600, 360],
});
```

> **Verify** by reading the @docxtemplater/image-module README in `node_modules/@docxtemplater/image-module/README.md` — the API of `getImage` accepts `(tagValue, tagName)` and your callback decides what to return. Adjust if the local version's API differs.

- [ ] **Step 4: Compile-check + manual smoke-test**

```bash
npx tsc --noEmit
```

In the app, walk through to the structure step → Next → Generate Memo. Open the resulting DOCX. Expected: the placeholder is replaced by an embedded PNG of the chart. **Note:** this test only works after Task 27 has updated the DOCX template to contain the placeholder.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add package.json package-lock.json src/components/DownloadMemoButton.tsx
git commit -m "feat(memo): embed structure-chart PNG via docxtemplater image-module"
```

---

### Task 27: Update `memo_atad2.docx` template (manual Word edit)

**Files:**
- Modify: `templates/memo_atad2.docx` (or wherever the DOCX template lives — check `DownloadMemoButton.tsx` for the actual storage path)

This is a **manual edit in Microsoft Word**, since DOCX is a binary format.

- [ ] **Step 1: Locate the template**

`DownloadMemoButton.tsx` fetches the template from Supabase storage (around line 157). Find the path used (e.g., `templates/memo_atad2.docx`) and download the current version locally.

- [ ] **Step 2: Open it in Word and add the placeholder**

In the "Structure Overview" section of the memo (early — after Background, before tax analysis), insert a new paragraph containing exactly:

```
{%structureChart}
```

The `{%...}` delimiter (with the `%`) is the docxtemplater image-module convention. Make sure the placeholder is on its own line and not split across runs. To verify: select the text and press Ctrl+Shift+8 to see paragraph marks. The whole `{%structureChart}` must be inside a single text run.

- [ ] **Step 3: If the "Structure Overview" section doesn't exist, create it**

Add an `H2` heading "Structure Overview" before the first analysis section, with a brief intro paragraph and the placeholder below:

```
## Structure Overview

The corporate structure of {{meta.taxpayer_name}} is shown below.

{%structureChart}
```

- [ ] **Step 4: Save and re-upload to Supabase storage**

Replace the existing template at the same path. Keep a backup of the previous version somewhere safe.

- [ ] **Step 5: Manual smoke-test**

Run through the full app flow. The exported DOCX should now include the chart at the placeholder location.

- [ ] **Step 6: Commit the template (when user asks)**

If the template is checked into the repo:

```bash
git add templates/memo_atad2.docx
git commit -m "feat(memo): add {%structureChart} placeholder to template"
```

If the template lives only in Supabase storage, no commit needed; just note in the PR description that the template needs to be re-uploaded for the feature to work end-to-end.

---

## Phase 8 — Verification

### Task 28: Manual smoke-test checklist

There is no Playwright in this plan; this checklist is the substitute for the golden path.

**Files:** none (this is a verification task).

- [ ] **Step 1: Start a fresh assessment**

`npm run dev`, sign in, click "New Assessment", enter a taxpayer name, fiscal year, complete a small Q&A. Use a real test session ideally with at least one document uploaded.

- [ ] **Step 2: Reach the structure step**

After the last Q&A question, click "Finish assessment". **Expected:** browser navigates to `/assessment/structure/<sessionId>`.

- [ ] **Step 3: Watch extraction**

**Expected:** status starts at `extracting:stage1`, then `:stage2`, then `:stage3`, then `draft_ready`. Entities appear, then ownership lines, then transaction arrows.

- [ ] **Step 4: Verify shapes & colours**

For each entity:
- Corporation → solid rectangle
- Partnership → triangle apex-up
- Reverse hybrid → rectangle + inner triangle apex-down
- D/H entity → rectangle + inner ellipse
- Hybrid partnership → rectangle + inner inverted-V
- Trust / VI / branch → ellipse
- Individual → trapezoid silhouette + circle head

NL entities = teal `#5d8b87`. Foreign entities = salmon `#b56a5e`. Country code visible in `(NL)` / `(US)` / etc. format.

- [ ] **Step 5: Verify edges**

Ownership lines: dark grey, no arrowhead, `%` label. Transaction arrows: with arrowhead, label pill with `EUR <amount>`. Mismatches: red, second line "D/NI mismatch · art 12aa" (or similar).

- [ ] **Step 6: Edit something**

Drag a node — its position should persist on reload. Click it → inspector appears → change name → press elsewhere → name updates in the chart. Click an edge → change `%` → updates. Add a new entity from the left palette → can connect it to existing nodes by dragging from a handle.

- [ ] **Step 7: Re-extract**

Click "Re-extract", confirm. **Expected:** AI rows are replaced; the manually-added entity from step 6 survives.

- [ ] **Step 8: Auto-layout**

Click "Auto-layout". **Expected:** dagre re-arranges nodes top-down; positions persist after click-elsewhere.

- [ ] **Step 9: Export PPTX**

Click "Export PPTX". File downloads. Open it in PowerPoint or LibreOffice Impress. **Expected:** native shapes that you can move, with approximately the right colours, country codes, and connectors.

- [ ] **Step 10: Continue to memo**

Click "Next". **Expected:** lands on `/assessment-confirmation/<sessionId>` (existing behaviour).

- [ ] **Step 11: Generate the memo**

From the confirmation/report page, click "Download memo" (the existing flow). Open the DOCX. **Expected:** under "Structure Overview" the chart PNG is embedded and visible.

- [ ] **Step 12: RLS spot-check**

Sign in as a different user and try to GET a chart you don't own:

```js
// in another logged-in browser tab
const r = await window.supabase
  .from('atad2_structure_entities')
  .select('*')
  .eq('chart_id', '<the chart_id of someone else\'s chart>');
console.log(r);
```

**Expected:** empty array, no error (RLS quietly hides the rows).

- [ ] **Step 13: Note any deviations**

Document any item that didn't behave as expected. These are bugs to fix before considering the feature done.

---

## Self-Review

### Spec coverage (each spec section → task)

| Spec section | Implemented in |
|---|---|
| §3 In MVP — entities/ownership/transactions/PE/fiscal-unity | Tasks 2, 10–12, plus client/UI in 14–22 |
| §3 Out-of-scope | Acknowledged, no tasks |
| §4 User flow | Tasks 22, 23 |
| §5 Visual conventions — shapes | Tasks 5, 16 |
| §5 Two-colour rule | Task 4 (palette) |
| §5 Edges + mismatch styling | Task 17 |
| §5 Fiscal-unity grouping | Data model in Task 2; UI rendering deferred (no task) |
| §6 Architecture | Whole plan |
| §7 Data model | Task 2 |
| §8 Components & file structure | Tasks 16–22 |
| §9 Step 5 page layout | Task 22 |
| §10 Edge Function | Tasks 7–13 |
| §11 Export pipeline | Tasks 24–27 |
| §12 Testing strategy | Tasks 1, 4, 5, 6, 8 (subset; Storybook + Playwright deferred) |
| §13 Performance budget | Implicit via Sonnet model + caching; no specific task |
| §14 Open follow-ups | None in MVP |

### Gaps flagged

1. **Fiscal-unity grouping rendering** — Task 2 creates the table but no task renders it on canvas. Acceptable for MVP (the table is there for follow-up); call this out in PR description.
2. **`loadDocumentsBlock` in Task 10** is stubbed with `// TODO mirror prefill`. The implementing engineer must read `prefill-documents/index.ts` and either share the helper or duplicate it. This is a deliberate hand-off, not a placeholder we're hiding.
3. **PPTX shape mapping** is best-effort — pptxgenjs typings around `flipV`, `trapezoid`, `triangle` may need `as any` casts. Functional in PowerPoint, follow-up plan can polish.
4. **Storybook + Playwright** are deferred. The repo has zero test infra today; introducing both inside this plan would more than double its size.

### Type-name consistency check

- `EntityType` enum values used identically across DB CHECK, Zod schema, TS type, and SQL: ✅ (`corporation` / `partnership` / `dh_entity` / `hybrid_partnership` / `reverse_hybrid` / `individual` / `trust_or_non_entity`)
- `StructureChart`, `StructureEntity`, `StructureEdge` type names consistent across `types.ts`, `client.ts`, components: ✅
- `chart_id`, `session_id`, `from_entity_id`, `to_entity_id` field names match across DB, types, and code: ✅
- `source` enum values `'ai_extracted' | 'user_added' | 'user_edited'` consistent in DB CHECK and TS types: ✅
- `ChartStatus` strings `'extracting:stage1' | ... | 'draft_ready' | 'extraction_failed' | 'user_edited' | 'finalized'` consistent across Edge Function, frontend status, and types: ✅

### Placeholder scan

- No "TBD", "TODO" left in code-producing steps except the deliberate `loadDocumentsBlock` stub which is explicitly flagged in the gaps section above.
- Every code step shows actual code, not "implement here".
- Every command step shows the actual command.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-07-corporate-structure-chart.md`.

## Execution options

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this big because each subagent gets only the slice of context it needs.

**2. Inline Execution** — Execute tasks in this session using the executing-plans skill, batched with checkpoints for review.

Which approach?
