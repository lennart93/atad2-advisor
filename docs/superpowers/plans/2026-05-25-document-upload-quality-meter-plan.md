# Document Upload Quality-Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password-strength-style quality meter to the document upload step that gives users real-time, visual feedback on how comprehensive their uploaded documents are (Empty → Good → Strong → Excellent), with AI-suggested categories per file and a soft-gate dialog at low scores.

**Architecture:** Pure client-side filename heuristic gives instant tier feedback. A new lightweight `classify-document` Supabase Edge Function refines the category and flags thin documents (Haiku, ≤500 tokens of context). The meter renders in the assessment shell's sticky footer next to the action button. A soft-gate dialog wraps the "Run pre-fill" action when tier is Empty or Good.

**Tech Stack:** React + TypeScript + Vite + Vitest + Tailwind + shadcn/ui (Select, Dialog), Zustand store, React Query, Supabase JS client, Supabase Edge Functions (Deno + Anthropic SDK).

**Spec:** [docs/superpowers/specs/2026-05-25-document-upload-quality-meter-design.md](docs/superpowers/specs/2026-05-25-document-upload-quality-meter-design.md)

---

## Pre-flight checks

Before starting, verify the dev environment is sane:

```bash
npm install
npx vitest run --reporter=dot
```

Both should succeed cleanly. If anything fails, fix it before continuing (don't carry pre-existing failures into this work).

---

## File structure (new + modified)

**New files:**

| Path | Purpose |
|---|---|
| `supabase/migrations/20260525100000_document_quality_meter.sql` | Add `is_thin`, `category_source` columns; extend category CHECK with two new values |
| `src/lib/prefill/categorize.ts` | Sync filename → category heuristic (pure function) |
| `src/lib/prefill/__tests__/categorize.test.ts` | Heuristic tests |
| `src/lib/prefill/qualityMeter.ts` | `computeQuality(docs)` → tier/segments/hint/missingTypes (pure function) |
| `src/lib/prefill/__tests__/qualityMeter.test.ts` | Tier computation tests |
| `src/components/prefill/DocumentQualityMeter.tsx` | Segmented bar + pill, renders from `computeQuality` result |
| `src/components/prefill/__tests__/DocumentQualityMeter.test.tsx` | Render-per-tier tests |
| `src/components/prefill/LowQualityGateDialog.tsx` | Soft-gate dialog with adaptive copy on `missingTypes` |
| `src/components/prefill/__tests__/LowQualityGateDialog.test.tsx` | Copy-adaption test |
| `src/components/prefill/CategoryDropdown.tsx` | Per-file Select with "(suggested)" badge |
| `supabase/functions/classify-document/index.ts` | Edge function: classify + thin detection |

**Modified files:**

| Path | Change |
|---|---|
| `src/lib/prefill/types.ts` | Add `structure_chart`, `client_correspondence` to `DOCUMENT_CATEGORIES`; add `is_thin`, `category_source` to `SessionDocument` |
| `src/hooks/usePrefill.ts` | (a) Apply heuristic + insert `category_source: 'filename'` in `useUploadDocument` / `useUploadText`; (b) add `useClassifyDocument` mutation; (c) make `useUpdateDocumentCategory` set `category_source: 'user'` |
| `src/components/prefill/DocumentUploader.tsx` | Render `CategoryDropdown` on each uploaded file row; fire classify-document on upload success |
| `src/pages/AssessmentUpload.tsx` | Compute quality from docs, render `DocumentQualityMeter` next to the Continue button, gate Continue with `LowQualityGateDialog` when tier is Good |
| `src/integrations/supabase/types.ts` | Regen after migration (or hand-edit `SessionDocument` shape if regen isn't available) |

---

## Task 1: DB migration — add columns and extend category CHECK

**Files:**
- Create: `supabase/migrations/20260525100000_document_quality_meter.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Quality meter additions on atad2_session_documents:
--   * is_thin BOOLEAN: set by classify-document edge function when a doc
--     is below ~200 words / has no extractable content. Thin docs don't
--     count toward the quality tier.
--   * category_source TEXT: tracks whether the current category came from
--     the client-side filename heuristic, the AI classifier, or a user
--     override. The classifier skips rows where this is 'user'.
-- Also extends the category CHECK with two new values:
--   * structure_chart — uploaded organograms / group charts
--   * client_correspondence — emails, letters, scope chats

ALTER TABLE atad2_session_documents
  ADD COLUMN IF NOT EXISTS is_thin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE atad2_session_documents
  ADD COLUMN IF NOT EXISTS category_source TEXT NOT NULL DEFAULT 'filename';

ALTER TABLE atad2_session_documents
  DROP CONSTRAINT IF EXISTS atad2_session_documents_category_source_check;

ALTER TABLE atad2_session_documents
  ADD CONSTRAINT atad2_session_documents_category_source_check
    CHECK (category_source IN ('filename', 'ai', 'user'));

ALTER TABLE atad2_session_documents
  DROP CONSTRAINT IF EXISTS atad2_session_documents_category_check;

ALTER TABLE atad2_session_documents
  ADD CONSTRAINT atad2_session_documents_category_check CHECK (category IN (
    'financial_statements',
    'tax_returns',
    'local_file',
    'master_file',
    'previous_year_atad2_analysis',
    'trial_balance',
    'general_ledger',
    'memo',
    'comment_letter_to_tax_return',
    'structure_chart',
    'client_correspondence',
    'other'
  ));
```

- [ ] **Step 2: Apply locally**

If you have a local Supabase running, apply with:
```bash
npx supabase db push
```

If not (self-hosted dev), copy-paste the SQL into Studio at http://135.225.104.142:3000 and run it against the dev DB.

Verify two new columns exist:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'atad2_session_documents'
  AND column_name IN ('is_thin', 'category_source');
```
Expected: 2 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525100000_document_quality_meter.sql
git commit -m "feat(db): add is_thin and category_source columns + new categories"
```

---

## Task 2: Add new categories to types.ts and extend SessionDocument

**Files:**
- Modify: `src/lib/prefill/types.ts`

- [ ] **Step 1: Add the two new category entries**

In `src/lib/prefill/types.ts`, change the `DOCUMENT_CATEGORIES` array. Find:

```ts
export const DOCUMENT_CATEGORIES = [
  { value: "financial_statements", label: "Financial statements" },
  { value: "tax_returns", label: "Tax returns" },
  { value: "local_file", label: "Local file" },
  { value: "master_file", label: "Master file" },
  { value: "previous_year_atad2_analysis", label: "Previous year ATAD2 analysis" },
  { value: "trial_balance", label: "Trial balance" },
  { value: "general_ledger", label: "General ledger" },
  { value: "memo", label: "Memo" },
  { value: "comment_letter_to_tax_return", label: "Comment letter to tax return" },
  { value: "other", label: "Other" },
] as const;
```

Replace with:

```ts
export const DOCUMENT_CATEGORIES = [
  { value: "financial_statements", label: "Financial statements" },
  { value: "tax_returns", label: "Tax returns" },
  { value: "structure_chart", label: "Structure chart" },
  { value: "previous_year_atad2_analysis", label: "Previous year ATAD2 analysis" },
  { value: "client_correspondence", label: "Client correspondence" },
  { value: "local_file", label: "Local file" },
  { value: "master_file", label: "Master file" },
  { value: "trial_balance", label: "Trial balance" },
  { value: "general_ledger", label: "General ledger" },
  { value: "memo", label: "Memo" },
  { value: "comment_letter_to_tax_return", label: "Comment letter to tax return" },
  { value: "other", label: "Other" },
] as const;
```

(Order matters for the dropdown — most relevant first.)

- [ ] **Step 2: Extend `SessionDocument` interface**

Find the `SessionDocument` interface (around line 74) and add the two new fields:

```ts
export interface SessionDocument {
  id: string;
  session_id: string;
  filename: string;
  doc_label: string;
  category: DocumentCategory;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "summarizing" | "summarized" | "failed";
  error_message: string | null;
  relevance_note: string | null;
  created_at: string;
  is_thin: boolean;
  category_source: "filename" | "ai" | "user";
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: PASS (no new errors). If pre-existing errors appear, ignore them — focus only on errors introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prefill/types.ts
git commit -m "feat(prefill): add structure_chart and client_correspondence categories"
```

---

## Task 3: Filename heuristic (TDD)

**Files:**
- Create: `src/lib/prefill/categorize.ts`
- Test: `src/lib/prefill/__tests__/categorize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/prefill/__tests__/categorize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { categorizeFromFilename } from '../categorize';

describe('categorizeFromFilename', () => {
  it.each([
    ['jaarrekening-2024.pdf',          'financial_statements'],
    ['Annual Report 2023.pdf',         'financial_statements'],
    ['Financial Statements.docx',      'financial_statements'],
    ['aangifte-vpb-2024.pdf',          'tax_returns'],
    ['VPB Return 2023.pdf',            'tax_returns'],
    ['corporate_tax_filing.pdf',       'tax_returns'],
    ['holding-structure.png',          'structure_chart'],
    ['Organogram.pdf',                 'structure_chart'],
    ['org-chart-2025.pdf',             'structure_chart'],
    ['ATAD2 analyse 2023.docx',        'previous_year_atad2_analysis'],
    ['previous-year-atad-memo.pdf',    'previous_year_atad2_analysis'],
    ['Master File 2024.pdf',           'master_file'],
    ['Local File NL.pdf',              'local_file'],
    ['Trial Balance Q4.xlsx',          'trial_balance'],
    ['kolommenbalans 2024.xlsx',       'trial_balance'],
    ['general ledger.xlsx',            'general_ledger'],
    ['grootboek 2024.csv',             'general_ledger'],
    ['Memo on transfer pricing.docx',  'memo'],
    ['comment letter to FTA.pdf',      'comment_letter_to_tax_return'],
    ['email_thread.eml',               'client_correspondence'],
    ['Outlook message.msg',            'client_correspondence'],
    ['correspondentie-cliënt.pdf',     'client_correspondence'],
    ['random-document.pdf',            'other'],
    ['IMG_1234.png',                   'other'],
    ['',                               'other'],
  ])('"%s" → %s', (filename, expected) => {
    expect(categorizeFromFilename(filename)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(categorizeFromFilename('JAARREKENING.PDF')).toBe('financial_statements');
  });

  it('returns first matching category when multiple patterns apply', () => {
    // "atad2-memo" matches both `memo` and `previous_year_atad2_analysis`;
    // the ATAD pattern is listed first so it wins.
    expect(categorizeFromFilename('atad2-memo.pdf')).toBe('previous_year_atad2_analysis');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/lib/prefill/__tests__/categorize.test.ts
```
Expected: FAIL with "Cannot find module '../categorize'".

- [ ] **Step 3: Implement the heuristic**

Create `src/lib/prefill/categorize.ts`:

```ts
import type { DocumentCategory } from './types';

// First match wins. Order matters: more specific patterns come first.
// All patterns are tested case-insensitively against the filename.
const RULES: Array<{ pattern: RegExp; category: DocumentCategory }> = [
  // ATAD-specific first — beats generic "memo"
  { pattern: /atad2?.*(analyse|analysis|memo|review)/i,                category: 'previous_year_atad2_analysis' },
  { pattern: /previous.year.atad/i,                                    category: 'previous_year_atad2_analysis' },

  // Financial statements
  { pattern: /jaarrekening/i,                                          category: 'financial_statements' },
  { pattern: /annual.report/i,                                         category: 'financial_statements' },
  { pattern: /financial.statement/i,                                   category: 'financial_statements' },

  // Tax returns
  { pattern: /aangifte/i,                                              category: 'tax_returns' },
  { pattern: /\bvpb\b/i,                                               category: 'tax_returns' },
  { pattern: /corporate.tax/i,                                         category: 'tax_returns' },
  { pattern: /tax.(return|filing)/i,                                   category: 'tax_returns' },

  // Structure
  { pattern: /(structure|organogram|org.chart|holding.chart)/i,        category: 'structure_chart' },

  // Transfer pricing
  { pattern: /master.file/i,                                           category: 'master_file' },
  { pattern: /local.file/i,                                            category: 'local_file' },

  // Bookkeeping
  { pattern: /(trial.balance|kolommenbalans)/i,                        category: 'trial_balance' },
  { pattern: /(general.ledger|grootboek)/i,                            category: 'general_ledger' },

  // Memo / correspondence
  { pattern: /comment.letter/i,                                        category: 'comment_letter_to_tax_return' },
  { pattern: /(memo|memorandum)/i,                                     category: 'memo' },
  { pattern: /(email|correspondence|correspondentie)/i,                category: 'client_correspondence' },
  { pattern: /\.(eml|msg)$/i,                                          category: 'client_correspondence' },
];

export function categorizeFromFilename(filename: string): DocumentCategory {
  if (!filename) return 'other';
  for (const { pattern, category } of RULES) {
    if (pattern.test(filename)) return category;
  }
  return 'other';
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/lib/prefill/__tests__/categorize.test.ts
```
Expected: PASS for all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefill/categorize.ts src/lib/prefill/__tests__/categorize.test.ts
git commit -m "feat(prefill): filename → category heuristic"
```

---

## Task 4: Quality meter computation (TDD)

**Files:**
- Create: `src/lib/prefill/qualityMeter.ts`
- Test: `src/lib/prefill/__tests__/qualityMeter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/prefill/__tests__/qualityMeter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeQuality } from '../qualityMeter';
import type { SessionDocument } from '../types';

function doc(overrides: Partial<SessionDocument> = {}): SessionDocument {
  return {
    id: crypto.randomUUID(),
    session_id: 'sess',
    filename: 'x.pdf',
    doc_label: 'x',
    category: 'financial_statements',
    storage_path: 'x',
    mime_type: 'application/pdf',
    size_bytes: 1000,
    status: 'uploaded',
    error_message: null,
    relevance_note: null,
    created_at: new Date().toISOString(),
    is_thin: false,
    category_source: 'ai',
    ...overrides,
  };
}

describe('computeQuality', () => {
  it('returns Empty when no docs', () => {
    const q = computeQuality([]);
    expect(q.tier).toBe('empty');
    expect(q.segments).toBe(0);
    expect(q.distinctCategories).toEqual([]);
  });

  it('returns Good for 1 qualifying doc', () => {
    const q = computeQuality([doc({ category: 'financial_statements' })]);
    expect(q.tier).toBe('good');
    expect(q.segments).toBe(2);
  });

  it('returns Strong for 2 distinct categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.tier).toBe('strong');
    expect(q.segments).toBe(3);
  });

  it('returns Excellent for 3+ distinct categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
      doc({ category: 'structure_chart' }),
    ]);
    expect(q.tier).toBe('excellent');
    expect(q.segments).toBe(4);
  });

  it('does not double-count duplicate categories', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'financial_statements' }),
      doc({ category: 'financial_statements' }),
    ]);
    expect(q.tier).toBe('good');
    expect(q.distinctCategories).toEqual(['financial_statements']);
  });

  it('ignores "other" docs', () => {
    const q = computeQuality([
      doc({ category: 'other' }),
      doc({ category: 'other' }),
    ]);
    expect(q.tier).toBe('empty');
  });

  it('ignores thin docs', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements', is_thin: true }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.tier).toBe('good');
    expect(q.distinctCategories).toEqual(['tax_returns']);
  });

  it('treats all-thin docs as Empty', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements', is_thin: true }),
      doc({ category: 'tax_returns', is_thin: true }),
    ]);
    expect(q.tier).toBe('empty');
  });

  it('hint at Empty asks for a document', () => {
    expect(computeQuality([]).hint).toMatch(/add a document/i);
  });

  it('hint at Good suggests another type', () => {
    expect(computeQuality([doc({ category: 'financial_statements' })]).hint).toMatch(/another type/i);
  });

  it('hint at Strong suggests one more type', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
    ]);
    expect(q.hint).toMatch(/one more type/i);
  });

  it('hint at Excellent celebrates', () => {
    const q = computeQuality([
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
      doc({ category: 'structure_chart' }),
    ]);
    expect(q.hint).toMatch(/excellent/i);
  });

  it('missingTypes at Good excludes already-present', () => {
    const q = computeQuality([doc({ category: 'financial_statements' })]);
    expect(q.missingTypes).not.toContain('financial_statements');
    expect(q.missingTypes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/lib/prefill/__tests__/qualityMeter.test.ts
```
Expected: FAIL with "Cannot find module '../qualityMeter'".

- [ ] **Step 3: Implement the module**

Create `src/lib/prefill/qualityMeter.ts`:

```ts
import type { DocumentCategory, SessionDocument } from './types';

export type QualityTier = 'empty' | 'good' | 'strong' | 'excellent';

export interface QualityResult {
  tier: QualityTier;
  segments: 0 | 2 | 3 | 4;
  distinctCategories: DocumentCategory[];
  hint: string;
  missingTypes: DocumentCategory[];
}

// Categories we actively suggest the user add (ordered by perceived value).
// 'other' is never suggested; bookkeeping categories are not surfaced as
// suggestions because they're rarely what tips a borderline analysis.
const SUGGESTED_TYPES: DocumentCategory[] = [
  'financial_statements',
  'tax_returns',
  'structure_chart',
  'previous_year_atad2_analysis',
  'client_correspondence',
  'master_file',
  'local_file',
];

const LABELS: Record<DocumentCategory, string> = {
  financial_statements: 'financial statements',
  tax_returns: 'a corporate tax return',
  structure_chart: 'a structure chart',
  previous_year_atad2_analysis: 'a prior ATAD2 analysis',
  client_correspondence: 'client correspondence',
  master_file: 'a master file',
  local_file: 'a local file',
  trial_balance: 'a trial balance',
  general_ledger: 'a general ledger',
  memo: 'an internal memo',
  comment_letter_to_tax_return: 'a comment letter',
  other: 'a document',
};

export function computeQuality(docs: SessionDocument[]): QualityResult {
  const qualifying = docs.filter(
    (d) => d.category !== 'other' && !d.is_thin
  );
  const distinct = Array.from(new Set(qualifying.map((d) => d.category))) as DocumentCategory[];
  const missingTypes = SUGGESTED_TYPES.filter((t) => !distinct.includes(t));

  if (distinct.length === 0) {
    return {
      tier: 'empty',
      segments: 0,
      distinctCategories: distinct,
      hint: 'Add a document to start.',
      missingTypes,
    };
  }
  if (distinct.length === 1) {
    const next = missingTypes.slice(0, 1).map((t) => LABELS[t]).join('');
    return {
      tier: 'good',
      segments: 2,
      distinctCategories: distinct,
      hint: next
        ? `Good start — add another type (${next}) for more context.`
        : 'Good start — add another type for more context.',
      missingTypes,
    };
  }
  if (distinct.length === 2) {
    const next = missingTypes.slice(0, 1).map((t) => LABELS[t]).join('');
    return {
      tier: 'strong',
      segments: 3,
      distinctCategories: distinct,
      hint: next
        ? `Strong — one more type (${next}) would round it out.`
        : 'Strong — one more type would round it out.',
      missingTypes,
    };
  }
  return {
    tier: 'excellent',
    segments: 4,
    distinctCategories: distinct,
    hint: 'Excellent — comprehensive set of documents.',
    missingTypes,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/lib/prefill/__tests__/qualityMeter.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefill/qualityMeter.ts src/lib/prefill/__tests__/qualityMeter.test.ts
git commit -m "feat(prefill): quality-meter scoring (Empty/Good/Strong/Excellent)"
```

---

## Task 5: DocumentQualityMeter component

**Files:**
- Create: `src/components/prefill/DocumentQualityMeter.tsx`
- Test: `src/components/prefill/__tests__/DocumentQualityMeter.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/prefill/__tests__/DocumentQualityMeter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentQualityMeter } from '../DocumentQualityMeter';
import type { SessionDocument } from '@/lib/prefill/types';

function doc(overrides: Partial<SessionDocument> = {}): SessionDocument {
  return {
    id: crypto.randomUUID(),
    session_id: 's',
    filename: 'x.pdf',
    doc_label: 'x',
    category: 'financial_statements',
    storage_path: 'x',
    mime_type: 'application/pdf',
    size_bytes: 1,
    status: 'uploaded',
    error_message: null,
    relevance_note: null,
    created_at: '',
    is_thin: false,
    category_source: 'ai',
    ...overrides,
  };
}

describe('DocumentQualityMeter', () => {
  it('renders Empty state when no docs', () => {
    render(<DocumentQualityMeter docs={[]} />);
    expect(screen.getByText(/add a document to start/i)).toBeInTheDocument();
    // No pill on empty
    expect(screen.queryByText(/^Good$|^Strong$|^Excellent$/)).not.toBeInTheDocument();
  });

  it('renders Good pill for 1 doc', () => {
    render(<DocumentQualityMeter docs={[doc({ category: 'financial_statements' })]} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('renders Strong pill for 2 distinct categories', () => {
    render(<DocumentQualityMeter docs={[
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
    ]} />);
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('renders Excellent pill for 3+ distinct categories', () => {
    render(<DocumentQualityMeter docs={[
      doc({ category: 'financial_statements' }),
      doc({ category: 'tax_returns' }),
      doc({ category: 'structure_chart' }),
    ]} />);
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/components/prefill/__tests__/DocumentQualityMeter.test.tsx
```
Expected: FAIL with "Cannot find module '../DocumentQualityMeter'".

- [ ] **Step 3: Implement the component**

Create `src/components/prefill/DocumentQualityMeter.tsx`:

```tsx
import { computeQuality, type QualityTier } from '@/lib/prefill/qualityMeter';
import type { SessionDocument } from '@/lib/prefill/types';

interface Props {
  docs: SessionDocument[];
}

const TIER_PILL: Record<Exclude<QualityTier, 'empty'>, { label: string; pill: string }> = {
  good:      { label: 'Good',      pill: 'bg-amber-100 text-amber-800' },
  strong:    { label: 'Strong',    pill: 'bg-lime-100 text-lime-800' },
  excellent: { label: 'Excellent', pill: 'bg-emerald-100 text-emerald-800' },
};

const SEGMENT_COLOR: Record<Exclude<QualityTier, 'empty'>, string> = {
  good:      'bg-amber-400',
  strong:    'bg-lime-500',
  excellent: 'bg-emerald-500',
};

export function DocumentQualityMeter({ docs }: Props) {
  const q = computeQuality(docs);

  return (
    <div className="flex items-center gap-3 text-sm">
      {q.tier !== 'empty' && (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_PILL[q.tier].pill}`}>
          {TIER_PILL[q.tier].label}
        </span>
      )}
      <div className="flex gap-1 w-32" aria-label={`Quality: ${q.tier}, ${q.segments} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${
              i < q.segments && q.tier !== 'empty'
                ? SEGMENT_COLOR[q.tier]
                : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{q.hint}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/components/prefill/__tests__/DocumentQualityMeter.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prefill/DocumentQualityMeter.tsx src/components/prefill/__tests__/DocumentQualityMeter.test.tsx
git commit -m "feat(prefill): DocumentQualityMeter component (segmented bar + pill)"
```

---

## Task 6: LowQualityGateDialog component

**Files:**
- Create: `src/components/prefill/LowQualityGateDialog.tsx`
- Test: `src/components/prefill/__tests__/LowQualityGateDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/prefill/__tests__/LowQualityGateDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LowQualityGateDialog } from '../LowQualityGateDialog';

describe('LowQualityGateDialog', () => {
  it('shows Empty copy when tier is empty', () => {
    render(
      <LowQualityGateDialog
        open
        onOpenChange={vi.fn()}
        tier="empty"
        currentCategories={[]}
        missingTypes={['financial_statements', 'tax_returns']}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/run pre-fill without documents/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue without/i })).toBeInTheDocument();
  });

  it('shows Good copy mentioning what user already has', () => {
    render(
      <LowQualityGateDialog
        open
        onOpenChange={vi.fn()}
        tier="good"
        currentCategories={['financial_statements']}
        missingTypes={['tax_returns', 'structure_chart']}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/solid start/i)).toBeInTheDocument();
    expect(screen.getByText(/financial statements/i)).toBeInTheDocument();
  });

  it('calls onConfirm when Continue is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <LowQualityGateDialog
        open
        onOpenChange={vi.fn()}
        tier="empty"
        currentCategories={[]}
        missingTypes={['financial_statements']}
        onConfirm={onConfirm}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /continue without/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/components/prefill/__tests__/LowQualityGateDialog.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement the dialog**

Create `src/components/prefill/LowQualityGateDialog.tsx`:

```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/prefill/types';
import type { QualityTier } from '@/lib/prefill/qualityMeter';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: QualityTier;
  currentCategories: DocumentCategory[];
  missingTypes: DocumentCategory[];
  onConfirm: () => void;
}

const LABEL_BY_VALUE = Object.fromEntries(
  DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<DocumentCategory, string>;

export function LowQualityGateDialog({
  open,
  onOpenChange,
  tier,
  currentCategories,
  missingTypes,
  onConfirm,
}: Props) {
  const isEmpty = tier === 'empty';
  const haveLabels = currentCategories.map((c) => LABEL_BY_VALUE[c].toLowerCase()).join(', ');
  const suggestions = missingTypes
    .slice(0, 2)
    .map((c) => LABEL_BY_VALUE[c].toLowerCase())
    .join(' or ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEmpty ? 'Run pre-fill without documents?' : 'Solid start — want to add more?'}
          </DialogTitle>
          <DialogDescription>
            {isEmpty
              ? "Pre-fill works best when there's something to ground it in. Without documents, suggestions will be based purely on the answers you've already given."
              : `You've added ${haveLabels}. The pre-fill will work, but tends to be much sharper with at least one more type${suggestions ? ` — ${suggestions}` : ''}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEmpty ? 'Cancel — add documents' : 'Add more documents'}
          </Button>
          <Button onClick={onConfirm}>
            {isEmpty ? 'Continue without' : 'Run pre-fill anyway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/components/prefill/__tests__/LowQualityGateDialog.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/prefill/LowQualityGateDialog.tsx src/components/prefill/__tests__/LowQualityGateDialog.test.tsx
git commit -m "feat(prefill): LowQualityGateDialog (soft gate for Empty/Good)"
```

---

## Task 7: CategoryDropdown component

**Files:**
- Create: `src/components/prefill/CategoryDropdown.tsx`

(No isolated test — exercised via the DocumentUploader integration test in QA.)

- [ ] **Step 1: Implement the dropdown**

Create `src/components/prefill/CategoryDropdown.tsx`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/prefill/types';

interface Props {
  value: DocumentCategory;
  source: 'filename' | 'ai' | 'user';
  disabled?: boolean;
  onChange: (next: DocumentCategory) => void;
}

export function CategoryDropdown({ value, source, disabled, onChange }: Props) {
  const isSuggested = source !== 'user';
  return (
    <div className="flex items-center gap-1.5">
      <Select value={value} onValueChange={(v) => onChange(v as DocumentCategory)} disabled={disabled}>
        <SelectTrigger className="h-7 w-[180px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value} className="text-xs">
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSuggested && (
        <span className="text-[10px] text-muted-foreground italic">suggested</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/prefill/CategoryDropdown.tsx
git commit -m "feat(prefill): CategoryDropdown with 'suggested' badge"
```

---

## Task 8: classify-document Edge Function

**Files:**
- Create: `supabase/functions/classify-document/index.ts`

- [ ] **Step 1: Implement the function**

Create `supabase/functions/classify-document/index.ts`:

```ts
import { serve } from "std/http/server.ts";
import { createClient } from "supabase";
import Anthropic from "anthropic";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_CATEGORIES = [
  "financial_statements",
  "tax_returns",
  "structure_chart",
  "previous_year_atad2_analysis",
  "client_correspondence",
  "local_file",
  "master_file",
  "trial_balance",
  "general_ledger",
  "memo",
  "comment_letter_to_tax_return",
  "other",
] as const;

const SYSTEM_PROMPT = `You are classifying a document uploaded to a Dutch corporate-tax (ATAD2) advisory tool.
Pick exactly one category from the list and return strict JSON: { "category": "<value>", "confidence": <0..1> }.
Valid categories: ${VALID_CATEGORIES.join(", ")}.
"other" is the fallback when nothing fits. Use confidence 0..1 to indicate how sure you are.`;

const THIN_WORD_THRESHOLD = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { document_id } = (await req.json()) as { document_id?: string };
    if (!document_id) return json({ error: "Missing document_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Load the document row.
    const { data: doc, error: docErr } = await supabase
      .from("atad2_session_documents")
      .select("id, filename, storage_path, mime_type, category, category_source")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) return json({ error: "Document not found" }, 404);

    // 2. User overrides are sacred — never overwrite.
    if (doc.category_source === "user") {
      return json({ skipped: "user_override" }, 200);
    }

    // 3. Pull a small chunk of content to look at.
    const { sample, isThin } = await fetchSample(supabase, doc.storage_path, doc.mime_type);

    // 4. If we have nothing to look at, just mark thin and exit.
    if (!sample) {
      await supabase
        .from("atad2_session_documents")
        .update({ is_thin: true, category_source: "ai" })
        .eq("id", document_id);
      return json({ category: doc.category, is_thin: true }, 200);
    }

    // 5. Ask Haiku to classify. Send filename + sample.
    let aiCategory: string | null = null;
    let confidence = 0;
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Filename: ${doc.filename}\n\nContent sample:\n${sample.slice(0, 2000)}`,
        }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        const parsed = parseClassification(textBlock.text);
        if (parsed) {
          aiCategory = parsed.category;
          confidence = parsed.confidence;
        }
      }
    } catch (err) {
      console.error("[classify-document] anthropic failed", err);
    }

    // 6. Decide what to write back.
    const patch: { is_thin: boolean; category_source: "ai"; category?: string } = {
      is_thin: isThin,
      category_source: "ai",
    };
    if (aiCategory && VALID_CATEGORIES.includes(aiCategory as typeof VALID_CATEGORIES[number]) && confidence >= 0.5) {
      patch.category = aiCategory;
    }

    const { error: updErr } = await supabase
      .from("atad2_session_documents")
      .update(patch)
      .eq("id", document_id);
    if (updErr) {
      console.error("[classify-document] update failed", updErr);
      return json({ error: "Update failed" }, 500);
    }

    return json({ category: patch.category ?? doc.category, is_thin: isThin }, 200);
  } catch (err) {
    console.error("[classify-document] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function fetchSample(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storagePath: string,
  mimeType: string,
): Promise<{ sample: string; isThin: boolean }> {
  // Images have no text content here — flag thin.
  if (mimeType.startsWith("image/")) {
    return { sample: "", isThin: true };
  }
  const { data: file, error } = await supabase.storage.from("session-documents").download(storagePath);
  if (error || !file) return { sample: "", isThin: true };
  // PDFs and DOCX are stored as text/plain because the client extracts text
  // at upload time (see useUploadDocument). So we can just .text() everything
  // text-ish that lands here.
  const text = (await file.text()).trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  return { sample: text, isThin: wordCount < THIN_WORD_THRESHOLD };
}

function parseClassification(raw: string): { category: string; confidence: number } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.category !== "string" || typeof obj.confidence !== "number") return null;
    return { category: obj.category, confidence: obj.confidence };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 2: Add a deno.json if not auto-resolved**

Check whether the function's imports resolve via the project's import map:

```bash
cat supabase/functions/prefill-documents/deno.json
```

If a deno.json exists in `prefill-documents`, copy it to `supabase/functions/classify-document/deno.json` (same imports — `std`, `supabase`, `anthropic`). If `prefill-documents` doesn't have one (uses workspace-level config), no action needed.

- [ ] **Step 3: Deploy the function**

```bash
npx supabase functions deploy classify-document
```

Watch the logs to confirm it boots:
```bash
npx supabase functions logs classify-document --tail
```

- [ ] **Step 4: Smoke test against a known doc**

```bash
curl -X POST "https://<your-project>.supabase.co/functions/v1/classify-document" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document_id": "<existing-doc-uuid>"}'
```

Expected: `{ "category": "...", "is_thin": false }`. Then verify the row was updated:
```sql
SELECT category, category_source, is_thin
FROM atad2_session_documents
WHERE id = '<that-uuid>';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/classify-document/
git commit -m "feat(edge): classify-document for category + thin detection"
```

---

## Task 9: Apply heuristic at upload time + add useClassifyDocument hook

**Files:**
- Modify: `src/hooks/usePrefill.ts`

- [ ] **Step 1: Import the heuristic in usePrefill.ts**

At the top of `src/hooks/usePrefill.ts`, add:

```ts
import { categorizeFromFilename } from "@/lib/prefill/categorize";
```

- [ ] **Step 2: Replace the insert in `useUploadDocument`**

Find the row insert (around line 181):

```ts
        .insert({
          id: docId,
          session_id: sessionId,
          filename: pending.file.name,
          doc_label: pending.docLabel,
          category: pending.category ?? "other",
          storage_path: storagePath,
          mime_type: uploadMime,
          size_bytes: uploadSize,
          relevance_note: null,
        })
```

Replace with:

```ts
        .insert({
          id: docId,
          session_id: sessionId,
          filename: pending.file.name,
          doc_label: pending.docLabel,
          category: pending.category ?? categorizeFromFilename(pending.file.name),
          category_source: pending.category ? "user" : "filename",
          storage_path: storagePath,
          mime_type: uploadMime,
          size_bytes: uploadSize,
          relevance_note: null,
        })
```

- [ ] **Step 3: Replace the insert in `useUploadText`**

Find the insert in `useUploadText` (around line 240):

```ts
        .insert({
          id: docId,
          session_id: sessionId,
          filename: `${label}.txt`,
          doc_label: label,
          category,
          storage_path: storagePath,
          mime_type: "text/plain",
          size_bytes: blob.size,
          relevance_note: (relevanceNote ?? "").trim() || null,
        })
```

Replace with:

```ts
        .insert({
          id: docId,
          session_id: sessionId,
          filename: `${label}.txt`,
          doc_label: label,
          category,
          category_source: "filename",
          storage_path: storagePath,
          mime_type: "text/plain",
          size_bytes: blob.size,
          relevance_note: (relevanceNote ?? "").trim() || null,
        })
```

(Even though the caller passes a category, it's not a true user choice — keep it as `filename` so the classifier can refine.)

- [ ] **Step 4: Add `useClassifyDocument`**

After `useUploadText` ends (around line 266), add:

```ts
export function useClassifyDocument(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId }: { documentId: string }) => {
      const { data, error } = await supabase.functions.invoke("classify-document", {
        body: { document_id: documentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["session-documents", sessionId] });
    },
  });
}
```

- [ ] **Step 5: Mark user overrides in `useUpdateDocumentCategory`**

Find `useUpdateDocumentCategory` (around line 377) and change the update:

```ts
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category })
        .eq("id", docId);
```

To:

```ts
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category, category_source: "user" })
        .eq("id", docId);
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "feat(prefill): heuristic on upload + useClassifyDocument hook + user override marker"
```

---

## Task 10: Wire CategoryDropdown + classify-trigger into DocumentUploader

**Files:**
- Modify: `src/components/prefill/DocumentUploader.tsx`

- [ ] **Step 1: Add the imports**

At the top of `src/components/prefill/DocumentUploader.tsx`, add:

```tsx
import { CategoryDropdown } from "./CategoryDropdown";
import { useClassifyDocument, useUpdateDocumentCategory } from "@/hooks/usePrefill";
import type { DocumentCategory } from "@/lib/prefill/types";
```

- [ ] **Step 2: Get the hook instances inside the component**

Inside the `DocumentUploader` component body (after the `upload = useUploadDocument(sessionId)` line), add:

```tsx
  const classify = useClassifyDocument(sessionId);
  const updateCategory = useUpdateDocumentCategory(sessionId);
```

- [ ] **Step 3: Fire classify on successful upload**

Find the existing onSuccess in the `upload.mutate({ pending: p }, ...)` call (around line 60):

```tsx
        onSuccess: (doc) => store.setStatus(p.localId, "uploaded", { remoteDocumentId: doc?.id }),
```

Replace with:

```tsx
        onSuccess: (doc) => {
          store.setStatus(p.localId, "uploaded", { remoteDocumentId: doc?.id });
          if (doc?.id) {
            classify.mutate({ documentId: doc.id });
          }
        },
```

- [ ] **Step 4: Render the CategoryDropdown on each uploaded file row**

Find the uploaded docs map (around line 118-132):

```tsx
        {(uploadedDocs ?? [])
          .filter((d) => !store.pendingFiles.some((p) => p.remoteDocumentId === d.id))
          .map((d) => (
            <Card key={d.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-all flex items-center gap-2" title={d.filename}>
                  {d.mime_type === "text/plain" && <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {d.doc_label || d.filename}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(d.size_bytes)} · {d.status === "summarized" ? "Ready" : d.status === "summarizing" ? "Analyzing…" : d.status}
                </div>
              </div>
            </Card>
          ))}
```

Replace with:

```tsx
        {(uploadedDocs ?? [])
          .filter((d) => !store.pendingFiles.some((p) => p.remoteDocumentId === d.id))
          .map((d) => (
            <Card key={d.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-all flex items-center gap-2" title={d.filename}>
                  {d.mime_type === "text/plain" && <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {d.doc_label || d.filename}
                  {d.is_thin && (
                    <span className="text-[10px] text-amber-700 italic">looks empty</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(d.size_bytes)} · {d.status === "summarized" ? "Ready" : d.status === "summarizing" ? "Analyzing…" : d.status}
                </div>
              </div>
              {!locked && (
                <CategoryDropdown
                  value={d.category}
                  source={d.category_source}
                  onChange={(next: DocumentCategory) =>
                    updateCategory.mutate({ docId: d.id, category: next })
                  }
                />
              )}
            </Card>
          ))}
```

- [ ] **Step 5: Type-check and run all tests**

```bash
npx tsc --noEmit && npx vitest run --reporter=dot
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/prefill/DocumentUploader.tsx
git commit -m "feat(prefill): per-file CategoryDropdown + auto-classify on upload"
```

---

## Task 11: Render meter + soft-gate in AssessmentUpload page

**Files:**
- Modify: `src/pages/AssessmentUpload.tsx`

**Context:** The footer is owned by the page, not the step. [src/pages/AssessmentUpload.tsx](src/pages/AssessmentUpload.tsx) already renders an `<AssessmentFooterSlot>` with a Skip button (left) and Continue button (right). The existing "Skip without uploading documents?" AlertDialog already covers the *Empty* case (Continue is disabled at 0 docs). We add the *Good*-tier gate by wrapping the Continue button's click handler.

- [ ] **Step 1: Add the new imports**

In `src/pages/AssessmentUpload.tsx`, find the imports block (lines 1-24). Add:

```ts
import { DocumentQualityMeter } from "@/components/prefill/DocumentQualityMeter";
import { LowQualityGateDialog } from "@/components/prefill/LowQualityGateDialog";
import { computeQuality } from "@/lib/prefill/qualityMeter";
```

- [ ] **Step 2: Compute quality and add dialog state**

After the existing `const allPendingUploaded = …` line (around line 38) add:

```ts
  const quality = computeQuality(docs ?? []);
  const [gateOpen, setGateOpen] = useState(false);

  // Per-session dismissal — once the user clicks "Run pre-fill anyway" we
  // don't nag again until they upload something new or change a category.
  const dismissKey = `quality-gate-dismissed:${sessionId}`;
  const wasDismissed = () => sessionStorage.getItem(dismissKey) === String(quality.distinctCategories.length);

  const handleContinueClick = () => {
    if (quality.tier === "good" && !wasDismissed()) {
      setGateOpen(true);
      return;
    }
    handleContinue();
  };

  const confirmFromGate = () => {
    sessionStorage.setItem(dismissKey, String(quality.distinctCategories.length));
    setGateOpen(false);
    handleContinue();
  };
```

(Empty tier can never reach Continue — that button is disabled at 0 docs. Strong/Excellent fall straight through to `handleContinue` without a dialog. So in practice the gate only triggers on Good.)

- [ ] **Step 3: Replace the right-slot Button + add the meter alongside it**

Find the `right={…}` prop on `<AssessmentFooterSlot>` (around lines 118-127):

```tsx
        right={
          <Button
            onClick={handleContinue}
            disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
            className="transition-all duration-fast"
          >
            Continue to questions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
```

Replace with:

```tsx
        right={
          <div className="flex items-center gap-4">
            <DocumentQualityMeter docs={docs ?? []} />
            <Button
              onClick={handleContinueClick}
              disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
              className="transition-all duration-fast"
            >
              Continue to questions
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        }
```

- [ ] **Step 4: Mount the gate dialog**

Just before the closing `</div>` at the end of the `return` (after the `<AssessmentFooterSlot>` closes), add:

```tsx
      <LowQualityGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        tier={quality.tier}
        currentCategories={quality.distinctCategories}
        missingTypes={quality.missingTypes}
        onConfirm={confirmFromGate}
      />
```

- [ ] **Step 5: Type-check and run all tests**

```bash
npx tsc --noEmit && npx vitest run --reporter=dot
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AssessmentUpload.tsx
git commit -m "feat(assessment): quality meter + soft-gate on Continue to questions"
```

---

## Task 12: Regenerate Supabase TypeScript types (or hand-patch)

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Try the regenerate command**

```bash
npx supabase gen types typescript --project-id <project-id> > src/integrations/supabase/types.ts
```

If you have a Supabase CLI link configured, this should work. If not (self-hosted dev), skip and hand-patch in Step 2.

- [ ] **Step 2: Hand-patch if needed**

In `src/integrations/supabase/types.ts`, find the `atad2_session_documents` table type (search for `atad2_session_documents`) and add `is_thin: boolean` and `category_source: string` to both the `Row` and `Insert`/`Update` definitions. Look at how `relevance_note` is defined and follow the same pattern (probably `is_thin: boolean | null` is fine if the column is non-nullable but the type currently uses optional).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regen Supabase types for is_thin + category_source"
```

---

## Task 13: Manual QA in the browser

**Files:** none

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the app in your browser, sign in, and start (or resume) an assessment that has reached the Document Upload step.

- [ ] **Step 2: Empty state**

- No documents → meter shows 0/4 segments, no pill, "Add a document to start" hint.
- Click "Next" → soft-gate dialog with Empty copy appears.
- Click "Cancel — add documents" → dialog closes, stays on step.

- [ ] **Step 3: One upload → Good**

- Drop a `jaarrekening-2024.pdf` (any PDF with that filename).
- Within a second, file row appears with category "Financial statements (suggested)".
- Meter jumps to Good (2/4 segments, amber pill).
- A few seconds later the "(suggested)" badge may stay or the category may refine; row stays editable.
- Click "Next" → Good-copy dialog mentions "financial statements". Click "Add more documents" — dialog closes.

- [ ] **Step 4: Two distinct → Strong**

- Add a second file with category that resolves differently (e.g., `aangifte-vpb.pdf`).
- Meter jumps to Strong (3/4, lime pill).
- Click "Next" → no dialog, advances directly.

- [ ] **Step 5: Three distinct → Excellent**

- Go back, add `structure-chart.pdf`.
- Meter shows Excellent (4/4, emerald pill).

- [ ] **Step 6: User override sticks**

- Click the dropdown on the structure_chart file → change to "Memo".
- Refresh the page → category stays "Memo" (no AI override).
- "(suggested)" badge is gone.

- [ ] **Step 7: Thin file detection**

- Upload an empty/near-empty PDF (or a tiny text file under 200 words).
- After classify completes, row shows "looks empty" indicator.
- Meter does NOT increment for that file's category.

- [ ] **Step 8: Console errors**

Open DevTools console — no errors from classify-document failures should leak (silent failures only). If you see errors, capture them and investigate before declaring done.

- [ ] **Step 9: Edge function logs**

```bash
npx supabase functions logs classify-document --tail
```

Verify each upload triggered one classify call, and that user overrides did NOT trigger re-classification.

---

## Self-review checklist (run after Task 13)

- [ ] **Spec coverage** — every section of [docs/superpowers/specs/2026-05-25-document-upload-quality-meter-design.md](docs/superpowers/specs/2026-05-25-document-upload-quality-meter-design.md) has at least one corresponding task:
  - Tier-mapping → Task 4 + Task 5
  - Datamodel → Task 1 + Task 2 + Task 12
  - Filename heuristic → Task 3
  - Quality module → Task 4
  - Edge Function → Task 8
  - Frontend components → Tasks 5, 6, 7, 10
  - Data-flow → Tasks 9, 10
  - Soft-gate dialog → Task 6 + Task 11
  - Out of scope respected → only the upload step gets the meter (Task 11); no SessionCard / dashboard changes.

- [ ] **Behavior matches spec** —
  - 1 upload = at minimum Good (never Fair). Validated in QA Step 3.
  - Distinct categories drive the score (not file count). Validated by qualityMeter tests.
  - `other` and `is_thin` don't count. Validated by qualityMeter tests + QA Step 7.
  - User overrides survive subsequent classify calls. Validated by edge function early return + QA Step 6.

- [ ] **Final cleanup commit if needed** — if QA found any console logs, debug prints, or tweaks, make one cleanup commit before declaring done.

---

## Open behaviour question for follow-up

The plan currently triggers the soft-gate dialog at **both** Empty and Good. The spec flags this as configurable — once a few real users have used it, decide whether the Good-dialog interrupts too often and either:

- keep it (educational nudge wins), or
- (The current implementation only fires on Good — Empty is structurally covered by the existing "Skip without uploading documents?" AlertDialog. If at some point Continue becomes clickable at 0 docs, extend the gate to Empty by changing `quality.tier === "good"` to `quality.tier === "empty" || quality.tier === "good"` in `AssessmentUpload.tsx`.)

Not a code change for this iteration — just a note to revisit after the first week of usage.
