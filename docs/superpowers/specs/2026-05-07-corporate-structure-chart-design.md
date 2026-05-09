# Corporate Structure Chart — Design Spec

**Date:** 2026-05-07
**Status:** Approved (brainstorm → spec)
**Branch (intended):** `feat/structure-chart`
**Owner:** Lennart Wilming

## 1. Goal

Add a corporate structure chart to the ATAD2 Advisor that auto-renders a draft after the Q&A is complete, lets the user review/edit it, and embeds it as a PNG into the generated DOCX memo. A standalone editable PPTX export is also provided.

The chart visualises the taxpayer's group from a **Dutch tax-perspective**: entity classification (transparent vs. opaque vs. hybrid) is encoded in the **shape** of each node following strict tax-practice conventions. Money flows are drawn as edges, with hybrid mismatches highlighted in red.

## 2. Why this matters

ATAD2 memos describe hybrid mismatches that hinge on how entities are classified across jurisdictions. A structure chart that follows established Big4/IFA conventions — rectangles for corporations, ellipses for non-entities, rectangle-with-inner-ellipse for hybrids, etc. — lets a reader grasp the mismatch in seconds without reading prose. Today the app produces text-only memos; adding a chart makes it deliverable-grade.

## 3. Scope

### In MVP
- Entity nodes: name, legal form, jurisdiction (ISO code shown as `(NL)`/`(US)`/etc.), type-specific shape
- Ownership edges with `%`
- Hybrid / reverse-hybrid / hybrid-partnership classification (encoded in shape)
- NL-perspective tax classification (encoded in shape — single source of truth, not a dual badge)
- Permanent establishments / branches (rendered as ellipse, same as Trust/Non-Entity — both are "not a separate legal entity")
- Fiscal unity grouping (dashed cluster around member entities)
- Payment edges (loan / royalty / dividend / service fee / management fee / other), labelled with `EUR <amount>` where known
- Mismatch highlight on edges (red arrow + `D/NI` or `DD` classification + ATAD2 article reference)
- Auto-layout via dagre on first render; user can drag nodes afterwards (positions persist)
- Full editing: add/remove entities, add/remove edges, edit any field via inspector
- Export: PNG embedded in DOCX memo; standalone editable PPTX download

### Explicitly out of scope (MVP)
- UPE (Ultimate Parent Entity) marker
- Fiscal year + source-attribution overlay (which document/answer each node came from)
- Crossed-out entities (liquidations / historical structures)
- Dashed-outer "pending incorporation" nodes
- Undo / redo
- Multi-user real-time collaboration on the same chart
- Chart history / version tracking

## 4. User flow

```
Assessment page
 ├─ Step 1–4: Q&A (existing)
 ├─ Step 5: Structure chart  ← NEW
 │    1. On entry: trigger extraction if no chart yet
 │    2. Skeleton appears, then entities/ownership/transactions fade in stage-by-stage
 │    3. User edits via xyflow canvas + side-panel inspector
 │    4. "Re-extract" button (preserves user-added/edited rows)
 │    5. "Export PPTX" button (standalone download)
 │    6. "Next" advances to Generate Report
 └─ Step 6: Generate Report (existing) — DOCX now includes embedded PNG
```

The Step 5 trigger is **not** taxpayer-name-entry; the draft only appears after the Q&A is complete. Reason: documents may not be uploaded, in which case Q&A answers are the only data source.

## 5. Visual conventions (locked)

### Entity shapes (NL-perspective classification encoded in shape)
| Type | Shape | Used for |
|---|---|---|
| Corporation | Rectangle (rx=2) | B.V., GmbH, Inc., Ltd. — opaque |
| Partnership | Triangle, apex up | VOF, partnership — transparent (NL) |
| D / Hybrid Entity | Rect + inner ellipse | LLC (CTB), entity classified differently in NL vs. local |
| Hybrid Partnership | Rect + inner inverted-V (peak up, no base) | Partnership with classification mismatch |
| Reverse Hybrid | Rect + inner triangle apex down | NL CV transparent, foreign opaque |
| Individual | Trapezoidal silhouette + circle head | Natural person / UBO |
| Trust / Non-Entity / VI/PE/Branch | Ellipse | Trust, foundation, STAK, vaste inrichting, branch |

Inner shapes are drawn with white stroke (1.6px, 92% opacity) on the coloured fill.

### Two-colour rule (no per-jurisdiction palette)
- **NL (binnenland)**: `#5d8b87` teal
- **Foreign (buitenland — any non-NL)**: `#b56a5e` salmon
- **Individual**: `#595550` dark grey

Country code disambiguates within the foreign colour: `(US)`, `(DE)`, `(HK)`, `(KY)`, etc.

### Typography
- Name: Inter / IBM Plex Sans, 13px, weight 700, white on coloured fill
- Country code: 11px, weight 500, `rgba(255,255,255,0.78)`
- Side-labels (caption): 12px, weight 600, `#1d252b`
- Sub-labels: 10.5px, `#6b6660`

### Edges
- **Ownership lines**: solid, no arrowhead, stroke `#5a5550` 2px, label = `%` (e.g. `100%`)
- **Transaction arrows**: curved path, with arrowhead, 2.2px. Pill-label (white background, rx=2, 0.75px border) with two-line text — top: `Loan EUR 5M` (700 weight), bottom: `D/NI mismatch` (10px, 600 weight) when applicable
- **Mismatch transactions**: stroke `#a04338` (red)
- **Normal transactions**: stroke `#1f5489` (blue)

### Canvas
- Background: warm light grey `#ebe5dc`
- Drop shadow on shapes: 2px y-offset, ~28% opacity, 1.4 stdDeviation
- Stroke on shapes: `rgba(0,0,0,0.22)` 0.75px
- Corner radius: 2 (angular, not rounded)

### Fiscal unity grouping
Dashed cluster (`stroke-dasharray: 9 6`, stroke `#888` 1.5px, rx=14) around member entities. Label "Fiscale eenheid NL" floating top-left of the cluster.

## 6. Architecture

### High-level

```
Assessment page
  │ Q&A complete
  ▼
Step 5 (Structure)
  │ POST /functions/v1/extract-structure
  ▼
Edge Function `extract-structure`
  ├─ Stage 1: Entities      (Claude → Zod)
  ├─ Stage 2: Ownership     (Claude → Zod)
  └─ Stage 3: Transactions  (Claude → Zod)
       │ writes through pipeline
       ▼
Postgres tables (atad2_structure_charts/_entities/_edges)
       │
       ▼
Frontend reads + xyflow renders + user edits
       │
       ▼
Export: PNG → DOCX (docxtemplater image-module)
        PPTX → standalone download (pptxgenjs)
```

### Stack choices
- **Frontend graph**: `@xyflow/react` 12.10.2 + `dagre` 0.8.5 (already installed; existing `admin/QuestionFlowCanvas` uses the same)
- **Edge Function runtime**: Deno (Supabase Edge Function default), Anthropic SDK direct
- **LLM**: Claude Sonnet 4.6 for extraction quality; prompt caching on the documents block
- **DOCX embed**: `@docxtemplater/image-module` (new dep) + `html-to-image` (new dep, ~30 kB) for SVG → PNG
- **PPTX export**: `pptxgenjs` (new dep) — generates native PPT shapes (rectangle/oval/etc.) so the user can keep editing in PowerPoint

### What we deliberately do not build
- No new n8n workflow (memory: moving away from n8n; new AI work goes to Edge Functions)
- No client-side LLM
- No new auth pattern — all RLS flows from existing `atad2_sessions` via `session_id` FK

## 7. Data model

Three new tables, plus one small grouping table. RLS mirrors `atad2_sessions` via `session_id`.

```sql
CREATE TABLE atad2_structure_charts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           uuid NOT NULL UNIQUE REFERENCES atad2_sessions(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'extracting:stage1',
                          -- 'extracting:stage1' | 'extracting:stage2' | 'extracting:stage3'
                          -- | 'draft_ready' | 'extraction_failed'
                          -- | 'user_edited' | 'finalized'
  draft_extracted_at   timestamptz,
  finalized_at         timestamptz,
  canvas_width         int NOT NULL DEFAULT 1400,
  canvas_height        int NOT NULL DEFAULT 900,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE entity_type_enum AS ENUM (
  'corporation', 'partnership', 'dh_entity',
  'hybrid_partnership', 'reverse_hybrid',
  'individual', 'trust_or_non_entity'
);

CREATE TABLE atad2_structure_entities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id            uuid NOT NULL REFERENCES atad2_structure_charts(id) ON DELETE CASCADE,
  name                text NOT NULL,
  legal_form          text,                       -- "B.V.", "GmbH", "LLC", "CV", "VOF"
  jurisdiction_iso    text NOT NULL,              -- "NL", "US", "DE" (ISO 3166-1 alpha-2)
  entity_type         entity_type_enum NOT NULL,
  is_taxpayer         boolean NOT NULL DEFAULT false,
  position_x          numeric NOT NULL DEFAULT 0,
  position_y          numeric NOT NULL DEFAULT 0,
  source              text NOT NULL DEFAULT 'ai_extracted',
                          -- 'ai_extracted' | 'user_added' | 'user_edited'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atad2_structure_edges (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id                 uuid NOT NULL REFERENCES atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id           uuid NOT NULL REFERENCES atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id             uuid NOT NULL REFERENCES atad2_structure_entities(id) ON DELETE CASCADE,
  kind                     text NOT NULL,           -- 'ownership' | 'transaction'

  -- ownership-only
  ownership_pct            numeric,
  ownership_voting_only    boolean,

  -- transaction-only
  transaction_type         text,                    -- 'loan' | 'royalty' | 'dividend' |
                                                    --   'service_fee' | 'management_fee' | 'other'
  amount_eur               numeric,
  is_mismatch              boolean NOT NULL DEFAULT false,
  mismatch_classification  text,                    -- 'D/NI' | 'DD'
  mismatch_atad2_article   text,                    -- '12aa' | '12ab' | etc.

  -- common
  label                    text,
  source                   text NOT NULL DEFAULT 'ai_extracted',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atad2_structure_groupings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id    uuid NOT NULL REFERENCES atad2_structure_charts(id) ON DELETE CASCADE,
  kind        text NOT NULL,         -- 'fiscal_unity' | 'consolidation_group'
  label       text NOT NULL,
  member_ids  uuid[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: identical pattern to existing atad2_sessions tables
-- (a row is visible to a user iff the corresponding session is)
```

### Why these choices
- **One chart per session** (UNIQUE on `session_id`) — re-extract overwrites the AI-generated rows of the same chart; no version sprawl.
- **Edges in one table** with `kind` discriminator — query-friendlier than two tables, and xyflow expects a flat list.
- **`source` field** on entities and edges — lets us preserve user edits across re-extractions and (optionally) show a subtle indicator distinguishing AI-suggested from user-authored content.
- **Position on entity, not on chart** — fits "auto-layout on first render, manual thereafter" (decision C2).

## 8. Components & file structure

### 8a. Frontend

```
src/components/structure/
├── StructureChartStep.tsx       // wraps the canvas + handles load/save/next-step navigation
├── StructureChart.tsx           // xyflow canvas (pan, zoom, multi-select)
├── StructureToolbar.tsx         // [+ Entity] [+ Edge] [Auto-layout] [Re-extract] [Export PPTX]
├── EntityPalette.tsx            // left rail: drag-to-add per entity-type
├── EntityInspector.tsx          // right rail: edit fields of the selected entity
├── EdgeInspector.tsx            // right rail: edit fields of the selected edge
├── nodes/
│   └── EntityNode.tsx           // ONE component, switches on entity_type to render the right SVG shape
├── edges/
│   ├── OwnershipEdge.tsx
│   └── TransactionEdge.tsx
└── exports/
    ├── exportToPng.ts           // html-to-image → PNG bytes
    └── exportToPptx.ts          // pptxgenjs → editable .pptx file

src/lib/structure/
├── types.ts                     // TS types matching DB schema
├── client.ts                    // Supabase queries (loadChart, upsertEntity, deleteEdge, …)
├── extraction.ts                // POST to Edge Function, poll status
├── dagreLayout.ts               // auto-layout helper
├── shapeGeometry.ts             // SVG paths for the 7 shapes
└── palette.ts                   // NL/foreign/individual colours, mismatch colours
```

**Key choice**: a single `EntityNode.tsx` switches on `entity_type` and renders the right SVG. The seven types share name/country-code rendering, hover/selection states, drop-shadow, and palette logic — only the underlying shape differs. Splitting into seven components would multiply boilerplate and make theme changes painful.

### 8b. Edge Function

```
supabase/functions/extract-structure/
├── index.ts            // Deno handler: 3 sequential stages, writes status to DB
├── prompts/
│   ├── stage1-entities.md
│   ├── stage2-ownership.md
│   └── stage3-transactions.md
├── schemas.ts          // Zod schemas for each stage's output
└── claude.ts           // Anthropic SDK wrapper with prompt caching on documents_block

supabase/migrations/
└── <timestamp>_create_structure_chart_tables.sql
```

## 9. Step 5 page layout

```
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Review structure chart           [< Back] [Next >]   │
├─────────────┬────────────────────────────────────┬───────────┤
│             │                                    │           │
│  Entity     │       xyflow canvas                │ Inspector │
│  palette    │       (warm grey #ebe5dc)          │ (selected │
│  (drag)     │                                    │  entity   │
│             │  toolbar: [Re-extract] [Auto-layout]│  or edge) │
│             │           [Export PPTX]            │           │
└─────────────┴────────────────────────────────────┴───────────┘
```

While extraction is running, the canvas shows a subtle skeleton (faded entity placeholders pulsing). As each stage completes, content fades in (entities → ownership → transactions). Status pill at top-right reflects current state.

## 10. Edge Function: extraction pipeline

`supabase/functions/extract-structure/index.ts`

### Inputs
- `documents_block` (XML, reused from `buildDocumentsBlock.ts`)
- `qa_answers`: `{question_id, question_text, answer_text}[]`
- `taxpayer_name`: string
- `session_id`: uuid (used to write status updates and persist results)

The Edge Function constructs a single Anthropic API call per stage. The documents block is placed in the cached portion of the prompt (`cache_control: ephemeral` breakpoint) so all three stages reuse it — saves ~70% input tokens versus three uncached calls.

### Stage 1 — Entities
- **Prompt** (`prompts/stage1-entities.md`): "Extract every legal entity, branch, PE, individual UBO, and trust mentioned. For each: `name`, `legal_form`, `jurisdiction_iso`, and `entity_type` (NL-perspective classification using these 7 categories: corporation / partnership / dh_entity / hybrid_partnership / reverse_hybrid / individual / trust_or_non_entity). Mark which one is the taxpayer. Use ISO 3166-1 alpha-2 codes for jurisdictions."
- **Output schema** (Zod): `{ entities: { temp_id: string, name, legal_form?, jurisdiction_iso, entity_type, is_taxpayer }[] }`
- **Retry**: 1× on schema validation failure
- **`temp_id` semantics**: LLM-friendly identifiers (e.g. `ent_1`, `ent_2`) chosen by the model. After stage 1 inserts the entities, our handler keeps an in-memory `temp_id → uuid` map and rewrites stage-2 / stage-3 references through it before persisting. The LLM never sees real UUIDs — it always works in `temp_id` space.
- **On success**: insert into `atad2_structure_entities`, status → `extracting:stage2`

### Stage 2 — Ownership
- **Prompt** (`prompts/stage2-ownership.md`): "Given these entities, extract every ownership relationship with percentages. Use the `temp_id`s from input." (entities from stage 1 are passed as JSON)
- **Output schema**: `{ ownership_edges: { from_temp_id, to_temp_id, ownership_pct, voting_only? }[] }`
- **Retry**: 1×
- **On success**: insert ownership edges, status → `extracting:stage3`

### Stage 3 — Transactions
- **Prompt** (`prompts/stage3-transactions.md`): "Extract every payment / loan / royalty / dividend / service-fee / management-fee flow. For each, classify whether it represents an ATAD2 hybrid mismatch (D/NI or DD) and cite the relevant article (12aa, 12ab, …). Amounts should be in EUR; convert if disclosed in another currency."
- **Output schema**: `{ transactions: { from_temp_id, to_temp_id, transaction_type, amount_eur?, label?, is_mismatch, mismatch_classification?, mismatch_atad2_article? }[] }`
- **Retry**: 1×
- **On success**: insert transaction edges, status → `draft_ready`, `draft_extracted_at = now()`
- **On final failure**: persist what we have, status → `draft_ready`, but record a stage-3 warning the UI can show

### Status flow & UI feedback

Frontend polls `atad2_structure_charts.status` every 2 seconds during extraction. Each status change drives a fade-in:

```
'extracting:stage1' → skeleton visible
'extracting:stage2' → entities fade in
'extracting:stage3' → ownership lines fade in
'draft_ready'       → transaction arrows fade in, status pill turns green
                      "Draft ready — review and edit"
```

This replaces a 30-second blank spinner with a perceptibly progressive build.

### Error handling

| Scenario | Behaviour |
|---|---|
| Stage 1 fails 2× | `status='extraction_failed'`, error banner with "Re-extract" button. User can also start with empty chart and build manually. |
| Stage 2 fails | Persist entities, status `draft_ready`, warning "Ownership extraction failed — please add manually." |
| Stage 3 fails | Persist entities + ownership, status `draft_ready`, info "No transactions extracted." |
| Edge Function timeout (>60 s) | Resume from last successful stage on next invocation (status field tells us where we are). Don't re-run stages already persisted. |
| User edit during extraction | Skeleton state blocks interaction; in any case writes are idempotent because user-writes use `source='user_edited'` while AI-writes use `'ai_extracted'`. |

### Re-extraction flow
- Toolbar button "Re-extract"
- Confirm dialog: "This will overwrite AI-suggested entities and edges. Your manual edits and additions will be preserved."
- Backend: `DELETE FROM atad2_structure_entities WHERE chart_id=… AND source='ai_extracted'`, same for edges, then run all three stages again.
- User-added/edited rows survive untouched.

## 11. Export pipeline

### DOCX embed
- New `{%structureChart}` placeholder in `templates/memo_atad2.docx`, positioned in the "Structure Overview" section (early in the memo, after Background, before tax analysis).
- `DownloadMemoButton.tsx` is extended:
  1. Render the chart to a hidden DOM node (or reuse the visible canvas).
  2. Use `html-to-image` to capture as PNG at 2× device pixel ratio.
  3. Pass PNG bytes to `@docxtemplater/image-module` at the `{%structureChart}` placeholder.
- The image-module replaces the placeholder with an embedded picture sized to fit the page width.

### Standalone PPTX
- "Export PPTX" button in the toolbar.
- `pptxgenjs` builds a single-slide deck:
  - Each entity → native PowerPoint shape (`shapes.RECTANGLE`, `shapes.OVAL`, `shapes.TRIANGLE`, custom freeform for hybrids/individuals) with the same fill colour and white text. So the user can drag and tweak in PowerPoint.
  - Edges → connectors (`pres.connector`) with arrows where applicable.
  - File downloads as `<TaxpayerName> - Structure Chart.pptx`.
- Some shapes don't have a perfect PPT primitive (the inner-ellipse and inner-V hybrids); those are rendered as a group of two PPT shapes — a base rectangle and an overlaid stroke-only inner shape — so the group is still PPT-editable.

## 12. Testing strategy

| Layer | Approach |
|---|---|
| **Unit** | `shapeGeometry.ts` (deterministic SVG paths per type), `dagreLayout.ts` (deterministic positions for canned graphs), Zod schemas (round-trip a fixture payload of each stage). |
| **Edge Function** | Deno test suite with three fixtures: simple (3 entities), medium (8 entities + 2 mismatches), complex (15 entities + fiscal unity + multiple transactions). Mock Anthropic with canned responses for happy path, schema-failure-then-retry, and timeout. |
| **Integration** | Migration test: three tables created, RLS isolates sessions correctly. Extraction-end-to-end against a stub Anthropic. |
| **E2E (Playwright)** | One golden-path flow: complete a small Q&A → arrive at Step 5 → wait for `draft_ready` → drag an entity → edit an ownership % → click Generate Report → DOCX downloads and contains an embedded image at the placeholder. |
| **Visual regression (Storybook)** | One story per shape × per state (ai-extracted, user-added, selected, hover) plus edge stories (ownership/transaction/mismatch). Catches regressions on the strict tax conventions during refactors. |

## 13. Performance budget

- Extraction p95 ≤ 45 s (with prompt caching and ~50 k token documents block; 3 × ~3 k token outputs).
- Canvas render: 60 fps drag, ≤16 ms layout recompute on dagre auto-layout for ≤30 nodes.
- DOCX export: PNG capture + embed completes in ≤ 3 s for a 30-node chart.
- PPTX export: ≤ 1 s for a 30-node chart.

## 14. Open follow-ups (not in MVP, recorded for later)

- UPE marker (visually highlight Ultimate Parent)
- Source attribution (which document / answer produced which node)
- Crossed-out nodes for liquidations
- Dashed-pending nodes for to-be-incorporated entities
- Undo / redo
- Multi-user collaboration
- Chart history / version-tracking

## 15. References

- Tax-diagram conventions reference: <https://github.com/jyen2k/tax-diagram-tool>
- Existing docxtemplater flow: `src/components/DownloadMemoButton.tsx`
- Existing prefill / documents pattern: `src/lib/prefill/buildDocumentsBlock.ts`
- Existing xyflow usage: `src/components/admin/QuestionFlowCanvas.tsx`
- Visual-style mockup (approved v5): `.superpowers/brainstorm/3028-1778143344/content/visual-style-v5.html`
