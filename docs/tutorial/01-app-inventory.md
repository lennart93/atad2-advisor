# ATAD2 Advisor — App inventarisatie (voor Tutorial)

Dit document is de basis voor de in-app tutorial. Het beschrijft elk scherm, elke feature, de datastroom en de logische gebruikersvolgorde. Bron: codebase scan + bestaande CLAUDE.md.

> Alle UI is **Engels**. Alle screenshots gebruiken **dummy data** (fictieve taxpayer "Atlas Holdings B.V.", FY 2025, etc.). Geen echte clientdata.

---

## 1. Routes-overzicht

### Publiek (geen login vereist)
| Route | Doel |
|---|---|
| `/auth` | Sign in / Sign up (tabs) — Svalner Atlas domein |
| `/verify-email` | OTP verificatie na sign-up |
| `/forgot-password` | Vraag reset-link aan |
| `/reset-password` | Stel nieuw wachtwoord in (token-based) |
| `/email-confirmed` | Success scherm na verificatie |

### Beschermd (ingelogd)
| Route | Doel |
|---|---|
| `/` | Dashboard — start nieuwe assessment + geschiedenis |
| `/assessment` | **Stap 1** — Intake (taxpayer, fiscal year) |
| `/assessment/upload` | **Stap 2** — Document upload + AI-prefill trigger |
| `/assessment` (met session) | **Stap 3** — Questionnaire met sidebar + context panel |
| `/assessment/structure/:id` | **Stap 4** — Ownership structure chart (React Flow) |
| `/assessment-confirmation/:id` | **Stap 5** — Preliminary outcome bevestigen / overrulen |
| `/assessment-report/:id` | **Stap 6** — Memo viewer + DOCX download |
| `/report/:id` | Losse memo viewer (vanuit dashboard) |

### Admin (alleen voor admin/moderator)
| Route | Doel |
|---|---|
| `/admin` (Dashboard) | KPI cards (sessions, scores, users, period filter) |
| `/admin/questions` | Vragenlijst editor (list of flow-canvas) |
| `/admin/context-questions` | Follow-up vragen beheren |
| `/admin/sessions` + `/admin/sessions/:id` | Alle user assessments + deep-dive |
| `/admin/users` | Gebruikers + rollen (User / Moderator / Admin) |
| `/admin/audit` | Audit log van acties |
| `/admin/analytics` | Trends / risico-verdeling |
| `/admin/explorer` | Raw database explorer |
| `/admin/prompts` | n8n / edge function prompts beheren |
| `/admin/prefill-jobs` | Status van document-extractie jobs |
| `/admin/feedback` | User feedback inbox (categorisatie + triage) |

---

## 2. De hoofd-user journey (6 stappen)

Dit is de rode draad van de tutorial. Wordt omhuld door `AssessmentShell` met persistente `AssessmentStepper` bovenin en sticky footer.

### Stap 1 — Intake (`/assessment`)
**Doel:** Sessie aanmaken met taxpayer-naam en fiscaal jaar.
**Elementen:**
- Input: Taxpayer name (required)
- Input: Fiscal year (YYYY)
- Checkbox: "Fiscal year ≠ calendar year" → toont period start/end date pickers
- Button: "Start assessment"

**Backend:** Nieuwe row in `atad2_sessions` (status `in_progress`).

### Stap 2 — Upload documents (`/assessment/upload`)
**Doel:** Documenten uploaden die de AI gebruikt om antwoorden voor te stellen.
**Elementen:**
- Drag-and-drop zone + file picker
- Document list met: filename, category dropdown, quality badge, delete
- `DocumentQualityMeter` (visuele kwaliteitsindicator: good/fair/poor)
- `AnalyzeProgress` (tijdens analyse)
- Footer: "Skip" (met confirm als geen docs) of "Continue to questions"
- Optioneel low-quality dialog vraagt om meer docs

**Backend:** Files → Supabase storage. Classificatie via Azure OpenAI. Bij "Continue" → n8n `generate-report` webhook gestart asynchroon.

### Stap 3 — Questionnaire (`/assessment`, met session)
**Doel:** Risico-vragen beantwoorden; AI levert suggesties uit documenten.
**Elementen:**
- **Links:** `AssessmentSidebar` — categorieën (collapsible), progressie, search
- **Center:** één vraag per moment — titel, opties (radio/select), explanation textarea, "Unknown" optie, `SuggestionCard` (accept/reject AI-prefill), hover tooltips op tax-jargon
- **Rechts:** `ContextPanel` — relevante document-snippets (semantic search)
- **Footer:** Back / Next of "Continue to structure"

**Backend:** Antwoorden per vraag opgeslagen in `atad2_answers` (incl. risk_points).

### Stap 4 — Structure chart (`/assessment/structure/:id`)
**Doel:** Visueel de ownership-structuur tekenen / verifiëren.
**Elementen:**
- `StructureChart` canvas (React Flow + dagre layout):
  - `EntityNode`s — shape-driven (rect=corp, triangle=pship, oval=trust)
  - `OwnershipEdge`s met percentages
  - Parchment palette, géén pill-badges (per project conventie)
- `FloatingPalette` (links boven) — entity types
- `FloatingInspector` (rechts, bij selectie) — entity/edge editor
- `FloatingToolbar` (onder midden) — collapse non-relevant, auto-arrange, fiscal unity
- `BlockingBanner` als extractie nog draait
- `EntityInspector` modal voor diepe details

**Backend:** Entiteiten/edges in Supabase. n8n extraheert auto uit documenten. Snapshot (PNG) bij save voor embedding in DOCX.

### Stap 5 — Outcome confirmation (`/assessment-confirmation/:id`)
**Doel:** Preliminaire uitkomst goedkeuren of overrulen.
**Elementen:**
- Outcome badge: Risk identified / Insufficient info / Low risk
- Risk score
- Radio: Accept OR Override (textarea ≥100 chars + dropdown nieuwe uitkomst)
- Optionele extra context section
- Footer: Back / "Confirm & generate memo"

### Stap 6 — Report & memo (`/assessment-report/:id`)
**Doel:** Memo lezen, downloaden, feedback geven.
**Elementen:**
- `AnimatedLogo` in "working" state tijdens generatie
- Markdown viewer (react-markdown + DOMPurify)
- `DownloadMemoButton` (DOCX export — embeds chart PNG via docxtemplater)
- `MemoFeedbackEditor` (geef revision-feedback)
- Diff view tussen versies
- Footer: "Done"

---

## 3. Dashboard (`/`) — startpunt + tutorial-knop

- **"Get started" section** — title "Start new assessment" + grote primary button "Start assessment".
- **"History" section** — kaarten met taxpayer, FY, session-id (mono), badge (Ready/In progress/Memo pending), Resume/View button, delete (confirm dialog).
- **Empty state** als nog niets gedaan.

→ **De Tutorial-knop komt hier**, naast of als derde section onderaan "Get started".

---

## 4. Globale chrome

| Component | Locatie | Functie |
|---|---|---|
| `AppLayout` header | sticky top | AnimatedLogo, title "ATAD2 risk assessment", greeting, `AssessmentProgressIndicator`, `ThemeToggle`, Admin button, Sign out |
| `FloatingFeedbackButton` | linksonder fixed | Type-select + textarea → `atad2_feedback` |
| `AnimatedLogo` | overal | Idle (breathing) / Working (rotation) — vervangt spinners |
| `CommandPalette` | Cmd+K | Snelle navigatie |
| `DownloadMemoButton` | report + report detail | DOCX export |
| Sonner + shadcn Toaster | overal | Notificaties |

---

## 5. Design tokens (matchen in tutorial)

- **Fonts:** Geist Variable + Geist Mono. Headings: semibold + tracking-tight. Uppercase labels: tracking-[0.18em].
- **Kleuren:** Neutral gray scale (true gray, geen blauwzweem). Light + dark mode via CSS vars (`--background`, `--foreground`, `--muted`, `--border`, `--border-subtle`).
- **Accenten:** Emerald-500 voor "Ready", Amber-500 voor "In progress", Red voor destructive, Parchment voor structure chart.
- **Motion:** 120ms / 200ms / 320ms met `ease-emphasized` (cubic-bezier 0.2,0,0,1). Framer Motion (`MotionPage`, `FadeIn`, `StaggerChildren`).
- **Shadows:** xs / sm / md / lg + `shadow-btn-primary` met inset highlight.
- **Radius:** 0.5rem.

---

## 6. Datastromen (high-level)

```
User → React frontend (Vite) → Supabase (self-hosted) → atad2_* tables + storage
                            ↘ n8n webhook (generate-report) → Azure OpenAI + Anthropic
                                                              → schrijft terug naar Supabase
```

Documenten triggert async prefill-job → suggestions verschijnen in Step 3.
Memo generatie → markdown in `atad2_reports` → frontend rendert + downloadt als DOCX.

---

## 7. Logische tutorial-volgorde (chapters)

1. **Welkom** — wat is deze app, voor wie, hoe lang duurt de tutorial.
2. **Sign in & dashboard** — eerste login, header chrome, dashboard layout.
3. **Start een assessment** — intake step.
4. **Documenten uploaden** — drag-drop, categorieën, quality meter, AI-prefill.
5. **Vragenlijst** — sidebar, context panel, suggestion cards, "Unknown", tooltips.
6. **Structure chart** — entiteiten toevoegen, edges, fiscal unity, auto-extract.
7. **Outcome confirmation** — preliminary outcome, accept / override.
8. **Memo & download** — memo viewer, DOCX download, feedback geven.
9. **Terug naar dashboard** — geschiedenis, resume, delete.
10. **Feedback geven** — FloatingFeedbackButton.
11. **(Optioneel) Admin** — kort overzicht voor admins.
