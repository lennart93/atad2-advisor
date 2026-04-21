# UI Polish (€200k tool feel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the visual polish of ATAD2 Advisor to feel like a premium advisory tool (Linear/Vercel vibe) — same palette, same components, refined detail work and an animated Svalner Atlas logo used as brand anchor + loading indicator.

**Architecture:** Token-first approach. Design tokens in `src/index.css` → Tailwind theme extension → refined shadcn/ui component variants (in place, no forks) → new `AnimatedLogo` + `SessionRow` components → applied at user-facing surfaces. Admin pages inherit token changes only.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS 3, shadcn/ui, lucide-react, date-fns (already installed). New dependency: `@fontsource-variable/inter`.

**Reference spec:** [docs/superpowers/specs/2026-04-21-ui-polish-200k-feel-design.md](../specs/2026-04-21-ui-polish-200k-feel-design.md)

---

## Verification approach

This codebase has no test runner. Verification is:
- `npm run build` — catches TypeScript + Vite errors
- `npm run lint` — catches eslint issues
- `npm run dev` — user does a visual spot-check

No new test infrastructure is added (YAGNI).

**Do NOT deploy.** Do not push to `main`. Azure auto-deploys from `main`. Commits stay local for user review.

---

## Phase 1 — Foundation

Design tokens, Inter font, refined shadcn variants, shared `AnimatedLogo` + `formatDate`. Invisible in isolation; enables later phases.

---

### Task 1: Install Inter variable font

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run:
```bash
npm install @fontsource-variable/inter
```

Expected: exit code 0, `@fontsource-variable/inter` added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify the install**

Run:
```bash
npm ls @fontsource-variable/inter
```

Expected: shows the installed version (e.g. `@fontsource-variable/inter@5.x.x`), no `UNMET DEPENDENCY` lines.

---

### Task 2: Import Inter and add design tokens + keyframes to index.css

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add Inter import at the very top of the file (before `@tailwind base`)**

Add these two lines as the first two lines of `src/index.css`:

```css
@import "@fontsource-variable/inter/wght.css";
@import "@fontsource-variable/inter/wght-italic.css";
```

- [ ] **Step 2: Add new design tokens inside the existing `:root` block**

In `src/index.css`, inside `:root { ... }`, after the existing `--sidebar-ring` line, append:

```css
/* --- UI polish tokens (2026-04-21) --- */
--font-sans: 'Inter Variable', -apple-system, 'Segoe UI', Roboto, sans-serif;
--tracking-tight: -0.015em;
--tracking-snug: -0.005em;

--border-subtle: 222 47% 11% / 0.06;
--border-default: 222 47% 11% / 0.10;
--border-strong: 222 47% 11% / 0.18;

--shadow-xs: 0 1px 0 rgb(15 23 42 / 0.02);
--shadow-sm: 0 1px 0 rgb(15 23 42 / 0.02), 0 1px 2px rgb(15 23 42 / 0.04);
--shadow-md: 0 1px 0 rgb(15 23 42 / 0.02), 0 4px 16px -8px rgb(15 23 42 / 0.10);
--shadow-btn-primary:
  0 1px 0 rgb(255 255 255 / 0.10) inset,
  0 1px 2px rgb(15 23 42 / 0.15),
  0 4px 10px -4px rgb(15 23 42 / 0.20);

--surface-card: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(0 0% 99%) 100%);
--surface-header: linear-gradient(180deg, hsl(0 0% 98% / 0) 0%, hsl(0 0% 98% / 0.4) 100%);
```

- [ ] **Step 3: Apply Inter to body**

In `src/index.css`, replace the existing body block:

```css
body {
  @apply bg-background text-foreground;
}
```

with:

```css
body {
  @apply bg-background text-foreground;
  font-family: var(--font-sans);
  letter-spacing: var(--tracking-snug);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 4: Append logo animation CSS at the bottom of the file**

Append this block to the end of `src/index.css`:

```css
/* --- Animated Svalner logo --- */
.animated-logo {
  display: inline-block;
  line-height: 0;
}
.animated-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: 50% 50%;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}
.animated-logo.is-idle img {
  animation: logo-breathe 4s ease-in-out infinite;
}
.animated-logo.is-working img {
  animation: logo-work-spin 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
.animated-logo.is-interactive {
  cursor: default;
}
.animated-logo.is-interactive:hover img {
  animation-play-state: paused;
  transform: rotate(60deg) scale(1.02);
}
@keyframes logo-breathe {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.04); opacity: 0.88; }
}
@keyframes logo-work-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes logo-work-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .animated-logo img { transition: opacity 0.3s ease; }
  .animated-logo.is-idle img { animation: none; }
  .animated-logo.is-working img { animation: logo-work-pulse 1.5s ease-in-out infinite; }
  .animated-logo.is-interactive:hover img { transform: none; opacity: 0.8; }
}

/* --- Tabular numerals utility --- */
.tabular { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Verify build passes**

Run:
```bash
npm run build
```

Expected: exit code 0, `dist/` is generated, no errors mentioning unknown `@import` or missing fonts.

---

### Task 3: Extend Tailwind config with new tokens

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Extend `theme.extend` with fontFamily, letterSpacing, boxShadow, backgroundImage**

In `tailwind.config.ts`, locate the `extend: { ... }` block. Inside it, alongside existing `colors`, `borderRadius`, `keyframes`, `animation` properties, add these four new properties (preserving existing ones):

```ts
fontFamily: {
  sans: ['Inter Variable', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
},
letterSpacing: {
  tight: 'var(--tracking-tight)',
  snug: 'var(--tracking-snug)',
},
boxShadow: {
  'xs': 'var(--shadow-xs)',
  'sm': 'var(--shadow-sm)',
  'md': 'var(--shadow-md)',
  'btn-primary': 'var(--shadow-btn-primary)',
},
backgroundImage: {
  'surface-card': 'var(--surface-card)',
  'surface-header': 'var(--surface-header)',
},
```

- [ ] **Step 2: Verify build**

Run:
```bash
npm run build
```

Expected: exit code 0.

---

### Task 4: Refine `button.tsx` primary + outline variants

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Update the `default` and `outline` variants in `buttonVariants`**

In `src/components/ui/button.tsx`, replace the entire `buttonVariants` cva call (lines 7–34) with:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-snug ring-offset-background transition-[background,border-color,transform,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 motion-safe:active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-slate-800 to-slate-900 text-primary-foreground border border-slate-950 shadow-btn-primary hover:from-slate-700 hover:to-slate-800 motion-safe:hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-[hsl(var(--border-default))] bg-background hover:border-[hsl(var(--border-strong))] hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

Note: `motion-safe:` prefix ensures the translate-up on hover is skipped under `prefers-reduced-motion: reduce`. `tracking-snug` comes from the Tailwind config we just extended.

- [ ] **Step 2: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 5: Refine `card.tsx` surface

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Update the `Card` root element**

In `src/components/ui/card.tsx`, replace lines 5–18 (the `Card` component) with:

```tsx
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-[hsl(var(--border-subtle))] bg-surface-card bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"
```

Note: we keep `bg-card` as fallback (for dark mode compatibility where the gradient would look wrong against dark). The `bg-surface-card` appears first and overrides in light mode.

- [ ] **Step 2: Update `CardTitle` tracking**

In the same file, replace lines 32–45 (the `CardTitle` component) with:

```tsx
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"
```

(The `tracking-tight` class now resolves to `var(--tracking-tight)` via our Tailwind extension — this line is already there but the token now means -0.015em instead of Tailwind default.)

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: exit code 0.

---

### Task 6: Add `live` badge variant

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Add `live` variant and dot sub-element**

Replace the entire contents of `src/components/ui/badge.tsx` with:

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        live:
          "border-emerald-500/15 bg-emerald-50 text-emerald-700 font-medium [&>span.badge-dot]:bg-emerald-500 [&>span.badge-dot]:shadow-[0_0_0_2px_rgb(16_185_129_/_0.2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {variant === "live" && <span className="badge-dot size-1.5 rounded-full" aria-hidden="true" />}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 2: Verify build**

Run:
```bash
npm run build
```

Expected: exit code 0.

---

### Task 7: Create `formatDate` utility

**Files:**
- Create: `src/utils/formatDate.ts`

- [ ] **Step 1: Write the utility**

Create `src/utils/formatDate.ts` with:

```ts
import { format } from "date-fns";

/**
 * Canonical date format across the app: "12 Mar 2026".
 * Accepts ISO strings, Date objects, or null/undefined (returns "—").
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy");
}
```

- [ ] **Step 2: Smoke-test via node one-liner**

Run:
```bash
node -e "import('./src/utils/formatDate.ts').catch(()=>{}); const {format}=require('date-fns'); console.log(format(new Date('2026-03-12'),'d MMM yyyy'))"
```

Expected output: `12 Mar 2026`

(Quick smoke test of the `date-fns` pattern. The actual import is exercised by the build in later steps.)

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```

Expected: exit code 0.

---

### Task 8: Create `AnimatedLogo` component

**Files:**
- Create: `src/components/AnimatedLogo.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/AnimatedLogo.tsx` with:

```tsx
import { cn } from "@/lib/utils";

export type AnimatedLogoState = "idle" | "working";

export interface AnimatedLogoProps {
  size?: number;
  state?: AnimatedLogoState;
  interactive?: boolean;
  alt?: string;
  className?: string;
}

/**
 * Svalner Atlas asterisk. Brand-anchor + loading indicator.
 * - state="idle": subtle breathe. Hover = snap-rotate 60° (if interactive).
 * - state="working": continuous rotation (replaces Loader2 in prominent flows).
 * CSS lives in src/index.css under `.animated-logo`.
 * Asset path: public/lovable-uploads/new-logo.png (do not change).
 */
export function AnimatedLogo({
  size = 32,
  state = "idle",
  interactive = true,
  alt = "Svalner Atlas",
  className,
}: AnimatedLogoProps) {
  const role = state === "working" ? "status" : "img";
  const ariaLabel = state === "working" ? "Loading" : alt;
  return (
    <span
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "animated-logo",
        state === "idle" ? "is-idle" : "is-working",
        interactive && state === "idle" && "is-interactive",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/lovable-uploads/new-logo.png"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </span>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 9: Commit Phase 1 foundation

- [ ] **Step 1: Stage and commit**

Run:
```bash
git add package.json package-lock.json src/index.css tailwind.config.ts src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/badge.tsx src/utils/formatDate.ts src/components/AnimatedLogo.tsx
git commit -m "$(cat <<'EOF'
Add UI polish foundation: tokens, Inter font, AnimatedLogo, refined variants

Phase 1 of the €200k-feel polish pass. Invisible in isolation; enables
all subsequent phases. Spec: docs/superpowers/specs/2026-04-21-ui-polish-200k-feel-design.md

- Inter Variable font (self-hosted via @fontsource-variable/inter)
- Design tokens for borders (alpha), shadows (layered), surfaces (gradient)
- Logo animation CSS with prefers-reduced-motion fallback
- Refined button default (gradient + layered shadow), outline (alpha border)
- Refined card (subtle border + surface gradient + sm shadow)
- New badge "live" variant (emerald with dot + halo)
- New AnimatedLogo component (idle/working states)
- New formatDate util ("12 Mar 2026")

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Verify clean state**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean` (or only untracked files unrelated to this plan).

---

## Phase 2 — Shell + Auth

Swap static logos for `AnimatedLogo`, refine header treatment.

---

### Task 10: Swap AppLayout logo and refine header

**Files:**
- Modify: `src/pages/AppLayout.tsx`

- [ ] **Step 1: Add the AnimatedLogo import**

In `src/pages/AppLayout.tsx`, add this import after the existing `import { Button }` line (around line 5):

```tsx
import { AnimatedLogo } from "@/components/AnimatedLogo";
```

- [ ] **Step 2: Replace the `<img>` logo and refine header wrapper**

Replace lines 62–96 in `src/pages/AppLayout.tsx` (the `<div className="min-h-screen...">` wrapper down through the closing `</header>`) with:

```tsx
return (
    <div className="min-h-screen bg-background">
      <header className="relative border-b border-[hsl(var(--border-subtle))] bg-surface-header after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-[hsl(var(--border-default))] after:to-transparent">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AnimatedLogo size={36} />
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">ATAD2 risk assessment</h1>
              {user && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Welcome back, {userProfile?.first_name || user.email?.split('@')[0]}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdminRoute && (
              <Button variant="outline" size="sm" onClick={handleBack} aria-label="Back">
                Terug
              </Button>
            )}
            {isAdmin ? (
              <Button variant="secondary" asChild>
                <Link to="/admin" state={{ from: location }}>Admin</Link>
              </Button>
            ) : null}
            {user && (
              <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
            )}
          </div>
        </div>
      </header>
```

Changes vs. current: `border-b` uses subtle alpha border; header gets `bg-surface-header` gradient; `h-14` → `h-16`; gradient hairline added via `after:`; `<img>` replaced by `<AnimatedLogo size={36} />`; title gets `tracking-tight`.

- [ ] **Step 3: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 11: Swap Auth page logo

**Files:**
- Modify: `src/pages/Auth.tsx:331-341`

- [ ] **Step 1: Add import**

In `src/pages/Auth.tsx`, add after line 12 (the `cn` import):

```tsx
import { AnimatedLogo } from "@/components/AnimatedLogo";
```

- [ ] **Step 2: Replace the `<img>` logo block**

In `src/pages/Auth.tsx`, replace lines 335–341 (the `<div className="flex justify-center">` block containing the `<img>`) with:

```tsx
        <div className="flex justify-center">
          <AnimatedLogo size={64} />
        </div>
```

- [ ] **Step 3: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 12: Visual spot-check + commit Phase 2

- [ ] **Step 1: Run dev server for user visual check**

Start the dev server so the user can verify the header + auth logo:

```bash
npm run dev
```

Expected:
- Vite prints `Local: http://localhost:5173/` (or similar)
- User opens browser to `/auth` — sees logo breathing; hover = 60° snap rotation
- User navigates to `/` after login — header logo breathing; title reads in tight Inter
- No console errors

Ask user: **"Does Phase 2 look correct? Header and Auth polish applied. OK to commit?"** Wait for confirmation. Stop dev server (Ctrl+C).

- [ ] **Step 2: Commit**

```bash
git add src/pages/AppLayout.tsx src/pages/Auth.tsx
git commit -m "$(cat <<'EOF'
Use AnimatedLogo in header + auth, refine header surface

Phase 2 of the UI polish pass. Replaces static <img> with AnimatedLogo
(breathing idle, hover snap). Header gets surface gradient + gradient
hairline border; height bumped to 64px.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Dashboard

Extract `SessionRow`, add eyebrow labels + skeleton loading + live badge + formatDate.

---

### Task 13: Create `SessionRow` component

**Files:**
- Create: `src/components/SessionRow.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/SessionRow.tsx` with:

```tsx
import { useNavigate } from "react-router-dom";
import { FileText, Trash2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDate } from "@/utils/formatDate";

export interface SessionRowProps {
  sessionId: string;
  taxpayerName: string;
  fiscalYear: string;
  completedAt: string | Date | null | undefined;
  hasMemorandum: boolean;
  memorandumDate?: string | null;
  onDelete: () => void;
}

export function SessionRow({
  sessionId,
  taxpayerName,
  fiscalYear,
  completedAt,
  hasMemorandum,
  memorandumDate,
  onDelete,
}: SessionRowProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between p-4 border border-[hsl(var(--border-subtle))] rounded-lg bg-background transition-[border-color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-px hover:border-[hsl(var(--border-default))] hover:shadow-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-semibold tracking-tight truncate">{taxpayerName}</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {hasMemorandum ? (
                    <Badge variant="live">
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      In progress
                    </Badge>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {hasMemorandum
                    ? `Memorandum generated on ${formatDate(memorandumDate)}`
                    : "No memorandum generated yet"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="text-sm text-muted-foreground tabular">
          FY {fiscalYear} · Completed {formatDate(completedAt)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/assessment-report/${sessionId}`)}
        >
          <FileText className="h-4 w-4 mr-2" />
          View report
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 transition-colors duration-200">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete assessment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete this assessment for {taxpayerName}?
                This will delete all answers and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

Note: `CheckCircle` (used by the old inline badge in Index) is intentionally omitted — the new `Badge variant="live"` has its own dot, no icon needed.

- [ ] **Step 2: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 14: Wire `SessionRow` into Index + eyebrow labels + skeleton

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Update imports in Index.tsx**

Replace lines 1–23 (the entire import block) with:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { SessionRow } from "@/components/SessionRow";
```

The old imports from `@/components/ui/alert-dialog`, `@/components/ui/badge`, `@/components/ui/tooltip`, and the lucide icons are all now encapsulated inside `SessionRow`, so they're removed.

- [ ] **Step 2: Remove the unused `RecentReport` interface and its useQuery**

The `recentReports` useQuery (lines ~53–92) is fetched but never rendered in the JSX. Delete:
- The `interface RecentReport { ... }` block (lines ~36–43)
- The entire `const { data: recentReports } = useQuery({ ... })` block (lines ~53–92)

`useQuery` was already removed from the imports in Step 1 — this step is purely removing dead code.

Run `grep -n "recentReports\|RecentReport\|useQuery" src/pages/Index.tsx` after editing; expected output: no matches.

- [ ] **Step 3: Replace the rendered dashboard body**

Replace the entire `return` block (from `return (` around line 223 down to the final `);` of the component) with:

```tsx
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
            Get started
          </div>
          <CardTitle>Start new assessment</CardTitle>
          <CardDescription>
            Begin a new ATAD2 risk assessment for a taxpayer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/assessment")} size="lg">
            Start assessment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
            History
          </div>
          <CardTitle>Completed assessments</CardTitle>
          <CardDescription className="text-sm">
            View or delete your previously completed assessments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No completed assessments yet</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  sessionId={session.session_id}
                  taxpayerName={session.taxpayer_name}
                  fiscalYear={session.fiscal_year}
                  completedAt={session.created_at}
                  hasMemorandum={Boolean(session.has_memorandum)}
                  memorandumDate={session.memorandum_date}
                  onDelete={() => deleteSession(session.session_id, session.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
```

Note: the outer `<div className="min-h-screen bg-background p-4"><div className="max-w-4xl mx-auto">` wrapper is removed — `AppLayout` already provides this padding via its `<main className="p-4"><div className="max-w-4xl mx-auto">`. Verify this is true by re-reading [src/pages/AppLayout.tsx:102-106](src/pages/AppLayout.tsx#L102-L106) — it already wraps the Outlet in `<main className="p-4"><div className="max-w-4xl mx-auto">`. Keeping both would double-wrap, so remove the Index-level wrapper.

- [ ] **Step 4: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 15: Visual spot-check + commit Phase 3

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

Expected:
- User navigates to `/` (dashboard)
- Eyebrow labels "Get started" / "History" visible in uppercase tracking
- Session rows hover = lift 1px with shadow
- "Ready" badge shows green dot with halo (no checkmark icon)
- Dates render as "12 Mar 2026" format
- While list loads: 3 skeleton rows appear instead of "Loading assessments..."

Ask user: **"Does Phase 3 (Dashboard) look correct? OK to commit?"** Wait for confirmation. Stop dev server.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Index.tsx src/components/SessionRow.tsx
git commit -m "$(cat <<'EOF'
Polish dashboard: SessionRow component, eyebrow labels, skeletons, live badge

Phase 3 of the UI polish pass.

- Extract SessionRow from Index.tsx (single-responsibility, testable shape)
- Eyebrow labels above card titles ("Get started" / "History")
- Skeleton rows during initial load (replaces text-only "Loading...")
- Migrate to new Badge variant="live" (dot + halo) for Ready state
- Session rows: subtle border, hover lift + shadow
- Unified date format via formatDate ("12 Mar 2026")
- Remove unused recentReports useQuery

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Flow (Assessment, Report)

Replace prominent page-level Loader2 spinners with `<AnimatedLogo state="working" />`. Keep tiny inline spinners (save-state indicators) as Loader2 — too granular for the brand logo.

---

### Task 16: Add AnimatedLogo to the memo-generation waiting surface

**Files:**
- Modify: `src/pages/AssessmentReport.tsx`

All three existing `Loader2` usages in this file (lines 584, 650, 719) are **inline** indicators — two 3×3px save-state spinners in Pencil-edit flows, and one h-4 w-4 spinner inside the "Generate memorandum" button. Per the spec, tiny inline spinners keep `Loader2` (brand logo would be too visually heavy).

The page-level generation indicator is the `<WaitingMessage />` block at ~line 736 (rendered while `isGeneratingReport` is true). That block shows rotating copy but currently has **no visual spinner**. This is where `AnimatedLogo state="working"` belongs — it gives the user a clear focal point during the 1–2 minute wait.

- [ ] **Step 1: Add AnimatedLogo import**

In `src/pages/AssessmentReport.tsx`, add a new line below the existing lucide-react import (around line 11):

```tsx
import { AnimatedLogo } from "@/components/AnimatedLogo";
```

Do NOT remove `Loader2` from the lucide-react import — it's still used for the inline save spinners.

- [ ] **Step 2: Add the animated logo above WaitingMessage**

Locate the block (around lines 736–738):

```tsx
{isGeneratingReport && (
  <WaitingMessage />
)}
```

Replace with:

```tsx
{isGeneratingReport && (
  <div className="flex flex-col items-center gap-3 py-4">
    <AnimatedLogo state="working" size={48} />
    <WaitingMessage />
  </div>
)}
```

- [ ] **Step 3: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 17: Add eyebrow label to ReportDetail

**Files:**
- Modify: `src/pages/ReportDetail.tsx`

- [ ] **Step 1: Read the top of ReportDetail to find the main title area**

Run:
```bash
rg -n "CardTitle|CardHeader" src/pages/ReportDetail.tsx | head -5
```

Expected: identifies the first `<CardHeader>` block containing the page's main title.

- [ ] **Step 2: Add an eyebrow div above the primary CardTitle**

Inside the first `<CardHeader>` block of ReportDetail, immediately before the `<CardTitle>` element, insert:

```tsx
<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
  Assessment report
</div>
```

- [ ] **Step 3: Verify build + lint**

Run:
```bash
npm run build && npm run lint
```

Expected: both exit code 0.

---

### Task 18: Visual spot-check + commit Phase 4

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

Expected:
- User navigates to an assessment report — sees "Assessment report" eyebrow above title
- User triggers a report regeneration (or waits through one in-flight) — sees rotating Svalner logo instead of generic Loader2
- Inline "save" spinners (Pencil-edit flows) still show Loader2 — correct

Ask user: **"Does Phase 4 (Flow) look correct? OK to commit?"** Wait for confirmation. Stop dev server.

- [ ] **Step 2: Commit**

```bash
git add src/pages/AssessmentReport.tsx src/pages/ReportDetail.tsx
git commit -m "$(cat <<'EOF'
Polish assessment flow: logo as report-gen indicator + eyebrow in ReportDetail

Phase 4 of the UI polish pass.

- Swap prominent report-generation Loader2 for AnimatedLogo state="working"
- Keep tiny inline save-state spinners as Loader2 (too granular for brand)
- Add eyebrow label "Assessment report" above ReportDetail title

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

### Task 19: Whole-app smoke test

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: exit code 0, bundle size unchanged ±5%.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 3: Dev run + manual walk-through**

```bash
npm run dev
```

User walks through:
- `/auth` → see 64px breathing logo, hover-snap works, Inter typography visible
- Sign in → land on `/` → header logo breathing, eyebrow labels on cards, session rows hover-lift
- Open an assessment → flow feels same but typography tighter
- Open/generate a report → logo-as-spinner shows during gen
- Reduce motion (OS toggle) → breathe stops, working-state falls back to opacity-pulse

- [ ] **Step 4: Confirm no deploy**

Run:
```bash
git log origin/main..HEAD --oneline
```

Expected: 4 commits local, none pushed. **Do not run `git push`.** User pushes manually when satisfied (CI will deploy from main on push).

---

## Self-review against spec

Cross-check against `docs/superpowers/specs/2026-04-21-ui-polish-200k-feel-design.md`:

- ✅ Vibe A (Linear/Vercel): hairline alpha borders, layered shadows, tight typography — Tasks 2, 4, 5
- ✅ No palette change — all new tokens use existing slate hue
- ✅ Animated logo system (idle/working/hover): Task 8 + CSS in Task 2
- ✅ `prefers-reduced-motion` fallback (opacity-pulse for working): Task 2 step 4
- ✅ Inter self-hosted (no Google Fonts call): Task 1
- ✅ tabular-nums utility: Task 2 step 4, used in SessionRow Task 13
- ✅ Eyebrow label pattern: Index.tsx Task 14, ReportDetail Task 17
- ✅ Badge `live` variant: Task 6, used in Task 13
- ✅ Button refinement (gradient + layered shadow + translate hover): Task 4
- ✅ Card refinement (surface + subtle border): Task 5
- ✅ SessionRow extraction: Task 13
- ✅ Skeleton loading on Index: Task 14 step 3
- ✅ formatDate utility: Task 7, used in SessionRow
- ✅ AppLayout header gradient + hairline: Task 10
- ✅ AnimatedLogo in Auth (size 64): Task 11
- ✅ Loader2 → AnimatedLogo for page-level report gen: Task 16
- ✅ Keep inline save Loader2 (save-state): Task 16 step 1
- ✅ Admin pages untouched: no admin task; they inherit globals only
- ✅ No deploy: Task 19 step 4

No spec requirements uncovered.
