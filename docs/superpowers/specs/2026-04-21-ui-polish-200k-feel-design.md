# UI Polish — "€200k tool feel"

**Date:** 2026-04-21
**Owner:** Lennart Wilming
**Status:** Design — pending implementation plan

## Goal

Give ATAD2 Advisor the visual polish of a premium advisory tool (think Linear / Vercel / Attio) without changing the product identity. Same colors, same shadcn/ui component base, same layouts — but with the detail work that separates "built by a team" from "built over a weekend."

The Svalner Atlas asterisk logo becomes an animated brand anchor used consistently across the app.

## Non-goals

- **No palette change.** Keep existing slate/near-black (`--primary: 222.2 47.4% 11.2%`), neutral grays. No colored accent system.
- **No layout restructuring.** Header stays top, dashboard stays single-column max-w-4xl, assessment flow stays as-is.
- **No component library swap.** Keep shadcn/ui as baseline; refine its surfaces via design tokens, not forks.
- **No new logo asset.** Continue referencing `public/lovable-uploads/new-logo.png` at its existing path — proven in production.
- **No deploy.** Local iteration only until explicitly approved.
- **Admin surfaces out of scope for this pass** (Dashboard, Questions, Sessions, Users, AuditLogs). Polish applies to the user-facing shell and flow.

## Design direction: "A — Linear / Vercel"

Selected after A/B/C/D comparison. Crisp, hairline, monochrome, tight typography. The polish comes from restraint and consistent micro-detail, not decoration.

## Scope (in order of visual priority)

1. **Global shell** (`AppLayout.tsx`) — header with animated logo
2. **Auth page** (`Auth.tsx`) — first impression; logo is already prominent there
3. **Dashboard** (`Index.tsx`) — card treatments, session rows, empty states
4. **Assessment flow** (`Assessment.tsx`, `AssessmentSidebar.tsx`) — where users spend most time
5. **Report detail** (`ReportDetail.tsx`) — advisor → client handoff surface

Out of this pass: all `pages/admin/*`, `AssessmentConfirmation.tsx`, `VerifyEmail.tsx`, `EmailConfirmed.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `NotAuthorized.tsx`, `NotFound.tsx`. These inherit any global token changes (typography, button) but don't get bespoke polish.

## Design tokens (new / changed)

Added to `src/index.css` under `:root`. HSL-based, consistent with existing system.

```css
/* Typography */
--font-sans: 'Inter', -apple-system, 'Segoe UI', sans-serif;
--tracking-tight: -0.015em;   /* headings */
--tracking-snug:  -0.005em;   /* body large */

/* Borders (swap from solid grays to alpha) */
--border-subtle: 222 47% 11% / 0.06;
--border-default: 222 47% 11% / 0.1;
--border-strong: 222 47% 11% / 0.18;

/* Elevation (layered) */
--shadow-xs: 0 1px 0 rgb(15 23 42 / 0.02);
--shadow-sm: 0 1px 0 rgb(15 23 42 / 0.02), 0 1px 2px rgb(15 23 42 / 0.04);
--shadow-md: 0 1px 0 rgb(15 23 42 / 0.02), 0 4px 16px -8px rgb(15 23 42 / 0.1);
--shadow-btn-primary:
  0 1px 0 rgb(255 255 255 / 0.1) inset,
  0 1px 2px rgb(15 23 42 / 0.15),
  0 4px 10px -4px rgb(15 23 42 / 0.2);

/* Surface gradients */
--surface-card: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(0 0% 99%) 100%);
--surface-header: linear-gradient(180deg, hsl(0 0% 98% / 0) 0%, hsl(0 0% 98% / 0.4) 100%);
```

Tailwind config (`tailwind.config.ts`) extends `fontFamily`, adds `letterSpacing` tokens, extends `boxShadow` with the layered values, adds `backgroundImage` for `surface-card` / `surface-header`.

## Typography

- **Font family:** swap from default system stack to **Inter** (loaded via `@fontsource-variable/inter` npm package, self-hosted — no Google Fonts network call, CSP-safe).
- **Body:** 14px base (unchanged), `letter-spacing: var(--tracking-snug)` at 16px+.
- **Headings:** `letter-spacing: var(--tracking-tight)`, `font-weight: 600` (not 700).
- **Numeric content** (dates, counts, years): `font-variant-numeric: tabular-nums` via new `.tabular` utility. Apply to session meta, completion dates, answer counts.
- **Eyebrow label** (new pattern): 10px, 600, 0.12em tracking, uppercase, `text-muted-foreground/70`. Used above card titles in dashboard to add structure without bulk.

## Logo animation system

Single source: existing `public/lovable-uploads/new-logo.png`. All behavior via CSS transforms — the file and its path do not change.

New component: `src/components/AnimatedLogo.tsx`. Wraps the `<img>` and accepts three props:

```typescript
type AnimatedLogoProps = {
  size?: number;                          // px, default 32
  state?: 'idle' | 'working';             // default 'idle'
  interactive?: boolean;                  // default true — enables hover snap
  className?: string;
};
```

**State: `idle`**
- Default behavior.
- CSS `animation: breathe 4s ease-in-out infinite`
- `@keyframes breathe` — scale 1 → 1.04 → 1, opacity 1 → 0.88 → 1
- `animation-play-state: paused` when `prefers-reduced-motion: reduce`

**Interactive hover**
- On parent `:hover`, breathe pauses and transform applies: `rotate(60deg) scale(1.02)`
- Transition: `transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot easing for the "snap")
- 60° matches the 6-petal symmetry so it reads as discrete click, not wobble

**State: `working`**
- Continuous rotation: `animation: work-spin 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite`
- Replaces existing `Loader2` / spinner usage in the user-facing flow:
  - `Index.tsx` dashboard loading state
  - `Assessment.tsx` saving/generating states
  - `ReportDetail.tsx` report-generation waiting screen (via `WaitingMessage.tsx`)

Admin pages keep `Loader2` — no bespoke logo integration there.

**Accessibility**
- All instances have `role="img"`, `aria-label="Svalner Atlas"` (or `aria-label="Loading"` when `state="working"`)
- `prefers-reduced-motion: reduce` disables breathe and work-spin animations; hover-snap keeps a short fade instead of transform

## Component refinements

Applied via token changes — no per-component forks. Files touched listed per change.

### Header (`src/pages/AppLayout.tsx`)

- Logo: `<img>` replaced with `<AnimatedLogo size={36} />`. Size up from 32 to 36.
- Header background: add `bg-[image:var(--surface-header)]`
- Bottom border: replace `border-b` with a gradient hairline
  ```html
  <header class="... relative after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border after:to-transparent">
  ```
- Title: `tracking-tight`
- Vertical padding: from `h-14` (56px) to `h-16` (64px) for breathing room

### Buttons (`src/components/ui/button.tsx`)

Extend `buttonVariants` in place — do not fork file structure.

- `default` (primary):
  - `bg-gradient-to-b from-slate-800 to-slate-900` (slate-900 ≈ current primary)
  - `border border-slate-950`
  - `shadow: var(--shadow-btn-primary)`
  - `hover:-translate-y-px` with `transition-transform duration-100`
- `outline`:
  - `border-[hsl(var(--border-default))]`
  - `hover:border-[hsl(var(--border-strong))]`
- All variants: `tracking-[-0.005em]`, `font-medium` (was `font-medium` already — keep)

### Cards (`src/components/ui/card.tsx`)

- `border` → `border-[hsl(var(--border-subtle))]`
- `bg-card` → `bg-[image:var(--surface-card)]`
- `shadow-sm` → `shadow-[var(--shadow-sm)]`
- `rounded-lg` unchanged (0.5rem)

### Badges (`src/components/ui/badge.tsx`)

New variant: `live` for the "Ready" state on completed sessions.

- `bg-emerald-50 border border-emerald-500/15 text-emerald-700`
- Leading dot: `<span class="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgb(16_185_129_/_0.2)]">`
- Replaces `bg-green-100 text-green-800` current ad-hoc styling in `Index.tsx`

### Dashboard (`src/pages/Index.tsx`)

- Replace inline `className="flex items-center justify-between p-4 border rounded-lg"` session rows with a small `<SessionRow>` component in `src/components/SessionRow.tsx`. Why now: the row already has 3 concerns (display, delete dialog, navigate) and is about to get hover-lift + new badge treatment. Extracting keeps `Index.tsx` readable.
- Add `eyebrow` labels above card titles: "Get started" / "History".
- Session row hover: `hover:border-[hsl(var(--border-default))] hover:shadow-[var(--shadow-md)] hover:-translate-y-px transition-all duration-200`
- Remove the ad-hoc green badge; use new `<Badge variant="live">` with dot.
- Dates through a small `formatDate()` helper in `src/utils/formatDate.ts` using `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })` → "12 Mar 2026". Applied in SessionRow + ReportDetail + any other surfaces that currently use `toLocaleDateString()`.

### Auth page (`src/pages/Auth.tsx`)

- Logo: `<img>` replaced with `<AnimatedLogo size={64} />` (unchanged size, now animated)
- Card: inherits refined treatment automatically via `card.tsx` changes
- No structural change

### Assessment flow (`src/pages/Assessment.tsx`, `src/components/AssessmentSidebar.tsx`)

- All existing `Loader2` inside user-facing flows → `<AnimatedLogo state="working" size={...} />`
- Sidebar item hover: same `-translate-y-px` treatment on completed items
- `WaitingMessage.tsx` — the "generating report" surface — replaces its spinner with a large `<AnimatedLogo state="working" size={72} />`. Copy unchanged.

### Report detail (`src/pages/ReportDetail.tsx`)

- Header card gets `eyebrow` label: "Assessment report"
- Report body `.markdown-body` stays as-is (already tuned)

## Loading states

- Dashboard session list while loading: swap current "Loading assessments..." text for `<Skeleton>` rows (shadcn skeleton exists). Three skeleton rows matching final SessionRow height.
- Assessment initial load: keep as-is (fast enough, no skeleton needed).

## File inventory

**New files**
- `src/components/AnimatedLogo.tsx` — logo component with idle/working states
- `src/components/SessionRow.tsx` — extracted from Index.tsx
- `src/utils/formatDate.ts` — consistent date formatting

**Modified files**
- `src/index.css` — new tokens, keyframes (`breathe`, `work-spin`), font import
- `tailwind.config.ts` — extend fontFamily, letterSpacing, boxShadow, backgroundImage
- `src/pages/AppLayout.tsx` — use AnimatedLogo, header gradient
- `src/pages/Auth.tsx` — use AnimatedLogo
- `src/pages/Index.tsx` — use SessionRow, eyebrow labels, skeletons
- `src/pages/Assessment.tsx` — use AnimatedLogo for loading states
- `src/pages/ReportDetail.tsx` — eyebrow label
- `src/components/ui/button.tsx` — refined primary gradient + shadow
- `src/components/ui/card.tsx` — subtle border + surface gradient + layered shadow
- `src/components/ui/badge.tsx` — new `live` variant
- `src/components/WaitingMessage.tsx` — use AnimatedLogo

**Dependencies added**
- `@fontsource-variable/inter` — self-hosted Inter font

## Constraints the implementation must respect

1. Logo `src` path stays `/lovable-uploads/new-logo.png` — never rename, never move.
2. No `prefers-color-scheme: dark` polish in this pass. The dark theme block in `index.css` is preserved but untuned; if dark mode is ever enabled it'll look acceptable but not polished. Explicit follow-up.
3. `prefers-reduced-motion: reduce` disables all non-functional motion (idle breathe, hover snap, button translate). Functional rotation on `<AnimatedLogo state="working" />` falls back to a pure opacity pulse (`animation: work-pulse 1.5s ease-in-out infinite`, opacity 1 → 0.55 → 1) so users still perceive ongoing work without vestibular-triggering rotation.
4. No new colors. Emerald in the `live` badge is already implicit via `bg-green-100` currently in use — migration, not addition.
5. Admin pages get global token changes only (Inter font, refined card/button). No per-admin polish.

## Phasing (for the implementation plan)

- **Phase 1 — Foundation.** Design tokens, Inter font, button.tsx + card.tsx + badge.tsx variants, `AnimatedLogo` component, `formatDate` helper. Nothing visible in isolation; provides the palette for the next phases. Verifiable via Storybook-less visual check of `AnimatedLogo` on a scratch page.
- **Phase 2 — Shell + auth.** AppLayout header, Auth page. Most visible first-impression change.
- **Phase 3 — Dashboard.** Index.tsx, SessionRow extraction, skeletons, eyebrow labels.
- **Phase 4 — Flow.** Assessment, WaitingMessage, ReportDetail. Replaces remaining spinners.

Each phase is independently mergeable and visibly complete.

## Success criteria

- Side-by-side against current production: a reasonable observer says the new version "feels more premium" without being able to name exactly why.
- The logo breathes in the header at all times; rotates during any report generation or dashboard fetch.
- No change in page-load performance beyond the one-time Inter font load (variable font, ~40KB).
- `prefers-reduced-motion` honored.
- No color regressions against existing brand. No layout shift on any page.

## Open questions (resolved)

- ~~Which vibe?~~ A — Linear/Vercel.
- ~~PNG or SVG logo?~~ PNG. Keep existing asset. SVG trace deferred as optional future enhancement.
- ~~Logo motion?~~ Breathe idle + hover snap + working-state rotation.
- ~~Typography swap?~~ Yes — Inter, self-hosted via npm.
- ~~Admin polish?~~ Out of scope for this pass.
