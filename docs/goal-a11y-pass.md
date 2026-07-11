# Goal — Accessibility Pass (WCAG 2.1 AA)

Continues the A–D UI campaign; autonomous Claude Code + Playwright MCP, systematic and incremental, verify every change.

## Objective
Bring ATAD2 Advisor to WCAG 2.1 AA without altering the A–D visual design. Additive, not a redesign. Exception: colour contrast — where the palette fails AA, do NOT silently recolour; flag it.

## Tooling (all four)
1. eslint-plugin-jsx-a11y — add to lint config, fix flagged JSX.
2. @axe-core/playwright — inject axe per route AND per state; the automated backbone.
3. Lighthouse accessibility — once per key route.
4. Manual keyboard walkthrough — tab through every flow, no mouse (focus order, traps, restoration).

## Scope — routes × states
Every critical flow in ALL states (loading/empty/error/populated): auth/login; decision tree (keyboard-heavy core); client input forms; RAG/analysis results; memo generation incl. async states (in-progress, streaming, complete, failed); modals/dialogs/drawers; primary nav/menus.

## Check categories
- Semantics/landmarks: real headings in order, main/nav/header, lists as lists; structure before ARIA.
- Keyboard: everything reachable/operable, logical tab order, visible focus, no traps, skip link; decision tree fully keyboard-operable.
- Focus management: modals trap + restore focus to trigger; route changes move focus; async completion (memo/analysis) lands focus or announcement sensibly, not lost at top of DOM.
- ARIA: correct roles, no redundant/broken ARIA; aria-live regions for RAG + memo status ("generating/done/failed") = highest-value ARIA work. Native HTML first.
- Forms: every input labelled; errors programmatically tied + announced, not just red; required state exposed; inline validation reaches AT.
- Contrast: text >=4.5:1, large text/UI >=3:1 against the A–D palette; failures = propose minimal token change and FLAG for Lennart, never auto-recolour.
- Images/icons: meaningful = alt text, decorative = hidden; icon-only buttons have accessible names.
- Dynamic content: loading/result changes announced; streaming must not spam the live region per token.
- Motion: respect prefers-reduced-motion (disable/reduce non-essential animation).
- Zoom/reflow: usable at 200% zoom and 320px width, no content loss or horizontal scroll.

## Working loop
Per category per route: audit (axe + eslint + keyboard) -> categorise -> fix incrementally -> re-verify (axe + keyboard pass) -> confirm no visual regression vs A–D -> commit that category. No batching unrelated fixes into one commit.

## Guardrails
- Do NOT alter A–D visual design/layout; contrast is the only reason to touch colour, and even then flag rather than decide.
- Semantic HTML over ARIA; don't paper over bad structure with roles.
- Do NOT break existing Playwright tests; if a selector changes due to a label/role, update the test in the same commit.
- Usual local/VPN setup.
- Genuine design/UX decisions (contrast conflict, focus-order ambiguity, control without accessible pattern) -> stop and flag in the report, don't guess.

## Definition of done
- axe: 0 critical + 0 serious violations across every route x state.
- Keyboard: all interactive elements reachable/operable, focus always visible, no traps, skip link works.
- Forms: fully labelled, errors announced + programmatically associated.
- Async flows: RAG/memo status announced via live regions; focus handled on completion.
- Contrast: AA met, or every failure listed as an open decision for Lennart.
- Motion: prefers-reduced-motion respected.
- Reflow: clean at 200% zoom and 320px.
- Lighthouse accessibility >= 95 on key routes.

## Output
Short report file: what was found, what was fixed (grouped by category), and a clearly separated list of open decisions (contrast conflicts + UX calls) for Lennart. That report is the handoff, same as the A–D passes.
