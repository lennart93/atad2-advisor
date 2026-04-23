# ATAD2 Admin Suite — Design Spec

**Datum:** 2026-04-21
**Auteur:** Lennart Wilming (via brainstorm-sessie met Claude)
**Status:** Goedgekeurd in brainstorm; wacht op review

## 1. Doel

Een mooie, coherente admin-suite bouwen binnen de bestaande ATAD2 Advisor app. De hoofdgebruiker is Lennart (en later eventueel andere admins). De bestaande admin-pagina's (`src/pages/admin/*`) zijn functioneel maar esthetisch onderontwikkeld en missen belangrijke workflows — vooral rond het **beheren van vragen en contextvragen**, wat de hoofdfocus is.

De suite moet drie dingen samenbrengen:
- **Analytics** — kerncijfers en trends rond sessies, memo's, feedback
- **Data-explorer** — read-only doorzoeken van Supabase-tabellen
- **Operational beheer** — vragen, contextvragen, gebruikers, sessies bewerken

## 2. Scope & prioriteiten

**In scope (hoge polish):**
- Hub (startpagina) — nieuw
- Vragenbeheer + Contextvragenbeheer — nieuw/grondig herschreven
- Sessie-detail met tabs — nieuw
- Hergebruikbare admin-componenten (`AdminCard`, `IconChip`, `SlideInPanel`, etc.)

**In scope (licht):**
- Analytics-pagina — basic grafieken
- Data Explorer — curated read-only tabelbrowser
- Sessies lijst / Users / Audit — herstyled in nieuwe look, geen grote UX-veranderingen

**Expliciet uit scope:**
- Schema-migraties (geen wijzigingen aan Supabase-tabellen)
- Nieuwe backend of Edge Functions
- Multi-tenant support (blijft single-tenant voor Svalner Atlas)
- Versiehistorie of drag-drop reordering van vragen (kan later als separaat project)
- Bulk-edit van vragen (niet nu)
- Feature flags of staging/preview omgevingen (ontwikkeling gebeurt lokaal, deploy wanneer Lennart dat zegt)

## 3. Autorisatie

De infrastructuur bestaat al en wordt hergebruikt:
- Alle `/admin/*` routes zijn gewrapt in `<ProtectedRoute><AdminRoute>` (`src/App.tsx`)
- `AdminRoute` roept `supabase.rpc("has_role", { _user_id, _role: "admin" })` aan
- `user_roles` tabel heeft een `can_modify_admin_role` policy die voorkomt dat niet-admins zichzelf admin maken

**Eénmalige setup:** grant `admin` rol aan `lennart.wilming@svalneratlas.com`:
```sql
INSERT INTO user_roles (user_id, role)
VALUES ((SELECT id FROM auth.users WHERE email = 'lennart.wilming@svalneratlas.com'), 'admin');
```

**Zichtbaarheid in hoofd-app:** de "Admin"-link in de hoofd-sidebar toont alleen als `has_role` true is. Niet-admins zien de link niet.

## 4. Information architecture

```
/admin                          → Hub (nieuwe startpagina)
/admin/questions                → Vragen (lijst + flow-toggle)
/admin/questions/:id            → Zelfde lijst, slide-in paneel open
/admin/context-questions        → Contextvragen (lijst, geen flow)
/admin/context-questions/:id    → Zelfde lijst, slide-in paneel open
/admin/sessions                 → Sessies-lijst
/admin/sessions/:id             → Sessie-detail met tabs (Dossier/Journey/Audit)
/admin/users                    → Gebruikers & rollen
/admin/analytics                → Analytics (grafieken/trends)
/admin/explorer                 → Data Explorer (read-only tabelbrowser)
/admin/audit                    → Audit log
```

## 5. Visuele stijl

**Basis:** clean, minimalistisch, licht. Bento-grid kaarten. Gekleurde icon-chips als signatuurelement.

**Tokens** (uitgebreid in `src/index.css` of een nieuw `admin.css`):
- Kaart: `bg-white`, `border-[1px] border-[#ececec]`, `rounded-[14px]`, `p-4`
- Icon-chip: 36×36px, `rounded-[10px]`, pastel-achtergrond, hoofdkleur voor icoon
- Hover-state voor klikbare kaarten: lichte shadow-verhoging

**Entity colors** (consistent door de hele admin — elk onderwerp heeft dezelfde kleur):
| Entiteit | Hoofdkleur | BG-chip | Icoon |
|----------|-----------|---------|-------|
| Sessies | `#4f46e5` (indigo) | `#eef2ff` | file-text |
| Gebruikers | `#d97706` (amber) | `#fef3c7` | users |
| Vragen | `#16a34a` (groen) | `#dcfce7` | check-square |
| Contextvragen | `#0891b2` (cyan) | `#cffafe` | help-circle |
| Feedback | `#db2777` (roze) | `#fce7f3` | message-square |
| Analytics | `#6366f1` (indigo-400) | `#e0e7ff` | bar-chart |
| Data Explorer | `#2563eb` (blauw) | `#dbeafe` | database |
| Audit | `#dc2626` (rood) | `#fee2e2` | alert-circle |
| Instellingen | `#9333ea` (paars) | `#f3e8ff` | settings |

Kleurcodes worden geëxporteerd uit één const-map (`src/components/admin/entityColors.ts`).

**Risk-chip kleur** (voor risicopunten):
- `≤ 1.0` → groen (`bg-[#dcfce7]`, `text-[#166534]`)
- `1.0 – 3.0` → amber (`bg-[#fef3c7]`, `text-[#92400e]`)
- `> 3.0` → rood (`bg-[#fee2e2]`, `text-[#991b1b]`)

## 6. Gedeelde componenten (nieuw, in `src/components/admin/`)

- **`AdminCard`** — witte kaart met consistent border/radius; slots voor header, body, footer
- **`IconChip`** — gekleurde icoon-chip; props: `color: keyof EntityColors`, `icon: LucideIcon`, `size?: 'sm' | 'md'`
- **`EntityColors`** — const map (zie tabel hierboven) + helper `getRiskChipClasses(points: number)`
- **`SlideInPanel`** — rechter-paneel dat van rechts inschuift; props: `open`, `onClose`, `title`, `children`, `width?`; Escape sluit; fade-overlay achter paneel
- **`SearchFilterBar`** — toolbar met zoekveld + filter-pills + optionele view-toggle (Lijst/Flow); props: `onSearchChange`, `filters`, `viewMode`
- **`FlowCanvas`** — wrapper rond React Flow (`@xyflow/react`) + `dagre` voor auto-layout; props: `nodes`, `edges`, `onNodeClick`
- **`KpiCard`** — grote/kleine stat-tegel met icoon, getal, trend-regel, optionele sparkline
- **`StatChip`** — kleine chip voor risico, status, etc.

## 7. Pagina-details

### 7.1 Hub — `/admin` (vervangt `Dashboard.tsx`)

**Layout:** bento-grid, 4 kolommen.

**Header-rij:**
- Links: "Goedemorgen, {firstName}" + datum + "Svalner Atlas Admin"
- Rechts: periode-selector (`Laatste 7 dagen ▾` — 24u/7d/30d/90d) + avatar-initialen

**Kerncijfers-rij (label "Kerncijfers"):**
- Groot (span 2): **Sessies totaal** — grote cijfer + trend-% + mini sparkline (uit sessies-per-dag)
- Klein: **Gemiddelde score** — gemiddelde `final_score` binnen geselecteerde periode
- Klein: **Memo's gegenereerd** — count van memo-rijen + "+X vandaag"

**Snelkoppelingen-rij (label "Snelkoppelingen"):**
Grid van 4×2 = 8 tegels. Elk: icon-chip (entity kleur), titel, ondertekst, links naar de route.
- Sessies · Gebruikers · Vragen · Contextvragen
- Feedback · Analytics · Data Explorer · Audit Log

**Data-bronnen:**
- Sessies count: `select count(*) from atad2_sessions where created_at >= periode_start`
- Sparkline: `select date_trunc('day', created_at), count(*) ...` gegroepeerd
- Gem. score: `avg(final_score) where final_score is not null`
- Memos: tabel-afhankelijk (waarschijnlijk `memos` tabel) — tijdens implementatie verifiëren welke tabel dit heet

### 7.2 Vragen — `/admin/questions`

**Toolbar (sticky top):**
- Zoekveld (case-insensitive match op `question_id`, `question_title`, `question`)
- Filter-pills: risicopunten-range-slider, toggle "heeft uitleg", toggle "eind-vraag (geen next)"
- Toggle rechts: `📋 Lijst` ↔ `🔀 Flow`
- Knop `+ Nieuwe vraag`

**Lijst-modus (default):**
Per rij:
- Genummerd chip (volgorde in de keten vanaf startvraag, 1-indexed)
- `Q_xxx · Titel` (ID indigo, titel donker)
- Ondergrond: volledige `question` tekst (truncate bij lange tekst)
- Rechts: risk-chip (groen/amber/rood o.b.v. `risk_points`), `→ Q_yyy` of `→ END`
- Hover: actieknoppen (✎ bewerken, 🗑 verwijderen met confirm)
- Klik op rij = opent slide-in paneel, URL update naar `/admin/questions/:id`

**Flow-modus:**
- React Flow canvas; nodes = vragen (met dezelfde kleurregels als lijst), edges volgen `next_question_id`
- Auto-layout via `dagre` (top-down tree)
- Pan/zoom/minimap zichtbaar, fit-to-view knop
- Node-klik = opent hetzelfde slide-in paneel
- Orphan-vragen (geen inkomende edge én niet startvraag) krijgen een waarschuwings-badge

**Slide-in edit-paneel (breedte 480px):**
Secties van boven naar beneden:
1. **Header:** `Q_xxx` label + titel-input + ✕ sluiten
2. **Formulier** (identiek aan huidige `QuestionForm.tsx` velden):
   - `question_id` (read-only bij bewerken, bewerkbaar bij nieuw)
   - `question_title` (Input)
   - `question` (Textarea, rows=4)
   - `answer_option` (Input, hint: "Ja/Nee of meerdere opties gescheiden door |")
   - `risk_points` (nummer, step=0.1, min=0)
   - `next_question_id` (**Combobox met autocomplete** uit alle bestaande `question_id`'s, plus optie "EINDE / geen next")
   - `difficult_term` (Input, optioneel)
   - `term_explanation` (Textarea, optioneel)
3. **Flow-context** sectie:
   - "← Komt vanaf" — lijst van `question_id`'s waar `next_question_id = deze.question_id` (klikbare pills)
   - "→ Gaat naar" — getoond als pill op basis van `next_question_id`
4. **Preview** sectie:
   - Rendering van hoe de vraag eruitziet voor de user: `question_title` als header, `question` als body, `answer_option` gesplitst op `|` als knoppen, met dezelfde classes als de echte assessment-pagina
   - Als er `difficult_term` is: toon die onderstreept + tooltip met `term_explanation`
5. **Footer:** Annuleren (outline), Verwijderen (destructive, met AlertDialog), Opslaan (primary)

Escape = annuleren + sluiten. Save = muteren via TanStack Query + invalidate `admin-questions` + toast.

### 7.3 Contextvragen — `/admin/context-questions`

Identiek aan 7.2 maar:
- Tabel is `atad2_context_questions`
- Veld-set kan afwijken (tijdens implementatie bevestigen met huidige `ContextQuestionForm.tsx`)
- **Geen** Flow-modus (contextvragen vormen geen graph)

### 7.4 Sessies — `/admin/sessions` en `/admin/sessions/:id`

**Lijst:**
- Velden: session_id (mono-font truncated), taxpayer_name, user (email), status (gekleurde chip), final_score (met kleurindicatie), created_at
- Toolbar: zoek (taxpayer, email, session_id), filter op status + datum-range
- Klik op rij → `/admin/sessions/:id`

**Detail-pagina (`/admin/sessions/:id`):**
- Header: taxpayer + session_id + status + created_at + knop "Verwijderen" (confirm)
- Tab-balk:
  - **Dossier** — alle antwoorden per vraag (koppeling `atad2_answers` → `atad2_questions`), de gegenereerde memo inline (indien aanwezig), feedback gegeven op de sessie
  - **Journey** — tijdlijn: timestamp per antwoord, tijd-tussen-antwoorden; markeer drop-offs (>5min stilte); skipped questions
  - **Audit** — alle `audit_logs` rijen die naar deze sessie verwijzen (memo-wijzigingen, antwoord-wijzigingen, etc.)

### 7.5 Analytics — `/admin/analytics`

- Periode-selector (zelfde als hub) bovenin
- Grafieken (met `recharts`, al in stack):
  - **Sessies per week** (line chart, laatste 12 weken)
  - **Gemiddelde score per maand** (line chart, laatste 12 maanden)
  - **Top-10 vragen met hoogste drop-off** (horizontal bar — hoeveel sessies stopten bij elke vraag)
  - **Feedback distributie** (pie of bar — counts per rating/sentiment)

Queries: direct via Supabase client met groupby of via Postgres views (nader te bepalen tijdens implementatie — views als queries te zwaar zijn in client).

### 7.6 Data Explorer — `/admin/explorer`

- Dropdown met whitelist van tabellen: `atad2_sessions`, `atad2_answers`, `memos`, `feedback`, `profiles`, `atad2_questions`, `atad2_context_questions`, `audit_logs`
- Tabel met: paging (50 rijen/pagina), kolom-sorting (server-side via `order`), simpel zoek-veld per kolom
- Klik op rij = opent een drawer met volledige rij als syntax-highlighted JSON
- **Strikt read-only** — geen edit/delete, geen SQL-invoer (voorkomt destructieve fouten)

### 7.7 Users, Audit Log

Bestaande pagina's, alleen herstyled met nieuwe kaart/chip-componenten. Geen nieuwe functionaliteit.

## 8. Sidebar-herziening

`src/components/admin/AdminSidebar.tsx` krijgt extra items:
- Dashboard → "Hub" hernoemen (of weglaten, aangezien icoon + `/admin` dat duidelijk maakt)
- Nieuwe items: Analytics, Data Explorer (Audit staat er al)

Sidebar gebruikt dezelfde entity-kleuren voor de icoontjes.

## 9. Technologische dependencies

**Nieuw toe te voegen:**
- `@xyflow/react` — React Flow voor de vragen-flow-diagram
- `dagre` — auto-layout voor de flow-graph
- `@types/dagre` — TypeScript types

**Al aanwezig (hergebruiken):**
- `@tanstack/react-query` — data fetching
- `react-hook-form` + `zod` — forms
- `recharts` — analytics grafieken
- `lucide-react` — icoontjes
- shadcn/ui componenten

## 10. Testen & valideren

- Lokaal ontwikkelen met `npm run dev`, handmatig testen tegen de self-hosted Supabase op `https://api.atad2.tax`
- Golden paths handmatig doorlopen:
  - Login als admin-user → landing op `/admin` hub
  - Zoek en bewerk een vraag in slide-in paneel → opslaan → verdwijnt uit lijst correct
  - Switch naar flow-modus → klik node → opent paneel
  - Open sessie-detail → alle 3 tabs renderen
- Niet-admin users testen via secundair account: zien geen admin-link, krijgen NotAuthorized bij directe URL
- **Niet** auto-committen of pushen naar git; Lennart beslist wanneer er gedeployed wordt

## 11. Risico's & open aandachtspunten

- **Tabelnamen verifiëren:** tijdens implementatie nog checken welke exacte tabelnamen de memo's / feedback / events hebben (zijn niet 100% zeker vanuit deze brainstorm)
- **Performance flow-modus:** bij 142+ vragen kan React Flow + dagre traag zijn bij eerste render. Zo nodig memoïseren of virtualiseren.
- **Startvraag-identificatie:** de "volgorde" in de lijst-modus vereist dat we weten wat de *eerste* vraag is. Als er geen expliciet veld voor is, moeten we of een conventie afspreken (bv. laagste `question_id` of een `is_start` veld toevoegen) — TBD bij implementatie.
- **Drop-off analyse:** vereist timestamp per antwoord. Als `atad2_answers` geen `answered_at` heeft, moeten we dat afleiden uit `audit_logs` of een kolom toevoegen — TBD.
- **Deployen:** de productie-deploy via GitHub Actions blijft ongewijzigd. Commits naar main triggeren auto-deploy — daarom wacht elke commit/push op expliciete goedkeuring van Lennart.

## 12. Volgende stap

Implementatieplan (stapsgewijs) uitschrijven via de `writing-plans` skill.
