# Unified Assessment Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 5 separate assessment pages (intake → documents → decision tree → structure → report) into one continuous experience inside a persistent layout shell with a shared header, progress stepper, consistent navigation, and smooth transitions.

**Architecture:** A new `AssessmentShell` nested layout route sits between `AppLayout` and the five assessment pages. `AppLayout` is changed so assessment routes render bare (no `max-w-4xl` clamp). The shell owns the chrome — sub-header (taxpayer / id / status), a 5-step stepper, and a fixed footer — and defines an explicit height contract so the full-height structure-chart canvas fits. Each page renders its own Back/Next buttons into the shell footer via a **portal** (no fragile config-registration). The document-upload popup becomes a first-class inline step. On structure-chart finalize, the chart is captured as a transparent PNG using ReactFlow's documented bounds-based export recipe and stored on `atad2_structure_charts`, then shown on the report page.

**Tech Stack:** React 18 + Vite + TypeScript, react-router-dom 6, @tanstack/react-query, Tailwind + shadcn/ui, framer-motion, @xyflow/react, html-to-image, self-hosted Supabase, vitest.

**Branch:** `feat/document-prefill` (per user). One commit per task; each task leaves the app in a working, shippable state.

---

## Eng-review decisions baked into this plan (D2–D13)

This plan was revised after `/plan-eng-review` + an outside-voice challenge. The decisions below are already incorporated — they are recorded here so a worker understands *why* the shape is what it is.

- **D2 — Portal footer.** Pages render Back/Next into a shell-provided footer slot via `createPortal`. No config-registration hook, no hand-written dependency arrays, no stale-closure risk.
- **D3 — One `useAssessmentSessionId()` hook.** Resolves the id from the `:sessionId` path param OR the `?session=` query param. Used by the shell and all five steps. Kills the 6-copies-two-conventions duplication.
- **D4 — Bounds-based snapshot.** Chart snapshot uses ReactFlow's documented "download image" recipe: `getNodesBounds` → `getViewportForBounds` → capture `.react-flow__viewport` at computed size. Captures the whole chart regardless of the user's pan/zoom, without disturbing their view.
- **D5 — Shell is the session-meta source of truth.** `AssessmentUpload` drops its own session query and reads `useAssessmentSessionMeta()`.
- **D6 — `wide` / `fullBleed` flags on step definitions.** No hard-coded step-index checks in the shell.
- **D7 — Unit tests for all new pure logic** (wide flag, sessionId derivation, snapshot bounds math) + a named **critical regression E2E** for the decision-tree nav migration.
- **D8 — `loadChart` selects explicit columns** (excludes the base64 `snapshot_png` blob); a dedicated `loadChartSnapshot()` reads only the snapshot for the report page.
- **D10 — Explicit layout contract.** `AppLayout` passes assessment routes through bare; the shell sets a known height (`h-[calc(100vh-4rem)]`, flex column) so the structure-chart canvas has a real height budget.
- **D11 — No `mode="wait"`.** `AnimatePresence` uses the default concurrent crossfade — steps that `navigate()` on mount (Confirmation, Report) don't stall.
- **D13 — ReportDetail English-only fix** folded in as a small standalone task (Task 16).

Outside-voice corrections also applied: Phase 1 tasks are reorganized **per-page** (strip chassis + migrate footer in the same commit) so the tree is never broken between commits; `MIN_DATA_URL_LENGTH` raised to a meaningful threshold; the answers-ordering caveat is noted in the context-panel task.

## Design-review decisions (plan-design-review)

The plan then went through `/plan-design-review` (text-only, focused on the three gaps it scored 6/10 on). Decisions baked in below:

- **DD1 — Skeleton for the taxpayer name.** The shell sub-header shows a `Skeleton` placeholder (not the literal text `'New assessment'`) while the session row is loading and a `sessionId` exists. Prevents the wrong-text flash on every step load.
- **DD2 — Desktop-primary, explicit min-width.** The assessment flow is desktop-primary (tax advisors work on laptops; the ReactFlow structure canvas is a desktop interaction). The shell gets a sane `min-width`; below a breakpoint the structure step shows a "best viewed on a wider screen" note instead of cramming a canvas + 288px panel into a phone. No mobile layout work.
- **DD3 — Focus management on step change.** The shell moves keyboard focus to the new step's content region on every route change (a `useEffect` keyed on `location.pathname` focusing the body `motion.div`, which has `tabIndex={-1}`). Keyboard / screen-reader users don't get dumped to `<body>` each step.
- **DD4 — Non-silent snapshot failure.** When a chart is finalized but `snapshot_png` is null (capture failed), the report shows a quiet muted "Structure chart snapshot unavailable" note instead of nothing — so a missing chart reads as a known degraded state, not lost work.
- **DD5 — TODO captured:** create `DESIGN.md` via `/design-consultation` — added to `TODOS.md`.

Design score: 6/10 → 9/10 after these decisions.

---

## Inventory summary (why this plan exists)

The flow is 5 routes, each re-declaring its own page chassis and fighting `AppLayout`:

- **4 different container widths**: intake `max-w-2xl`, upload `max-w-3xl`, decision tree `max-w-7xl`, report `max-w-4xl`.
- **No flow-level progress indicator** anywhere. `AssessmentSidebar` is a per-question history list, not a step indicator — it stays as-is.
- **Back/Next placement inconsistent**: decision tree (bottom of card), structure (top header), report (top only), intake (full-width bottom), upload (footer pair). Icon: literal `←` vs lucide `ArrowLeft`.
- **Color drift**: hardcoded `green-500/red-500/blue-600` answer buttons, hardcoded `bg-green-600` primary on report, `neutral-*` everywhere in the structure chrome.
- **Motion drift**: framer-motion (`MotionPage`) on Index/Report, Tailwind `animate-in` on confirmation, nothing on intake/upload/structure.
- **Structure step** is the worst offender: own `bg-neutral-50` page, own bordered card+header, no stepper, **no context panel**, xyflow's own chrome → reads as an embedded third-party editor.
- **Upload popup**: `Assessment.tsx`'s `showBackgroundInfoDialog` `<Dialog>` is an empty modal that interrupts the flow purely to route to `/assessment/upload` or skip it.

The design system already exists in `src/index.css` + `tailwind.config.ts` (full HSL token set, `--border-subtle`, motion tokens, `MotionPage`/`FadeIn`). The fix is to apply it flow-wide.

**Confirmation page note:** the user's 5-step model is Intake → Documents → Decision tree → Structure → Report. `/assessment-confirmation/:sessionId` is treated as the entry sub-state of the **Report** step (stepper highlights "Report" on both confirmation and report routes).

---

## Layout contract (D10) — the height/width budget

```
┌─ AppLayout (sticky header, h-16 / 4rem) ──────────────────────────┐
│  logo · "ATAD2 risk assessment" · ThemeToggle · Admin · Sign out  │
├───────────────────────────────────────────────────────────────────┤
│  AssessmentShell  →  div.flex.flex-col.h-[calc(100vh-4rem)]        │
│  ┌─ sub-header (shrink-0) ─────────────────────────────────────┐  │
│  │  taxpayer · session id · status   [Add documents]           │  │
│  │  ▸ AssessmentStepper: Intake─Documents─Questions─Structure─Report │
│  ├─ body (flex-1, min-h-0) ───────────────────────────────────┤  │
│  │  AnimatePresence (NO mode="wait" — D11)                     │  │
│  │   step.fullBleed ? <Outlet/> fills the flex-1 area          │  │
│  │   else           : div.mx-auto.(max-w-7xl|max-w-4xl).py-6   │  │
│  │                    .overflow-y-auto  <Outlet/>              │  │
│  ├─ footer (shrink-0, min-h-[60px]) ──────────────────────────┤  │
│  │  <div id=footer-portal-target>  ← pages portal buttons here │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘

Step flags (steps.ts):
  intake     wide=false fullBleed=false
  documents  wide=false fullBleed=false
  questions  wide=true  fullBleed=false   (4-col grid needs room, still scrolls)
  structure  wide=true  fullBleed=true    (ReactFlow canvas fills the body, no scroll wrapper)
  report     wide=false fullBleed=false
```

`AppLayout` change: assessment routes (`/assessment*`, `/assessment-*`) render a bare `<Outlet/>` exactly like admin routes already do — no `<main className="p-4"><div className="max-w-4xl mx-auto">` wrapper. The shell then fully owns width and height.

**Responsive posture (DD2):** desktop-primary. The shell root carries `min-w-[1024px]` (or the app's existing desktop minimum) so nothing collapses absurdly; the page can scroll horizontally below that. The structure step additionally renders a centered "This step is best viewed on a wider screen" note (and suppresses the chart canvas) below `lg`. No per-viewport mobile layouts are designed — tax advisors use this on laptops, and a pan/zoom ReactFlow canvas is not a phone interaction.

**Focus management (DD3):** the shell's body `motion.div` has `tabIndex={-1}` and a ref; a `useEffect` keyed on `location.pathname` calls `.focus()` on it after each route change, so keyboard/screen-reader users land in the new step instead of `<body>`.

---

## File Structure

**New files:**
- `src/lib/assessment/steps.ts` — pure: ordered step list with `wide`/`fullBleed` flags + `stepIndexForPath`. Unit-tested.
- `src/lib/assessment/__tests__/steps.test.ts`
- `src/lib/assessment/useAssessmentSessionId.ts` — resolves sessionId from path param or `?session=` query. Pure resolver + thin hook. Unit-tested.
- `src/lib/assessment/__tests__/useAssessmentSessionId.test.ts`
- `src/components/assessment/AssessmentShellContext.tsx` — context exposing `{ footerEl, meta }` + `useAssessmentSessionMeta` hook.
- `src/components/assessment/AssessmentShell.tsx` — nested layout route: sub-header + stepper + `AnimatePresence` body + footer portal target.
- `src/components/assessment/AssessmentStepper.tsx` — the 5-step progress indicator.
- `src/components/assessment/AssessmentFooterSlot.tsx` — portals its children into the shell footer; renders the consistent `justify-between` layout.
- `src/components/assessment/DocumentUploadStep.tsx` — inline document-upload step body.
- `src/components/structure/StructureContextPanel.tsx` — taxpayer / decision-tree answers / assumptions panel beside the chart.
- `src/lib/structure/captureChartSnapshot.ts` — pure bounds math + the `html-to-image` capture wrapper.
- `src/lib/structure/__tests__/captureChartSnapshot.test.ts`
- `supabase/migrations/20260514120000_structure_chart_snapshot.sql`

**Modified files:**
- `src/pages/AppLayout.tsx` — assessment routes render bare (D10).
- `src/App.tsx` — wrap the 5 assessment routes in `<AssessmentShell/>`.
- `src/pages/Assessment.tsx` — drop chassis; footer slot; replace `showBackgroundInfoDialog` modal with a direct route to the upload step; use `useAssessmentSessionId`.
- `src/pages/AssessmentUpload.tsx` — drop chassis; footer slot; render `DocumentUploadStep`; consume `useAssessmentSessionMeta` (D5).
- `src/pages/AssessmentConfirmation.tsx` — drop chassis; footer slot; token colors.
- `src/pages/AssessmentReport.tsx` — drop chassis (`MotionPage` + `min-h-screen`); footer slot; token primary button; structure-snapshot card.
- `src/pages/ReportDetail.tsx` — translate Dutch UI strings to English (D13).
- `src/components/structure/StructureChartStep.tsx` — drop `min-h-screen bg-neutral-50`; `h-full` layout; tokenize chrome; mount `StructureContextPanel`; capture + save snapshot in `goNext`; footer slot.
- `src/components/structure/StructureChart.tsx` — expose the ReactFlow instance / viewport node for snapshot capture.
- `src/components/structure/{FloatingPalette,FloatingToolbar,FloatingInspector,BlockingBanner}.tsx` — tokenize chrome; `data-snapshot-exclude` attrs.
- `src/lib/structure/client.ts` — `loadChart` explicit column list; add `saveChartSnapshot` + `loadChartSnapshot` (D8).
- `src/lib/structure/types.ts` — add snapshot fields to `StructureChart`.

---

# PHASE 1 — Persistent layout shell

Outcome: all 5 steps render inside one shell with a shared sub-header, a 5-step stepper, one consistent footer, and animated transitions. Phase 1 tasks are ordered **per-page** — each page is stripped of its chassis AND migrated to the footer slot in the same task/commit, so the app is never half-migrated.

### Task 1: Step-derivation utility with wide/fullBleed flags (pure, TDD)

**Files:**
- Create: `src/lib/assessment/steps.ts`
- Test: `src/lib/assessment/__tests__/steps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/assessment/__tests__/steps.test.ts
import { describe, it, expect } from 'vitest';
import { ASSESSMENT_STEPS, stepIndexForPath } from '../steps';

describe('assessment steps', () => {
  it('exposes the five ordered steps', () => {
    expect(ASSESSMENT_STEPS.map((s) => s.key)).toEqual([
      'intake', 'documents', 'questions', 'structure', 'report',
    ]);
  });

  it('marks questions and structure as wide; structure as fullBleed', () => {
    const byKey = Object.fromEntries(ASSESSMENT_STEPS.map((s) => [s.key, s]));
    expect(byKey.questions.wide).toBe(true);
    expect(byKey.structure.wide).toBe(true);
    expect(byKey.structure.fullBleed).toBe(true);
    expect(byKey.intake.wide).toBe(false);
    expect(byKey.intake.fullBleed).toBe(false);
    expect(byKey.documents.fullBleed).toBe(false);
    expect(byKey.report.fullBleed).toBe(false);
  });

  it('maps the intake route to step 0', () => {
    expect(stepIndexForPath('/assessment')).toBe(0);
  });

  it('maps the upload route to step 1', () => {
    expect(stepIndexForPath('/assessment/upload')).toBe(1);
  });

  it('treats /assessment with an active session as the questions step', () => {
    expect(stepIndexForPath('/assessment', { hasSession: true })).toBe(2);
  });

  it('maps the structure route to step 3', () => {
    expect(stepIndexForPath('/assessment/structure/abc-123')).toBe(3);
  });

  it('maps confirmation and report routes to step 4', () => {
    expect(stepIndexForPath('/assessment-confirmation/abc-123')).toBe(4);
    expect(stepIndexForPath('/assessment-report/abc-123')).toBe(4);
  });

  it('returns -1 for non-assessment routes', () => {
    expect(stepIndexForPath('/admin')).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/assessment/__tests__/steps.test.ts`
Expected: FAIL — `Cannot find module '../steps'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/assessment/steps.ts

export interface AssessmentStep {
  key: 'intake' | 'documents' | 'questions' | 'structure' | 'report';
  label: string;
  /** Wide steps use max-w-7xl instead of max-w-4xl in the shell body. */
  wide: boolean;
  /** Full-bleed steps render directly into the flex-1 body with no
   *  centered/scroll wrapper — the structure-chart canvas needs the whole area. */
  fullBleed: boolean;
}

export const ASSESSMENT_STEPS: readonly AssessmentStep[] = [
  { key: 'intake',    label: 'Intake',    wide: false, fullBleed: false },
  { key: 'documents', label: 'Documents', wide: false, fullBleed: false },
  { key: 'questions', label: 'Questions', wide: true,  fullBleed: false },
  { key: 'structure', label: 'Structure', wide: true,  fullBleed: true  },
  { key: 'report',    label: 'Report',    wide: false, fullBleed: false },
] as const;

/**
 * Maps a router pathname to a 0-based assessment step index, or -1 if the
 * path is not part of the assessment flow.
 *
 * `/assessment` is ambiguous: it is the intake form before a session exists
 * and the decision tree once a session is active. The caller passes
 * `hasSession` (derived from the `?session=` query param) to disambiguate.
 */
export function stepIndexForPath(
  pathname: string,
  opts: { hasSession?: boolean } = {},
): number {
  if (pathname === '/assessment') {
    return opts.hasSession ? 2 : 0;
  }
  if (pathname.startsWith('/assessment/upload')) return 1;
  if (pathname.startsWith('/assessment/structure/')) return 3;
  if (pathname.startsWith('/assessment-confirmation/')) return 4;
  if (pathname.startsWith('/assessment-report/')) return 4;
  return -1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/assessment/__tests__/steps.test.ts`
Expected: PASS — 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/steps.ts src/lib/assessment/__tests__/steps.test.ts
git commit -m "feat(assessment): add step-derivation utility with wide/fullBleed flags"
```

---

### Task 2: sessionId resolver hook (pure resolver, TDD)

**Files:**
- Create: `src/lib/assessment/useAssessmentSessionId.ts`
- Test: `src/lib/assessment/__tests__/useAssessmentSessionId.test.ts`

The flow currently derives sessionId in ~6 places across two conventions (`:sessionId` path param vs `?session=` query). This is the single resolver.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/assessment/__tests__/useAssessmentSessionId.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSessionId } from '../useAssessmentSessionId';

describe('resolveSessionId', () => {
  it('prefers the path param when present', () => {
    expect(resolveSessionId('path-id', new URLSearchParams('session=query-id')))
      .toBe('path-id');
  });
  it('falls back to the ?session= query param', () => {
    expect(resolveSessionId(undefined, new URLSearchParams('session=query-id')))
      .toBe('query-id');
  });
  it('returns null when neither is present', () => {
    expect(resolveSessionId(undefined, new URLSearchParams(''))).toBeNull();
  });
  it('treats an empty path param as absent', () => {
    expect(resolveSessionId('', new URLSearchParams('session=query-id')))
      .toBe('query-id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/assessment/__tests__/useAssessmentSessionId.test.ts`
Expected: FAIL — `Cannot find module '../useAssessmentSessionId'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/assessment/useAssessmentSessionId.ts
import { useParams, useSearchParams } from 'react-router-dom';

/** Pure resolver — path param wins, then the `?session=` query param. */
export function resolveSessionId(
  pathParam: string | undefined,
  search: URLSearchParams,
): string | null {
  if (pathParam) return pathParam;
  const q = search.get('session');
  return q && q.length > 0 ? q : null;
}

/**
 * The one place the assessment flow resolves its session id. Handles both
 * routing conventions: `/assessment/structure/:sessionId` (path param) and
 * `/assessment?session=...` / `/assessment/upload?session=...` (query param).
 */
export function useAssessmentSessionId(): string | null {
  const params = useParams();
  const [search] = useSearchParams();
  return resolveSessionId(params.sessionId, search);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/assessment/__tests__/useAssessmentSessionId.test.ts`
Expected: PASS — 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/useAssessmentSessionId.ts src/lib/assessment/__tests__/useAssessmentSessionId.test.ts
git commit -m "feat(assessment): add single sessionId resolver hook"
```

---

### Task 3: Shell context + footer-slot component (D2 — portal)

**Files:**
- Create: `src/components/assessment/AssessmentShellContext.tsx`
- Create: `src/components/assessment/AssessmentFooterSlot.tsx`

- [ ] **Step 1: Write the context**

```tsx
// src/components/assessment/AssessmentShellContext.tsx
import { createContext, useContext } from 'react';

export interface AssessmentSessionMeta {
  sessionId: string | null;
  taxpayerName: string | null;
  status: string | null;
  /** Opens the document-upload step from anywhere later in the flow. */
  openDocuments: () => void;
}

export interface AssessmentShellContextValue {
  /** The shell's footer DOM node — pages portal their Back/Next into it. */
  footerEl: HTMLElement | null;
  meta: AssessmentSessionMeta;
}

export const AssessmentShellContext =
  createContext<AssessmentShellContextValue | null>(null);

export function useAssessmentShell(): AssessmentShellContextValue {
  const ctx = useContext(AssessmentShellContext);
  if (!ctx) {
    return {
      footerEl: null,
      meta: {
        sessionId: null,
        taxpayerName: null,
        status: null,
        openDocuments: () => {},
      },
    };
  }
  return ctx;
}

export function useAssessmentSessionMeta(): AssessmentSessionMeta {
  return useAssessmentShell().meta;
}
```

- [ ] **Step 2: Write the footer-slot component**

```tsx
// src/components/assessment/AssessmentFooterSlot.tsx
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useAssessmentShell } from './AssessmentShellContext';

/**
 * Renders `left` / `right` nodes into the shell's footer via a portal.
 * Pages just render <AssessmentFooterSlot left={...} right={...} /> — React
 * handles updates normally; no config registration, no memoisation, no
 * stale-closure risk. Renders nothing until the shell footer node exists
 * (one frame on first paint; the footer has min-height so it doesn't jump).
 */
export function AssessmentFooterSlot({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  const { footerEl } = useAssessmentShell();
  if (!footerEl) return null;
  return createPortal(
    <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
      <div>{left}</div>
      <div>{right}</div>
    </div>,
    footerEl,
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/assessment/AssessmentShellContext.tsx src/components/assessment/AssessmentFooterSlot.tsx
git commit -m "feat(assessment): add shell context + portal-based footer slot"
```

---

### Task 4: Progress stepper component

**Files:**
- Create: `src/components/assessment/AssessmentStepper.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/assessment/AssessmentStepper.tsx
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS } from '@/lib/assessment/steps';

export function AssessmentStepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Assessment progress">
      {ASSESSMENT_STEPS.map((step, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast',
                isActive && 'bg-primary text-primary-foreground',
                isDone && 'text-foreground',
                !isActive && !isDone && 'text-muted-foreground',
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-mono',
                  isActive && 'border-primary-foreground/40',
                  isDone && 'border-foreground bg-foreground text-background',
                  !isActive && !isDone && 'border-[hsl(var(--border-default))]',
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < ASSESSMENT_STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'h-px w-4 sm:w-6',
                  i < current ? 'bg-foreground' : 'bg-[hsl(var(--border-default))]',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add src/components/assessment/AssessmentStepper.tsx
git commit -m "feat(assessment): add 5-step progress stepper"
```

---

### Task 5: The shell layout component (D10 height contract, D11 transitions)

**Files:**
- Create: `src/components/assessment/AssessmentShell.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/assessment/AssessmentShell.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS, stepIndexForPath } from '@/lib/assessment/steps';
import { useAssessmentSessionId } from '@/lib/assessment/useAssessmentSessionId';
import { AssessmentStepper } from './AssessmentStepper';
import { AssessmentShellContext } from './AssessmentShellContext';

export default function AssessmentShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = useAssessmentSessionId();
  const hasSession = !!searchParams.get('session');
  const currentStep = stepIndexForPath(location.pathname, { hasSession });
  const stepDef = currentStep >= 0 ? ASSESSMENT_STEPS[currentStep] : null;

  // Footer portal target — state-backed so context consumers re-render once
  // the node mounts (one-frame gap on first paint; footer has min-height).
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);

  // DD3 — move keyboard focus to the new step's content region on route change.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.focus();
  }, [location.pathname]);

  const { data: session } = useQuery({
    queryKey: ['assessment-shell-session', sessionId],
    enabled: !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('atad2_sessions')
        .select('session_id, taxpayer_name, status')
        .eq('session_id', sessionId!)
        .maybeSingle();
      return data;
    },
  });

  const openDocuments = useCallback(() => {
    if (sessionId) navigate(`/assessment/upload?session=${sessionId}`);
  }, [navigate, sessionId]);

  const ctxValue = useMemo(
    () => ({
      footerEl,
      meta: {
        sessionId,
        taxpayerName: session?.taxpayer_name ?? null,
        status: (session?.status as string | null) ?? null,
        openDocuments,
      },
    }),
    [footerEl, sessionId, session?.taxpayer_name, session?.status, openDocuments],
  );

  return (
    <AssessmentShellContext.Provider value={ctxValue}>
      {/* DD2 — desktop-primary: min-width so nothing collapses absurdly. */}
      <div className="flex h-[calc(100vh-4rem)] min-w-[1024px] flex-col">
        {/* Sub-header */}
        <div className="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-background">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  ATAD2 assessment
                </p>
                {/* DD1 — skeleton, not 'New assessment', while the session loads */}
                {sessionId && !session ? (
                  <Skeleton className="mt-0.5 h-6 w-48" />
                ) : (
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {session?.taxpayer_name ?? 'New assessment'}
                  </h2>
                )}
                {sessionId && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {sessionId}
                    {session?.status && (
                      <><span className="mx-1.5">·</span>{session.status}</>
                    )}
                  </p>
                )}
              </div>
              {sessionId && currentStep > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDocuments}
                  className="shrink-0 transition-all duration-fast"
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  Add documents
                </Button>
              )}
            </div>
            <div className="mt-3">
              <AssessmentStepper current={currentStep} />
            </div>
          </div>
        </div>

        {/* Body — D10 height budget, D11 concurrent crossfade (no mode="wait").
            DD3 — ref + tabIndex=-1: focus target on route change. */}
        <div
          ref={bodyRef}
          tabIndex={-1}
          className={cn(
            'min-h-0 flex-1 outline-none',
            stepDef?.fullBleed ? 'flex' : 'overflow-y-auto',
          )}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className={cn(
                stepDef?.fullBleed
                  ? 'flex-1'
                  : cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-4xl'),
              )}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer portal target — always rendered so the portal has a home */}
        <div
          ref={setFooterEl}
          className="min-h-[60px] shrink-0 border-t border-[hsl(var(--border-subtle))] bg-background/80 backdrop-blur-md"
        />
      </div>
    </AssessmentShellContext.Provider>
  );
}
```

Note: with `fullBleed`, the `motion.div` is `flex-1` inside a `flex` body — the structure step's own `h-full` layout then has a real height to fill. For non-fullBleed steps the body scrolls.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.

```bash
git add src/components/assessment/AssessmentShell.tsx
git commit -m "feat(assessment): add persistent shell with explicit height contract"
```

---

### Task 6: AppLayout — pass assessment routes through bare (D10)

**Files:**
- Modify: `src/pages/AppLayout.tsx:17, 102-110`

`AppLayout` currently wraps non-admin routes in `<main className="p-4"><div className="max-w-4xl mx-auto">`. That clamps the shell. Assessment routes must render bare, like admin routes already do.

- [ ] **Step 1: Add an assessment-route check**

After line 17 (`const isAdminRoute = ...`), add:
```tsx
const isAssessmentRoute =
  location.pathname.startsWith('/assessment') ||
  location.pathname.startsWith('/assessment-');
const isBareRoute = isAdminRoute || isAssessmentRoute;
```

- [ ] **Step 2: Use it in the content region**

Change the content ternary (lines 102-110) from `isAdminRoute ?` to `isBareRoute ?`:
```tsx
{isBareRoute ? (
  <Outlet />
) : (
  <main className="p-4">
    <div className="max-w-4xl mx-auto">
      <Outlet />
    </div>
  </main>
)}
```

- [ ] **Step 3: Verify nothing else regressed**

Run `npm run dev`. Open `/` (dashboard) — still centered in `max-w-4xl`. Open `/admin` — still bare. Assessment routes don't exist under the shell yet (Task 7) — they still render bare now, which is fine.

- [ ] **Step 4: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/AppLayout.tsx
git commit -m "refactor(layout): render assessment routes bare so the shell owns layout"
```

---

### Task 7: Wire the shell into routing

**Files:**
- Modify: `src/App.tsx:28, 74-79`

- [ ] **Step 1: Add the lazy import**

After line 28, add:
```tsx
const AssessmentShell = lazy(() => import("./components/assessment/AssessmentShell"));
```

- [ ] **Step 2: Wrap the 5 assessment routes**

Replace `src/App.tsx:74-79` with:
```tsx
<Route element={<AssessmentShell />}>
  <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
  <Route path="/assessment/upload" element={<ProtectedRoute><AssessmentUpload /></ProtectedRoute>} />
  <Route path="/assessment/structure/:sessionId" element={<ProtectedRoute><AssessmentStructure /></ProtectedRoute>} />
  <Route path="/assessment-confirmation/:sessionId" element={<ProtectedRoute><AssessmentConfirmation /></ProtectedRoute>} />
  <Route path="/assessment-report/:sessionId" element={<ProtectedRoute><AssessmentReport /></ProtectedRoute>} />
</Route>
```

Leave `/`, `/report/:reportId`, the admin block, and `*` as direct children of `<AppLayout>`.

- [ ] **Step 3: Verify the app boots**

Run `npm run dev`, open `/assessment`. The intake page renders inside the shell sub-header + stepper. It will look double-padded / mis-sized — that is fixed page-by-page in Tasks 8-12.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(assessment): nest the five assessment routes inside AssessmentShell"
```

---

### Task 8: Migrate the Intake step (chassis + footer in one commit)

**Files:**
- Modify: `src/pages/Assessment.tsx` (intake render path only)

- [ ] **Step 1: Strip the intake chassis**

In the `if (!sessionStarted)` return, change the outer `<div className="min-h-screen bg-background p-4"><div className="max-w-2xl mx-auto">` to a single `<div className="max-w-2xl mx-auto">`. Remove the now-unbalanced closing `</div>`.

- [ ] **Step 2: Remove the redundant "Back to dashboard" button**

Delete the top-left `← Back to dashboard` outline button + its `mb-8` wrapper. The `AppLayout` logo already returns to the dashboard and the stepper shows position.

- [ ] **Step 3: Intake keeps its own CTA — no footer slot**

Intake's primary action is the full-width "Start assessment" button inside the card (with its consent dialogs). It renders **no** `AssessmentFooterSlot` — the shell footer simply stays empty on the intake step. Leave the Start-assessment button and the "Before you start" consent dialog untouched.

- [ ] **Step 4: Use the shared sessionId resolver**

Where the intake code reads the session from the URL, replace the local derivation with `useAssessmentSessionId()` from `@/lib/assessment/useAssessmentSessionId`.

- [ ] **Step 5: Verify + commit**

Run `npm run dev`, open `/assessment`. Intake renders cleanly in the shell, no double padding, footer empty, Start-assessment button works. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/Assessment.tsx
git commit -m "refactor(assessment): migrate intake step into the shell"
```

---

### Task 9: Migrate the Decision-tree step (chassis + footer in one commit)

**Files:**
- Modify: `src/pages/Assessment.tsx` (decision-tree render path only)

**CRITICAL:** this task moves flow-critical navigation. Do NOT change decision-tree logic — questions, conditional paths, answer handling, the `isTransitioning` flag, the previous/next/finish handlers all stay exactly as they are. Only their *placement* moves.

- [ ] **Step 1: Strip the chassis**

Change `<MotionPage className="min-h-screen bg-background p-4">` to `<div>` and its closing tag to `</div>`. Remove the inner `max-w-7xl mx-auto` (the shell now provides `max-w-7xl` for the `wide` questions step). Remove the `MotionPage` import if nothing else in the file uses it. Keep the 4-col grid and the `AssessmentSidebar`.

- [ ] **Step 2: Move Previous/Next/Finish into the footer slot**

Delete the in-card nav row (`<div className="flex items-center gap-3">` holding `← Previous`, `Next →`, `Continue`, `Finish assessment`). In its place, render at the end of the decision-tree JSX:
```tsx
<AssessmentFooterSlot
  left={
    canGoPrevious ? (
      <Button variant="outline" onClick={handlePrevious} className="transition-all duration-fast">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Previous
      </Button>
    ) : null
  }
  right={
    <Button
      onClick={handleNextOrFinish}
      disabled={!currentAnswerSelected || isTransitioning}
      className="transition-all duration-fast"
    >
      {isTransitioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {isLastQuestion ? 'Finish assessment' : 'Next'}
      {!isTransitioning && <ArrowRight className="ml-2 h-4 w-4" />}
    </Button>
  }
/>
```
Map `canGoPrevious`, `handlePrevious`, `handleNextOrFinish`, `currentAnswerSelected`, `isTransitioning`, `isLastQuestion` to the file's existing variables/handlers (the file already has all of these — reuse, do not rewrite). Import `AssessmentFooterSlot`, and `ArrowLeft`/`ArrowRight`/`Loader2` from `lucide-react`.

- [ ] **Step 3: Verify + commit**

Run `npm run dev`. Start an assessment, reach the questions. The footer shows Previous (left) / Next (right). Answer a question → Next advances. Reach the last question → button reads "Finish assessment" → it navigates to `/assessment/structure/:id`. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/Assessment.tsx
git commit -m "refactor(assessment): migrate decision-tree nav into the shell footer"
```

---

### Task 10: Migrate the Documents step (chassis + footer in one commit, D5)

**Files:**
- Modify: `src/pages/AssessmentUpload.tsx`

- [ ] **Step 1: Strip the chassis**

Change `<div className="max-w-3xl mx-auto p-6 space-y-6">` to `<div className="space-y-6">`. For the `waiting` branch, replace the `min-h-[calc(100vh-4rem)]` gradient hero with `<div className="space-y-6 text-center">` and delete the decorative gradient overlay div. Keep `AnalyzeProgress`.

- [ ] **Step 2: Consume the shell's session meta (D5)**

Delete the local `useQuery(['session-info', ...])` block. Replace `taxpayerName` with `useAssessmentSessionMeta().taxpayerName ?? 'the taxpayer'`. Replace the local `sessionId` derivation with `useAssessmentSessionId()`.

- [ ] **Step 3: Footer slot — Skip + Continue (no Back; CM-4)**

There is no backward navigation from Documents — once a session exists there is no intake to return to. The footer is two forward actions. Replace the `<div className="flex gap-3">` button row with:
```tsx
<AssessmentFooterSlot
  left={
    <Button
      variant="outline"
      onClick={() => navigate(`/assessment?session=${sessionId}`)}
      className="transition-all duration-fast"
    >
      {hasAtLeastOneUploaded ? 'Skip suggestions' : 'Skip'}
    </Button>
  }
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
/>
```
In the `waiting` branch render **no** `AssessmentFooterSlot` (the `AnalyzeProgress` component owns its own Continue button).

- [ ] **Step 4: Verify + commit**

Run `npm run dev`, open `/assessment/upload?session=<id>`. Renders in the shell; footer shows Skip / Continue. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/AssessmentUpload.tsx
git commit -m "refactor(assessment): migrate documents step into the shell"
```

---

### Task 11: Migrate the Confirmation step (chassis + footer in one commit)

**Files:**
- Modify: `src/pages/AssessmentConfirmation.tsx`

- [ ] **Step 1: Strip the chassis**

Change `<div className="min-h-screen bg-background p-4"><div className="max-w-2xl mx-auto">` to a single `<div className="max-w-2xl mx-auto">`; remove the unbalanced closing `</div>`. Change the loading state `min-h-screen flex items-center justify-center` → `flex items-center justify-center py-24`.

- [ ] **Step 2: Token colors**

Replace raw `text-red-600 / text-orange-600 / text-green-600` outcome colors with the shared pattern used in `AssessmentSidebar`: `text-red-700 dark:text-red-400`, `text-amber-700 dark:text-amber-400`, `text-emerald-700 dark:text-emerald-400`. Replace `text-red-500` (required-field markers, if any) with `text-destructive`.

- [ ] **Step 3: Footer slot**

Replace the top-left back button and the inline `outline`/`ghost` action buttons with:
```tsx
<AssessmentFooterSlot
  left={
    <Button variant="outline" onClick={() => navigate(-1)} className="transition-all duration-fast">
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  }
  right={
    <Button onClick={handleConfirmAndContinue} disabled={confirmDisabled} className="transition-all duration-fast">
      Continue to report
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  }
/>
```
Map `handleConfirmAndContinue` / `confirmDisabled` to the file's existing confirm-outcome handler and its disabled condition. Keep the in-card radio/textarea form untouched.

- [ ] **Step 4: Verify + commit**

Run `npm run dev`, reach `/assessment-confirmation/:id`. Renders in the shell; footer Back / Continue. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/AssessmentConfirmation.tsx
git commit -m "refactor(assessment): migrate confirmation step into the shell"
```

---

### Task 12: Migrate the Report step (chassis + footer in one commit)

**Files:**
- Modify: `src/pages/AssessmentReport.tsx`

- [ ] **Step 1: Strip the chassis**

Remove the `<MotionPage>` wrapper (open + close) and its import. Change `<div className="min-h-screen bg-background p-4"><div className="max-w-4xl mx-auto">` to a single `<div>`. Change the loading + not-found states `min-h-screen flex items-center justify-center bg-background` → `flex items-center justify-center py-24`.

- [ ] **Step 2: Token primary button**

Change the "Generate memorandum" / "Memorandum generated" buttons from `bg-green-600 hover:bg-green-700 text-white` to the default `Button` variant (drop the hardcoded green — `variant="default"`).

- [ ] **Step 3: Footer slot — Back to dashboard only**

The report is the terminal step. Add:
```tsx
<AssessmentFooterSlot
  left={
    <Button variant="outline" onClick={() => navigate('/')} className="transition-all duration-fast">
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back to dashboard
    </Button>
  }
/>
```
Remove the old top `← Back to dashboard` button. The "Generate memorandum" button stays in-card (content action, not flow nav).

- [ ] **Step 4: Verify + commit**

Run `npm run dev`, reach `/assessment-report/:id`. Renders in the shell; footer shows Back to dashboard only. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/AssessmentReport.tsx
git commit -m "refactor(assessment): migrate report step into the shell"
```

---

### Task 13: Strip the structure step's chassis (visual restyle deferred to Phase 3)

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`
- Modify: `src/pages/AssessmentStructure.tsx` (pass `useAssessmentSessionId()` if it currently derives the id itself)

This is the minimum to make the structure step sit in the shell without breaking. Full chrome restyle + context panel + snapshot are Phase 3.

- [ ] **Step 1: Drop the page chassis and own header**

Change `<div className="min-h-screen bg-neutral-50 p-6">` to `<div className="h-full">`. The structure step is `fullBleed` — it fills the shell's flex-1 body. Change the inner `<div className="bg-white border ... rounded-xl shadow-sm overflow-hidden">` to `<div className="flex h-full flex-col">`. Delete the step's own `<header>` block (the "Step 5 · Review structure chart" bar with Back/Next) — the shell sub-header replaces it.

- [ ] **Step 2: Fix the main height**

Change `<main className="relative h-[calc(100vh-8rem)]">` to `<main className="relative flex-1 min-h-0">`. It now fills the flex column instead of guessing at viewport math.

- [ ] **Step 2b: Desktop-primary fallback note (DD2)**

Below the `lg` breakpoint, render a centered muted note instead of the chart canvas + chrome:
```tsx
<div className="flex h-full items-center justify-center p-8 text-center lg:hidden">
  <p className="text-sm text-muted-foreground">
    The structure chart is best viewed on a wider screen.
  </p>
</div>
```
Wrap the chart + context-panel layout in `hidden lg:flex` so it only renders at `lg`+. The shell's `min-w-[1024px]` (DD2) already prevents true mobile widths, but this is the honest fallback if the window is narrowed.

- [ ] **Step 3: Footer slot**

Add (in the non-loading, non-failed, non-blocking branch is fine, or always — `goNext`/`navigate(-1)` exist regardless):
```tsx
<AssessmentFooterSlot
  left={
    <Button variant="outline" onClick={() => navigate(-1)} className="transition-all duration-fast">
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  }
  right={
    <Button
      onClick={goNext}
      disabled={status === 'loading' || isExtracting}
      className="transition-all duration-fast"
    >
      Continue to report
      <ArrowRight className="ml-2 h-4 w-4" />
    </Button>
  }
/>
```
Remove the old header-mounted Back/Next.

- [ ] **Step 4: Verify + commit**

Run `npm run dev`, reach the structure step. The ReactFlow canvas fills the body area (not zero-height, not overflowing past the footer). Footer shows Back / Continue to report. Chrome is still ugly `neutral-*` — that is Phase 3. Run `npx tsc --noEmit` → PASS.

```bash
git add src/components/structure/StructureChartStep.tsx src/pages/AssessmentStructure.tsx
git commit -m "refactor(structure): fit the structure step into the shell height contract"
```

---

### Task 14: CRITICAL regression E2E — decision-tree navigation (D7, IRON RULE)

**Files:**
- (verification task — no source changes unless a regression is found)

Task 9 rewrote flow-critical navigation that has zero existing automated coverage. This task is the regression gate and is **mandatory**.

- [ ] **Step 1: Walk the full decision-tree flow with gstack `qa`**

Use the gstack `qa` skill. Start a fresh assessment, answer **every** decision-tree question (including at least one branching path and one "unsure" answer), confirm Previous goes back correctly, confirm the last question's button reads "Finish assessment", confirm Finish lands on `/assessment/structure/:id`. Compare behavior against the pre-refactor flow (the footer Previous/Next/Finish must behave identically to the old in-card buttons).

- [ ] **Step 2: Fix any regression found, then re-walk**

If anything differs from pre-refactor behavior, fix it in `Assessment.tsx`, commit as `fix(assessment): ...`, and re-run Step 1.

- [ ] **Step 3: Commit a note**

If no regression: no commit needed — record "regression walk passed" in the task tracker.

---

### Task 15: Phase 1 verification with gstack

- [ ] **Step 1: Live QA the unified flow**

Use gstack `browse` (or `qa`) to walk `/assessment` end to end. Verify: stepper advances Intake→Documents→Questions→Structure→Report; sub-header shows taxpayer + id + status once a session exists; transitions crossfade (no white flash, no full reload, no stall on the self-redirecting Confirmation/Report steps); footer nav is one consistent bar; "Add documents" appears from step 2 onward; structure canvas fills its area. Capture before/after screenshots.

- [ ] **Step 2: Commit any fixes** as individual `fix(assessment): ...` commits.

---

### Task 16: ReportDetail English-only fix (D13)

**Files:**
- Modify: `src/pages/ReportDetail.tsx`

- [ ] **Step 1: Translate the Dutch UI strings**

Replace all Dutch user-facing strings with English equivalents: "Terug naar dashboard" → "Back to dashboard", "Rapport verwijderd" → "Report deleted", "Verwijderen…" → "Delete…", and any others present. Also change `h1 text-2xl font-bold` → `font-semibold` to match the design-system heading weight.

- [ ] **Step 2: Verify + commit**

Run `npm run dev`, open `/report/:reportId`. All strings English. Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/ReportDetail.tsx
git commit -m "fix(report): translate ReportDetail UI strings to English"
```

---

# PHASE 2 — Inline document-upload step

Outcome: the "Before we start" modal is gone. After intake, the user lands directly on the inline Documents step.

### Task 17: Extract the upload step body into a component

**Files:**
- Create: `src/components/assessment/DocumentUploadStep.tsx`
- Modify: `src/pages/AssessmentUpload.tsx`

- [ ] **Step 1: Create `DocumentUploadStep.tsx`**

```tsx
// src/components/assessment/DocumentUploadStep.tsx
import { Card } from '@/components/ui/card';
import { DocumentUploader } from '@/components/prefill/DocumentUploader';

export function DocumentUploadStep({
  sessionId,
  locked,
}: {
  sessionId: string;
  locked: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Supporting documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Documents are processed only for pre-fill extraction — not used
          for AI training. You can delete them anytime, and they are removed
          automatically after the report is generated.
        </p>
      </div>
      {!locked && (
        <Card className="bg-muted/40 p-4 text-sm text-muted-foreground">
          Supported: PDF, images (PNG/JPG/WEBP), Word (.docx), PowerPoint (.pptx),
          Excel (.xlsx), text/CSV/Markdown. Max 32 MB per file, 200 MB per session.
        </Card>
      )}
      <DocumentUploader sessionId={sessionId} locked={locked} />
    </div>
  );
}
```

- [ ] **Step 2: Use it in `AssessmentUpload.tsx`**

Replace the inline body JSX (from Task 10) with `<DocumentUploadStep sessionId={sessionId} locked={locked} />`. Keep the `waiting` branch and the `AssessmentFooterSlot` from Task 10.

- [ ] **Step 3: Typecheck + verify + commit**

Run `npx tsc --noEmit` → PASS. `npm run dev`, open `/assessment/upload?session=<id>`.

```bash
git add src/components/assessment/DocumentUploadStep.tsx src/pages/AssessmentUpload.tsx
git commit -m "refactor(prefill): extract inline DocumentUploadStep component"
```

---

### Task 18: Remove the upload modal from intake

**Files:**
- Modify: `src/pages/Assessment.tsx` (the `showBackgroundInfoDialog` `<Dialog>` ~lines 1861-1895 and its trigger)

- [ ] **Step 1: Delete the dialog**

Remove the entire `<Dialog open={showBackgroundInfoDialog} ...>...</Dialog>` block, the `showBackgroundInfoDialog` state, and its setter.

- [ ] **Step 2: Route straight to the upload step after session creation**

Where the code currently calls `setShowBackgroundInfoDialog(true)` after creating a session, replace it with `navigate(`/assessment/upload?session=${newSessionId}`)` (use the file's actual new-session-id variable). Leave the "Before you start" consent dialog (3 checkboxes) untouched.

- [ ] **Step 3: Verify the flow**

Run `npm run dev`. Start a new assessment → after the consent checkboxes + "Start assessment", land directly on the inline Documents step. No modal. Footer shows Skip / Continue to questions.

- [ ] **Step 4: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/Assessment.tsx
git commit -m "refactor(assessment): replace upload modal with the inline documents step"
```

---

### Task 19: Phase 2 verification

- [ ] **Step 1: QA the documents step** via gstack `browse`/`qa` — fresh assessment, no modal, drag-drop a file, Skip works, "Add documents" from a later step returns here and back. Screenshot evidence.
- [ ] **Step 2: Commit fixes** as `fix(assessment): ...` if needed.

---

# PHASE 3 — Structure chart integration + snapshot

Outcome: the structure step is styled in the app's visual language, has a context panel beside the chart, and on Continue captures a transparent PNG of the whole chart (D4) that is stored and shown on the report page.

### Task 20: Migration — snapshot columns

**Files:**
- Create: `supabase/migrations/20260514120000_structure_chart_snapshot.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Store an accepted-state snapshot of the structure chart so the report
-- step (and later the Word export) can show it without re-rendering ReactFlow.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS snapshot_png text,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz;

COMMENT ON COLUMN public.atad2_structure_charts.snapshot_png IS
  'Transparent PNG of the chart as a base64 data URL, captured on finalize.';
```

- [ ] **Step 2: Apply it** against the self-hosted Supabase. Confirm:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'atad2_structure_charts'
  AND column_name IN ('snapshot_png', 'snapshot_captured_at');
```
Expected: both rows returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514120000_structure_chart_snapshot.sql
git commit -m "feat(structure): add snapshot columns to atad2_structure_charts"
```

---

### Task 21: Snapshot capture utility (D4 bounds recipe, TDD)

**Files:**
- Create: `src/lib/structure/captureChartSnapshot.ts`
- Test: `src/lib/structure/__tests__/captureChartSnapshot.test.ts`

D4: use ReactFlow's documented "download image" recipe — compute node bounds, derive the viewport transform that fits all nodes, capture the `.react-flow__viewport` element at that computed size. The bounds→dimensions math is pure and unit-tested; the `html-to-image` call is the thin DOM wrapper.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/structure/__tests__/captureChartSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import { computeSnapshotViewport, isUsablePngDataUrl } from '../captureChartSnapshot';

describe('computeSnapshotViewport', () => {
  it('frames a bounds box with padding into a target transform', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 300 };
    const vp = computeSnapshotViewport(bounds, { padding: 0.1, maxWidth: 2000, maxHeight: 2000 });
    // padded box is 480x360; image should cover it, transform should be finite
    expect(vp.width).toBeGreaterThanOrEqual(400);
    expect(vp.height).toBeGreaterThanOrEqual(300);
    expect(Number.isFinite(vp.transform.x)).toBe(true);
    expect(Number.isFinite(vp.transform.y)).toBe(true);
    expect(vp.transform.zoom).toBeGreaterThan(0);
  });

  it('clamps oversized charts to the max dimensions', () => {
    const bounds = { x: 0, y: 0, width: 10000, height: 8000 };
    const vp = computeSnapshotViewport(bounds, { padding: 0, maxWidth: 2000, maxHeight: 2000 });
    expect(vp.width).toBeLessThanOrEqual(2000);
    expect(vp.height).toBeLessThanOrEqual(2000);
  });

  it('handles an empty bounds box without producing NaN', () => {
    const vp = computeSnapshotViewport({ x: 0, y: 0, width: 0, height: 0 }, { padding: 0.1, maxWidth: 2000, maxHeight: 2000 });
    expect(Number.isNaN(vp.width)).toBe(false);
    expect(Number.isNaN(vp.height)).toBe(false);
  });
});

describe('isUsablePngDataUrl', () => {
  it('accepts a substantial png data url', () => {
    expect(isUsablePngDataUrl('data:image/png;base64,' + 'A'.repeat(8000))).toBe(true);
  });
  it('rejects null', () => {
    expect(isUsablePngDataUrl(null)).toBe(false);
  });
  it('rejects a non-png string', () => {
    expect(isUsablePngDataUrl('data:image/jpeg;base64,' + 'A'.repeat(8000))).toBe(false);
  });
  it('rejects a small data url (likely a blank capture)', () => {
    expect(isUsablePngDataUrl('data:image/png;base64,AAAA')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/structure/__tests__/captureChartSnapshot.test.ts`
Expected: FAIL — `Cannot find module '../captureChartSnapshot'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/structure/captureChartSnapshot.ts
import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node, type Rect } from '@xyflow/react';

/**
 * A real 2x chart capture is large. A blank capture of an empty viewport can
 * still be a few KB, so the guard must be well above "tiny" — 5000 chars of
 * base64 (~3.6 KB) is comfortably below any real chart and above a blank one.
 */
const MIN_DATA_URL_LENGTH = 5000;

export function isUsablePngDataUrl(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('data:image/png;base64,')) return false;
  return value.length >= MIN_DATA_URL_LENGTH;
}

export interface SnapshotViewport {
  width: number;
  height: number;
  transform: { x: number; y: number; zoom: number };
}

/**
 * Pure: given the bounding box of all nodes, compute the image dimensions and
 * the viewport transform that frames the whole chart with padding. Clamps to
 * maxWidth/maxHeight so a huge chart doesn't produce a multi-MB PNG.
 */
export function computeSnapshotViewport(
  bounds: Rect,
  opts: { padding: number; maxWidth: number; maxHeight: number },
): SnapshotViewport {
  const padX = bounds.width * opts.padding;
  const padY = bounds.height * opts.padding;
  let width = Math.max(1, bounds.width + padX * 2);
  let height = Math.max(1, bounds.height + padY * 2);

  const scale = Math.min(1, opts.maxWidth / width, opts.maxHeight / height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const { x, y, zoom } = getViewportForBounds(
    bounds,
    width,
    height,
    0.1, // minZoom
    2,   // maxZoom
    opts.padding,
  );
  return { width, height, transform: { x, y, zoom } };
}

/**
 * Captures the whole chart as a transparent PNG data URL using ReactFlow's
 * documented bounds-based recipe. `nodes` comes from the ReactFlow instance;
 * `viewportEl` is the `.react-flow__viewport` DOM node. Returns null on failure
 * or a blank/trivial result — callers MUST handle null and never block the
 * user's flow on a failed snapshot.
 */
export async function captureChartSnapshot(
  viewportEl: HTMLElement | null,
  nodes: Node[],
): Promise<string | null> {
  if (!viewportEl || nodes.length === 0) return null;
  try {
    const bounds = getNodesBounds(nodes);
    const vp = computeSnapshotViewport(bounds, {
      padding: 0.1,
      maxWidth: 2400,
      maxHeight: 2400,
    });
    const dataUrl = await toPng(viewportEl, {
      backgroundColor: undefined, // transparent
      cacheBust: true,
      width: vp.width,
      height: vp.height,
      style: {
        width: `${vp.width}px`,
        height: `${vp.height}px`,
        transform: `translate(${vp.transform.x}px, ${vp.transform.y}px) scale(${vp.transform.zoom})`,
      },
      filter: (el) =>
        (el as HTMLElement).dataset?.snapshotExclude !== 'true',
    });
    return isUsablePngDataUrl(dataUrl) ? dataUrl : null;
  } catch (err) {
    console.warn('[captureChartSnapshot] capture failed', err);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/structure/__tests__/captureChartSnapshot.test.ts`
Expected: PASS — 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/structure/captureChartSnapshot.ts src/lib/structure/__tests__/captureChartSnapshot.test.ts
git commit -m "feat(structure): add bounds-based transparent chart snapshot utility"
```

---

### Task 22: Persist + read the snapshot (D8)

**Files:**
- Modify: `src/lib/structure/types.ts`
- Modify: `src/lib/structure/client.ts`

- [ ] **Step 1: Extend the type**

In `src/lib/structure/types.ts`, add to `StructureChart`:
```ts
  snapshot_png: string | null;
  snapshot_captured_at: string | null;
```

- [ ] **Step 2: `loadChart` selects explicit columns (D8 — exclude the blob)**

In `client.ts:loadChart`, change `.from('atad2_structure_charts').select('*')` to an explicit column list that includes every column the app reads **except** `snapshot_png`. List them out (id, session_id, status, warnings, draft_extracted_at, finalized_at, snapshot_captured_at, created_at, updated_at, and any others on the table — verify against the migration `20260507100000_create_structure_chart_tables.sql`). The polling loop must not drag the base64 blob every poll.

- [ ] **Step 3: Add `saveChartSnapshot` + `loadChartSnapshot`**

Append to `client.ts`:
```ts
export async function saveChartSnapshot(chartId: string, pngDataUrl: string) {
  const { error } = await supabase
    .from('atad2_structure_charts')
    .update({
      snapshot_png: pngDataUrl,
      snapshot_captured_at: new Date().toISOString(),
    })
    .eq('id', chartId);
  if (error) throw error;
}

export interface ChartSnapshotInfo {
  snapshot_png: string | null;
  finalized_at: string | null;
}

/**
 * Reads ONLY the snapshot + finalized_at columns — used by the report page.
 * `finalized_at` set + `snapshot_png` null = capture failed (DD4 degraded state).
 */
export async function loadChartSnapshot(sessionId: string): Promise<ChartSnapshotInfo> {
  const { data } = await supabase
    .from('atad2_structure_charts')
    .select('snapshot_png, finalized_at')
    .eq('session_id', sessionId)
    .maybeSingle();
  return {
    snapshot_png: data?.snapshot_png ?? null,
    finalized_at: data?.finalized_at ?? null,
  };
}
```

- [ ] **Step 4: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/lib/structure/types.ts src/lib/structure/client.ts
git commit -m "feat(structure): persist/read chart snapshot without bloating loadChart"
```

---

### Task 23: Capture the snapshot on finalize

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`
- Modify: `src/components/structure/StructureChartStep.tsx`
- Modify: `src/components/structure/{FloatingPalette,FloatingToolbar,FloatingInspector}.tsx`

- [ ] **Step 1: Expose the ReactFlow instance + viewport from `StructureChart`**

`StructureChart` wraps `<ReactFlow>`. Add a callback prop `onReady?: (api: { getNodes: () => Node[]; viewportEl: HTMLElement | null }) => void`, or accept a `ref`. Inside, use `useReactFlow()` (or the `onInit` callback) to get `getNodes`, and `document.querySelector('.react-flow__viewport')` scoped to the chart container for the viewport element. Surface both to the parent. Keep it minimal — the parent only needs them at capture time.

- [ ] **Step 2: Mark floating chrome as snapshot-excluded**

On the root elements of `FloatingPalette`, `FloatingToolbar`, `FloatingInspector`, add `data-snapshot-exclude="true"`. (They sit outside `.react-flow__viewport` anyway, but the attribute is defensive and consistent with the `filter` in `captureChartSnapshot`.)

- [ ] **Step 3: Capture inside `goNext`**

In `StructureChartStep.tsx`, modify `goNext`:
```tsx
const goNext = async () => {
  if (chart) {
    const snapshot = await captureChartSnapshot(chartViewportElRef.current, getChartNodes());
    if (snapshot) {
      try {
        await saveChartSnapshot(chart.id, snapshot);
      } catch (err) {
        console.warn('[StructureChartStep] snapshot save failed', err);
      }
    }
    await finalizeChart(chart.id);
  }
  navigate(`/assessment-confirmation/${sessionId}`);
};
```
`chartViewportElRef` / `getChartNodes` come from the `onReady` wiring in Step 1. A failed or null snapshot must never block navigation — note the `if (snapshot)` guard and the try/catch. Add imports for `captureChartSnapshot` and `saveChartSnapshot`.

- [ ] **Step 4: Verify**

Run `npm run dev`. Complete a flow to the structure step, pan/zoom the chart somewhere odd, click "Continue to report". In Supabase Studio, check the `atad2_structure_charts` row — `snapshot_png` is a `data:image/png;base64,...` string, `snapshot_captured_at` is set. The PNG should show the **whole** chart (not the panned-in view).

- [ ] **Step 5: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/components/structure/StructureChart.tsx src/components/structure/StructureChartStep.tsx src/components/structure/FloatingPalette.tsx src/components/structure/FloatingToolbar.tsx src/components/structure/FloatingInspector.tsx
git commit -m "feat(structure): capture full-chart transparent snapshot on finalize"
```

---

### Task 24: Tokenize the structure-step chrome

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`, `FloatingToolbar.tsx`, `FloatingInspector.tsx`, `FloatingPalette.tsx`, `BlockingBanner.tsx`

Replace hardcoded `neutral-*` / `bg-white` / raw `amber/emerald/red` in the **chrome** with design-system tokens. **Do NOT touch** `EntityNode.tsx`, `ClusterNode.tsx`, the `PALETTE` module, `FiscalUnityOverlay.tsx`, or the ReactFlow canvas node rendering — the parchment, shape-driven node palette is an intentional project convention (`feedback_tax_chart_conventions`).

- [ ] **Step 1: `StructureChartStep.tsx` chrome** — loader/failed-state `bg-white` → `bg-card`; `text-neutral-500` → `text-muted-foreground`; any remaining `border-neutral-*` → `border-[hsl(var(--border-subtle))]`.
- [ ] **Step 2: `FloatingToolbar.tsx`** — `bg-white border border-neutral-200` → `bg-card border border-[hsl(var(--border-subtle))]`. Status pills `bg-amber-50/text-amber-700` → `bg-amber-500/10 text-amber-700 dark:text-amber-400` (and the red/emerald equivalents). Counts `text-neutral-500` → `text-muted-foreground`.
- [ ] **Step 3: `FloatingInspector.tsx`** — `bg-white border border-neutral-200` → `bg-card border border-[hsl(var(--border-subtle))]`. Replace the literal `✕` close glyph with lucide `<X className="h-4 w-4" />`. `text-neutral-500` → `text-muted-foreground`.
- [ ] **Step 4: `FloatingPalette.tsx` + `BlockingBanner.tsx`** — `FloatingPalette` any `bg-white` wrapper → `bg-card`. `BlockingBanner`: `absolute inset-0 bg-white` → `bg-background`; `bg-red-50 border-red-300 text-red-900` → `bg-destructive/10 border-destructive/30 text-destructive`.
- [ ] **Step 5: Verify in both themes** — `npm run dev`, structure step, toggle light/dark. Chrome follows the theme; chart nodes keep the parchment palette in both (correct).
- [ ] **Step 6: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx src/components/structure/FloatingToolbar.tsx src/components/structure/FloatingInspector.tsx src/components/structure/FloatingPalette.tsx src/components/structure/BlockingBanner.tsx
git commit -m "refactor(structure): tokenize chart chrome to the app design system"
```

---

### Task 25: Structure context panel

**Files:**
- Create: `src/components/structure/StructureContextPanel.tsx`
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/structure/StructureContextPanel.tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructureContextPanelProps {
  sessionId: string;
  warnings: Array<{ stage: number; message: string }>;
  entityCount: number;
  taxpayerName: string | null;
}

export function StructureContextPanel({
  sessionId,
  warnings,
  entityCount,
  taxpayerName,
}: StructureContextPanelProps) {
  // NOTE: ordered by answered_at to match AssessmentReport's existing answers
  // query. answered_at is not perfectly consistent across all insert paths in
  // Assessment.tsx — accepted here because the report page already relies on
  // the same ordering; unifying answer ordering is out of scope for this plan.
  const { data: answers } = useQuery({
    queryKey: ['structure-context-answers', sessionId],
    enabled: !!sessionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('atad2_answers')
        .select('question_id, question_text, answer')
        .eq('session_id', sessionId)
        .order('answered_at');
      return data ?? [];
    },
  });

  return (
    <aside
      data-snapshot-exclude="true"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[hsl(var(--border-subtle))] bg-card p-4"
    >
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Taxpayer</p>
        <p className="mt-0.5 text-sm font-semibold tracking-tight">{taxpayerName ?? '—'}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entityCount} {entityCount === 1 ? 'entity' : 'entities'} in this structure
        </p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Answers behind this structure
        </p>
        <ul className="mt-2 space-y-1.5">
          {(answers ?? []).map((a) => (
            <li key={a.question_id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {a.answer === 'Yes' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : a.answer === 'No' ? (
                  <X className="h-3.5 w-3.5 text-red-600" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-[10px] text-muted-foreground">Q{a.question_id}</span>
                <span className="ml-1.5 text-foreground">{a.question_text}</span>
              </span>
            </li>
          ))}
          {(answers ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No answers recorded.</li>
          )}
        </ul>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Assumptions</p>
        {warnings.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {warnings.map((w, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md bg-amber-500/10 px-2 py-1.5 text-xs',
                  'text-amber-700 dark:text-amber-400',
                )}
              >
                {w.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No extraction assumptions were flagged.
          </p>
        )}
      </div>

      <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">
        This structure feeds your ATAD2 memorandum. A snapshot is saved when you continue
        to the report.
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Mount it beside the chart**

In `StructureChartStep.tsx`, the `<main className="relative flex-1 min-h-0">` becomes a flex row: the chart capture region on the left (`flex-1 relative`), `StructureContextPanel` on the right. Render the panel only in the non-loading / non-failed / non-blocking branch. Pass `sessionId`, `warnings={(chart?.warnings as Array<{stage:number;message:string}>) ?? []}`, `entityCount={visibleEntities.length}`, `taxpayerName={visibleEntities.find((e) => e.is_taxpayer)?.name ?? null}`. The chart's absolutely-positioned children now resolve against the `flex-1 relative` parent, which has a real height from the D10 contract.

- [ ] **Step 3: Verify** — `npm run dev`, structure step. Panel shows taxpayer, the answers list with Yes/No/Unknown icons, extraction warnings as "Assumptions". The chart still fills the rest of the width and pans/zooms.

- [ ] **Step 4: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/components/structure/StructureContextPanel.tsx src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): add context panel linking the chart to the assessment"
```

---

### Task 26: Show the snapshot on the report page

**Files:**
- Modify: `src/pages/AssessmentReport.tsx`

- [ ] **Step 1: Fetch the snapshot via the dedicated reader (D8 + DD4)**

```tsx
const { data: chartSnapshot } = useQuery({
  queryKey: ['report-chart-snapshot', sessionId],
  enabled: !!sessionId,
  staleTime: 60_000,
  queryFn: () => loadChartSnapshot(sessionId!),
});
```
Import `loadChartSnapshot` from `@/lib/structure/client`. `chartSnapshot` is `{ snapshot_png, finalized_at }`.

- [ ] **Step 2: Render a "Structure chart" card — with the DD4 degraded state**

Between the "Session Summary" card and the "Generate memorandum" card in the `space-y-6` stack:
```tsx
{chartSnapshot?.snapshot_png ? (
  <Card>
    <CardHeader>
      <CardTitle>Structure chart</CardTitle>
      <CardDescription>
        Captured when the structure was finalized — included in the memorandum.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/30 p-4">
        <img
          src={chartSnapshot.snapshot_png}
          alt="Structure chart for this assessment"
          className="mx-auto max-h-[480px] w-auto"
        />
      </div>
    </CardContent>
  </Card>
) : chartSnapshot?.finalized_at ? (
  // DD4 — finalized but capture failed: a quiet honest note, not a silent gap.
  <Card>
    <CardHeader>
      <CardTitle>Structure chart</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">
        Structure chart snapshot unavailable for this assessment.
      </p>
    </CardContent>
  </Card>
) : null}
```
(No card at all when the structure step was never reached/finalized — `finalized_at` null.)

- [ ] **Step 3: Verify** — complete a flow through structure → confirmation → report: the card shows the transparent PNG. A flow where structure was finalized but the snapshot column is null → the "snapshot unavailable" note shows. A flow where structure was never finalized → no card.

- [ ] **Step 4: Typecheck + commit**

Run `npx tsc --noEmit` → PASS.

```bash
git add src/pages/AssessmentReport.tsx
git commit -m "feat(report): show the finalized structure-chart snapshot on the report"
```

---

### Task 27: Phase 3 verification with gstack

- [ ] **Step 1: Live QA + design review** — gstack `qa` walks structure → report: chrome matches the app (light + dark), context panel correct, snapshot is the whole chart and transparent, report shows it. Then gstack `design-review` on the structure + report steps for spacing/hierarchy.
- [ ] **Step 2: Full regression pass** — `npm test` (all green) + `npx tsc --noEmit` (clean). Walk Intake → Documents → Questions → Structure → Confirmation → Report once more.
- [ ] **Step 3: Commit fixes** as individual `fix(...)` commits.

---

## NOT in scope

- **Word/docx export of the snapshot** — user said "later"; not captured as a TODO at user request. The snapshot is captured + shown on the report page; the Word wiring is a separate future change.
- **Entity-level deep links between chart and report** — the report is freeform AI markdown with no per-entity structure; bidirectional clickable cross-refs would need datamodel work. The "link" in this plan is the context panel + the carried-forward snapshot.
- **Supabase Storage bucket for the snapshot** (D8) — deferred; base64-in-column is right-sized for now, revisit when the Word export needs it.
- **Decision-tree logic** — questions, conditional paths, answer handling are untouched (explicit non-goal).
- **Unifying `answered_at` write consistency** in `Assessment.tsx` — the context panel inherits the report page's existing ordering behavior; fixing the underlying inconsistency is its own change.
- **`ReportDetail.tsx` `<pre>` vs ReactMarkdown** memo rendering — only the Dutch strings + heading weight are fixed (D13); the rendering divergence is left.
- **`AssessmentSidebar` redesign** — stays as the per-question history list.

## What already exists (reused, not rebuilt)

- **Design system** — `src/index.css` + `tailwind.config.ts`: full HSL token set, `--border-subtle/-default/-strong`, motion tokens (`duration-fast/normal/slow`), `surface-card`. The plan applies these; it does not invent tokens.
- **`html-to-image`** (^1.11.13) — already a dependency. No new install for the snapshot.
- **`@xyflow/react` bounds helpers** — `getNodesBounds` / `getViewportForBounds` are built-ins; D4 uses the documented recipe rather than custom math.
- **`docxtemplater` + `docxtemplater-image-module-free`** — already deps; the deferred Word export has its infra ready.
- **`MotionPage` / `FadeIn` / `StaggerChildren`** — exist; the shell uses framer-motion directly for the page transition, and `MotionPage` is removed from the pages that had it.
- **`DocumentUploader` / `AnalyzeProgress`** — reused as-is inside `DocumentUploadStep`; the popup is replaced, the uploader is not.
- **`AssessmentSidebar`** — kept; the new stepper is a separate flow-level indicator, not a replacement.
- **react-router nested layout routes + `<Outlet/>`** — the built-in mechanism for a persistent shell; no custom routing machinery.

## Failure modes (new codepaths)

| Codepath | Realistic failure | Test? | Error handling? | User sees? |
|---|---|---|---|---|
| `captureChartSnapshot` | `html-to-image` fails (web fonts, SVG markers, cross-origin) → null or blank | bounds math unit-tested; `isUsablePngDataUrl` guards blank | try/catch + null guard; `goNext` proceeds | No snapshot card on report — **silent**. Acceptable (snapshot is enhancement, not gate), but flagged below |
| `saveChartSnapshot` | Supabase update fails | no | try/catch in `goNext`, logged | No snapshot card — silent. Acceptable |
| Footer portal | `footerEl` null on first paint | n/a | `AssessmentFooterSlot` returns null until ready; footer has `min-h-[60px]` so no jump | One-frame empty footer — acceptable |
| `stepIndexForPath` | unknown route → -1 | unit-tested | shell renders stepper with `current={-1}` (nothing active) | Stepper shows all-inactive — acceptable for non-flow routes |
| Decision-tree footer migration | wrong handler mapping → can't advance/finish | **Task 14 critical regression E2E** | n/a | Would be a hard block — Task 14 exists to catch it |
| Shell session query | `atad2_sessions` fetch fails | no | react-query returns undefined; sub-header shows "New assessment" | Degraded sub-header, flow still works — acceptable |

**Critical-gap check:** the snapshot capture failure is silent (no test for the DOM call + no user-facing error + silent). It is **intentionally** silent — the snapshot is an enhancement and must not block the flow — but if the user expects the chart on the report and it's missing, there's no signal why. **Recommendation already in the plan:** the `console.warn` is the only trace. If you want a non-silent path, add a small "Structure chart snapshot unavailable" note on the report when `finalized_at` is set but `snapshot_png` is null — not in scope now, noted here.

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 Tasks 1-2 | `lib/assessment/` | — |
| Phase 1 Tasks 3-7 | `components/assessment/`, `App.tsx`, `pages/AppLayout.tsx` | Tasks 1-2 |
| Phase 1 Tasks 8-13 | `pages/Assessment.tsx`, `pages/Assessment*.tsx`, `components/structure/StructureChartStep.tsx` | Tasks 3-7 |
| Phase 1 Task 16 (ReportDetail) | `pages/ReportDetail.tsx` | — (independent) |
| Phase 2 Tasks 17-18 | `components/assessment/`, `pages/Assessment.tsx`, `pages/AssessmentUpload.tsx` | Phase 1 |
| Phase 3 Tasks 20-26 | `supabase/migrations/`, `lib/structure/`, `components/structure/`, `pages/AssessmentReport.tsx` | Phase 1 |

**Parallel lanes:**
- **Lane A:** Phase 1 Tasks 1→2→3-7→8-13→14-15 (sequential — the shell foundation, everything depends on it).
- **Lane B:** Phase 1 Task 16 (`ReportDetail` English fix) — fully independent, can run anytime in parallel with Lane A.
- After Lane A completes: **Lane C** (Phase 2) and **Lane D** (Phase 3) both depend on Phase 1 but touch mostly different modules — Phase 2 is `components/assessment/` + `Assessment.tsx`; Phase 3 is `lib/structure/` + `components/structure/` + `AssessmentReport.tsx`. **Conflict flag:** both Phase 2 and Phase 3 do *not* overlap meaningfully, but Phase 3 Task 23 and Phase 1 Task 13 both touch `StructureChartStep.tsx` — Phase 3 must come after Phase 1, which it does. Phase 2 and Phase 3 can run in parallel worktrees after Phase 1 merges.

Execution order: **Lane A + Lane B in parallel** → merge → **Lane C + Lane D in parallel** → merge.

---

## Self-Review

**Spec coverage:** Point 1 (shell, header, stepper) → Tasks 3-13. Point 2 (inline upload, no modal, "add documents" button) → Tasks 17-18 + the shell's header button. Point 3 (chart in app's language, context panel, report link via snapshot) → Tasks 20-26. Point 4 (no reloads, transitions, consistent nav) → Task 5 (AnimatePresence) + the per-page footer-slot migrations. Point 5 (visual consistency) → inventory section + Tasks 11/12/24. Non-goals respected: decision-tree logic untouched (Task 9 explicit), datamodel limited to two additive nullable columns (Task 20).

**Placeholder scan:** complete code in every code step; modification steps name exact files/classNames/variables.

**Type consistency:** `AssessmentSessionMeta` / `AssessmentShellContextValue` (Task 3) consumed in Tasks 5, 10. `ASSESSMENT_STEPS` / `stepIndexForPath` (Task 1) consumed in Tasks 4, 5. `resolveSessionId` / `useAssessmentSessionId` (Task 2) consumed in Tasks 5, 8, 10, 13. `computeSnapshotViewport` / `captureChartSnapshot` / `isUsablePngDataUrl` (Task 21) consumed in Task 23. `saveChartSnapshot` / `loadChartSnapshot` (Task 22) consumed in Tasks 23, 26. `snapshot_png` column name consistent across Tasks 20, 22, 23, 26.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEARED | 7 issues raised (D2–D8), all resolved; 1 critical regression task added |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEARED | score 6/10 → 9/10; 5 decisions (DD1–DD5), 0 unresolved |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | n/a | not applicable (internal UI, not a dev product) |

- **OUTSIDE VOICE:** ran (Claude subagent, Codex unavailable) — found 5 real gaps the eng review missed; 2 layout blockers (D10) + transition stall (D11) resolved by user decision, 3 corrections applied (per-page commit reorder, MIN_DATA_URL threshold, answers-ordering caveat).
- **DESIGN REVIEW:** text-only focused review; gaps were responsive posture (DD2 — desktop-primary), focus management (DD3), and degraded states (DD1 skeleton, DD4 non-silent snapshot failure). DESIGN.md creation captured in `TODOS.md` (DD5).
- **UNRESOLVED:** 0.
- **VERDICT:** ENG + DESIGN CLEARED — all 12 eng decisions (D2–D13) + 5 design decisions (DD1–DD5) resolved. Plan ready to implement.
