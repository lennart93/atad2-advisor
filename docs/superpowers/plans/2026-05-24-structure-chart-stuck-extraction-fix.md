# Structure chart stuck-extraction fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voorkom dat de structure chart eindeloos blijft hangen op een `extracting:*` status nadat de backend pipeline halverwege is doodgegaan. Lossen we op met een `heartbeat_at` kolom + automatische herstart als de heartbeat ouder is dan 90 seconden.

**Architecture:** Eén nieuwe DB-kolom (`heartbeat_at`). De pipeline schrijft elke 15s een vers tijdstempel zolang hij leeft. De edge function checkt bij elke nieuwe aanroep: status begint met `extracting:` MAAR heartbeat is >90s oud → behandel als dood, start opnieuw. Geen frontend changes.

**Tech Stack:** Supabase (self-hosted, PostgreSQL + Edge Functions / Deno), TypeScript, Vitest voor unit tests.

**Spec:** [docs/superpowers/specs/2026-05-24-structure-chart-stuck-extraction-fix-design.md](../specs/2026-05-24-structure-chart-stuck-extraction-fix-design.md)

---

## File overview

| Bestand | Wat | Waarom |
|---|---|---|
| `supabase/migrations/20260524120000_chart_heartbeat.sql` | nieuw | DB-kolom `heartbeat_at` + comment |
| `src/integrations/supabase/types.ts` | aanpassen | `heartbeat_at` toevoegen aan `atad2_structure_charts` Row/Insert/Update types |
| `supabase/functions/extract-structure/staleness.ts` | nieuw | Pure helper `isStaleExtracting(status, heartbeatAt, now)` — geïsoleerd zodat we hem kunnen testen |
| `src/lib/structure/__tests__/staleness.test.ts` | nieuw | Vitest unit tests voor `isStaleExtracting` |
| `supabase/functions/extract-structure/index.ts` | aanpassen | `setStatus` bumpt heartbeat; nieuwe `startHeartbeat` helper; 409-pad checkt staleness; `runPhaseA`/`runPhaseB` houden heartbeat draaiend |

---

## Task 1: DB migratie — `heartbeat_at` kolom

**Files:**
- Create: `supabase/migrations/20260524120000_chart_heartbeat.sql`

- [ ] **Step 1: Maak de migratie aan**

```sql
-- Add heartbeat_at so a dead background extraction can be detected and
-- recovered. The extract-structure edge function writes this column
-- every ~15s while the pipeline is alive. On the next trigger, if status
-- is still 'extracting:*' but heartbeat_at is older than 90s, the
-- function assumes the previous worker died and restarts the pipeline.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

COMMENT ON COLUMN public.atad2_structure_charts.heartbeat_at IS
  'Last sign of life from the background extraction pipeline. Compared against now() to detect stuck "extracting:*" status.';
```

- [ ] **Step 2: Migratie uitvoeren op de VM-database**

Op een lokale machine met `psql` of via `supabase db push` met de juiste connection string. Voor deze repo (self-hosted op de VM) gaat dat via SSH naar de VM en daar de SQL uitvoeren tegen de Postgres in Docker. Concreet:

```bash
# vanaf je lokale machine
scp supabase/migrations/20260524120000_chart_heartbeat.sql atad2:/tmp/
ssh atad2 "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/20260524120000_chart_heartbeat.sql"
```

Verwacht: `ALTER TABLE` en `COMMENT` zonder errors.

- [ ] **Step 3: Verifiëren in de DB**

```bash
ssh atad2 "docker exec -i supabase-db psql -U postgres -d postgres -c \"\\d public.atad2_structure_charts\" | grep heartbeat"
```

Verwacht: regel met `heartbeat_at | timestamp with time zone |`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260524120000_chart_heartbeat.sql
git commit -m "feat(structure): add heartbeat_at column for stuck-extraction detection"
```

---

## Task 2: types.ts handmatig bijwerken

De repo gebruikt een gecheckte `src/integrations/supabase/types.ts`. We voegen `heartbeat_at` toe op dezelfde manier als bestaande nullable timestamp kolommen (zie `snapshot_captured_at`).

**Files:**
- Modify: `src/integrations/supabase/types.ts` (regels 502–544, het `atad2_structure_charts` blok)

- [ ] **Step 1: Voeg het veld toe in Row, Insert en Update**

In het `atad2_structure_charts` blok, voeg `heartbeat_at` toe op alfabetisch logische plek (naast `draft_extracted_at` of `snapshot_captured_at`).

Row:
```typescript
        Row: {
          canvas_height: number
          canvas_width: number
          created_at: string
          draft_extracted_at: string | null
          finalized_at: string | null
          heartbeat_at: string | null
          id: string
          session_id: string
          snapshot_captured_at: string | null
          snapshot_png: string | null
          status: string
          updated_at: string
          warnings: Json
        }
```

Insert:
```typescript
        Insert: {
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          draft_extracted_at?: string | null
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          session_id: string
          snapshot_captured_at?: string | null
          snapshot_png?: string | null
          status?: string
          updated_at?: string
          warnings?: Json
        }
```

Update:
```typescript
        Update: {
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          draft_extracted_at?: string | null
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          session_id?: string
          snapshot_captured_at?: string | null
          snapshot_png?: string | null
          status?: string
          updated_at?: string
          warnings?: Json
        }
```

- [ ] **Step 2: TypeScript check draaien**

```bash
npx tsc --noEmit
```

Verwacht: geen nieuwe errors. (Eventuele bestaande errors negeren — die staan los van deze wijziging.)

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(types): add heartbeat_at to atad2_structure_charts row type"
```

---

## Task 3: Pure helper voor stale-detectie (TDD)

We bouwen `isStaleExtracting()` test-first. Pure functie, makkelijk te testen.

**Files:**
- Create: `supabase/functions/extract-structure/staleness.ts`
- Create: `src/lib/structure/__tests__/staleness.test.ts`

- [ ] **Step 1: Schrijf de falende tests**

`src/lib/structure/__tests__/staleness.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isStaleExtracting, STALE_THRESHOLD_MS } from '../../../../supabase/functions/extract-structure/staleness';

describe('isStaleExtracting', () => {
  const now = new Date('2026-05-24T12:00:00Z');

  it('returns false when status is not in an extracting state', () => {
    expect(isStaleExtracting('draft_ready', '2026-05-24T11:00:00Z', now)).toBe(false);
    expect(isStaleExtracting('phase_a_ready', '2026-05-24T11:00:00Z', now)).toBe(false);
    expect(isStaleExtracting('extraction_failed', '2026-05-24T11:00:00Z', now)).toBe(false);
  });

  it('returns false when status is extracting but heartbeat is fresh', () => {
    const fresh = new Date(now.getTime() - 10_000).toISOString();
    expect(isStaleExtracting('extracting:stage1', fresh, now)).toBe(false);
    expect(isStaleExtracting('extracting:stage2', fresh, now)).toBe(false);
    expect(isStaleExtracting('extracting:refining', fresh, now)).toBe(false);
  });

  it('returns true when status is extracting and heartbeat is older than threshold', () => {
    const stale = new Date(now.getTime() - STALE_THRESHOLD_MS - 1_000).toISOString();
    expect(isStaleExtracting('extracting:stage1', stale, now)).toBe(true);
    expect(isStaleExtracting('extracting:stage2', stale, now)).toBe(true);
    expect(isStaleExtracting('extracting:refining', stale, now)).toBe(true);
  });

  it('returns true when status is extracting and heartbeat is null (legacy rows pre-migration)', () => {
    expect(isStaleExtracting('extracting:stage1', null, now)).toBe(true);
  });

  it('uses 90 seconds as the threshold', () => {
    expect(STALE_THRESHOLD_MS).toBe(90_000);
  });

  it('boundary: exactly at threshold counts as stale', () => {
    const atBoundary = new Date(now.getTime() - STALE_THRESHOLD_MS).toISOString();
    expect(isStaleExtracting('extracting:stage1', atBoundary, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests om te zien dat ze falen**

```bash
npx vitest run src/lib/structure/__tests__/staleness.test.ts
```

Verwacht: alle tests falen met `Cannot find module '.../extract-structure/staleness'`.

- [ ] **Step 3: Schrijf de helper**

`supabase/functions/extract-structure/staleness.ts`:

```typescript
// Pure helper to decide whether a chart row stuck in an "extracting:*" status
// is actually still alive, based on the recency of its heartbeat. Kept in its
// own file so it can be unit-tested from the Vitest side without pulling in
// any Deno-specific imports.

/** Heartbeat older than this counts as a dead pipeline. */
export const STALE_THRESHOLD_MS = 90_000;

export function isStaleExtracting(
  status: string | null | undefined,
  heartbeatAt: string | null | undefined,
  now: Date,
): boolean {
  if (!status || !status.startsWith('extracting:')) return false;
  if (!heartbeatAt) return true;
  const age = now.getTime() - new Date(heartbeatAt).getTime();
  return age >= STALE_THRESHOLD_MS;
}
```

- [ ] **Step 4: Run tests om te zien dat ze slagen**

```bash
npx vitest run src/lib/structure/__tests__/staleness.test.ts
```

Verwacht: alle 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-structure/staleness.ts src/lib/structure/__tests__/staleness.test.ts
git commit -m "feat(structure): pure isStaleExtracting helper + unit tests"
```

---

## Task 4: Heartbeat-helper + `setStatus` update in de edge function

We voegen twee dingen toe aan `index.ts`:
- `setStatus` bumpt voortaan ook `heartbeat_at`.
- Een `startHeartbeat()` helper die elke 15s `heartbeat_at` bijwerkt en een stop-functie teruggeeft.

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: `setStatus` bijwerken zodat hij ook heartbeat schrijft**

Vervang het bestaande `setStatus` blok (regel 193–204) door:

```typescript
async function setStatus(
  client: SupabaseClient,
  chartId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const { error } = await client
    .from("atad2_structure_charts")
    .update({ status, heartbeat_at: new Date().toISOString(), ...extra })
    .eq("id", chartId);
  if (error) throw error;
}
```

Wijziging: één veld erbij in het update-object (`heartbeat_at: new Date().toISOString()`). Door `...extra` ná onze velden te plaatsen kan een caller hem expliciet overschrijven als hij dat ooit wil — voor nu doet niemand dat, dus gedrag is consistent.

- [ ] **Step 2: Heartbeat-helper toevoegen onder `setStatus`**

Voeg na de `setStatus` functie toe:

```typescript
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Start a background ticker that bumps heartbeat_at every HEARTBEAT_INTERVAL_MS.
 * Returns a stop function. Caller MUST call stop() in a finally block to avoid
 * leaking the interval past the pipeline's lifetime.
 *
 * Errors during the heartbeat update are logged but never thrown — a single
 * failed bump should not crash the pipeline.
 */
function startHeartbeat(client: SupabaseClient, chartId: string): () => void {
  const timer = setInterval(async () => {
    try {
      await client
        .from("atad2_structure_charts")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", chartId);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "heartbeat_update_failed",
        message: String(err), chart_id: chartId,
      }));
    }
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
```

- [ ] **Step 3: Verifieer dat de Deno typechecker tevreden is**

```bash
# Op een Mac/Linux waar Deno is geïnstalleerd; op Windows kan dit overgeslagen
# worden — de Github Actions build doet ditzelfde.
cd supabase/functions/extract-structure
deno check index.ts
```

Verwacht: geen errors. Als Deno lokaal niet beschikbaar is, sla deze stap over en vertrouw op de CI-build na deploy.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): setStatus bumps heartbeat + startHeartbeat helper"
```

---

## Task 5: Stale-detectie inhaken in de 409 path

We laten de main handler de `isStaleExtracting` helper gebruiken. Bij stale: log + ga door (val niet terug op 409). Bij vers: nog steeds 409.

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: Import van de helper toevoegen**

Voeg bij de imports bovenaan (regel 1–16) toe:

```typescript
import { isStaleExtracting } from "./staleness.ts";
```

- [ ] **Step 2: `ensureChart` moet ook `heartbeat_at` teruggeven**

Huidige `ensureChart` (regel 177–191) selecteert alleen `id, status`. We hebben `heartbeat_at` nodig voor de check. Vervang door:

```typescript
async function ensureChart(client: SupabaseClient, sessionId: string) {
  const { data: existing } = await client
    .from("atad2_structure_charts")
    .select("id, status, heartbeat_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) {
    return existing as { id: string; status: string | null; heartbeat_at: string | null };
  }
  const { data, error } = await client
    .from("atad2_structure_charts")
    .insert({ session_id: sessionId })
    .select("id, status, heartbeat_at")
    .single();
  if (error) throw error;
  return data as { id: string; status: string | null; heartbeat_at: string | null };
}
```

- [ ] **Step 3: De 409-check vervangen door stale-aware logica**

Vervang het blok op regel 66–71:

```typescript
    if (chart.status && chart.status.startsWith("extracting:")) {
      return json(
        { reason: "already_running", chart_id: chart.id, status: chart.status },
        409,
      );
    }
```

Door:

```typescript
    if (chart.status && chart.status.startsWith("extracting:")) {
      if (isStaleExtracting(chart.status, chart.heartbeat_at, new Date())) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "pipeline_takeover_stale",
          chart_id: chart.id,
          prior_status: chart.status,
          heartbeat_at: chart.heartbeat_at,
        }));
        // Fall through: reset will happen via the normal setStatus call below.
      } else {
        return json(
          { reason: "already_running", chart_id: chart.id, status: chart.status },
          409,
        );
      }
    }
```

Hierna komt al de `await setStatus(serviceClient, chart.id, "extracting:stage1", { warnings: [] });` regel (regel 73 in het origineel) — die reset de status + warnings en zet meteen een verse heartbeat. Geen extra code nodig.

- [ ] **Step 4: Deno check**

```bash
cd supabase/functions/extract-structure
deno check index.ts
```

Verwacht: geen errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): take over stuck extractions when heartbeat is stale"
```

---

## Task 6: Heartbeat draaiend houden tijdens phase runners

`setStatus` bumpt heartbeat bij elke status-overgang, maar Stage 1 en Stage 2 Claude calls kunnen elk 30–60s duren. Tussen status-overgangen door moet de heartbeat dus blijven tikken. We wrappen `runPhaseA` en `runPhaseB` in een `startHeartbeat / stop` paar via try/finally.

**Files:**
- Modify: `supabase/functions/extract-structure/index.ts`

- [ ] **Step 1: `runPhaseA` wrappen**

Huidige `runPhaseA` opening (regel 313–325):

```typescript
async function runPhaseA(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  // Phase A uses documents only — Q&A may not yet exist.
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
  const cachedSystem = `<documents>\n${docsBlock}\n</documents>`;

  // Idempotency: clear any prior ai_extracted rows for this chart so a
  // re-trigger (e.g. user re-uploaded docs) doesn't accumulate stale entities.
  await clearAiExtracted(serviceClient, chartId);
```

Vervang door:

```typescript
async function runPhaseA(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const stopHeartbeat = startHeartbeat(serviceClient, chartId);
  try {
    // Phase A uses documents only — Q&A may not yet exist.
    const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
    const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
    const cachedSystem = `<documents>\n${docsBlock}\n</documents>`;

    // Idempotency: clear any prior ai_extracted rows for this chart so a
    // re-trigger (e.g. user re-uploaded docs) doesn't accumulate stale entities.
    await clearAiExtracted(serviceClient, chartId);
```

Aan het einde van `runPhaseA` (regel 392, na `await setStatus(serviceClient, chartId, "phase_a_ready");`) voeg toe:

```typescript
    await setStatus(serviceClient, chartId, "phase_a_ready");
  } finally {
    stopHeartbeat();
  }
}
```

Let op: de `return` statements binnen de bestaande try-blokken (regel 339, etc.) zitten ná `stopHeartbeat` in een try/finally, dus de heartbeat wordt netjes gestopt ongeacht of we via een return of een throw weggaan.

- [ ] **Step 2: `runPhaseB` wrappen**

Huidige `runPhaseB` opening (regel 395–402):

```typescript
async function runPhaseB(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const qaText = await loadQaAnswersText(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
```

Vervang door:

```typescript
async function runPhaseB(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const stopHeartbeat = startHeartbeat(serviceClient, chartId);
  try {
    const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
    const qaText = await loadQaAnswersText(serviceClient, sessionId);
    const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
```

Aan het einde van `runPhaseB` (na de `if (finalUpdateErr) throw finalUpdateErr;` op regel 530) voeg toe:

```typescript
    if (finalUpdateErr) throw finalUpdateErr;
  } finally {
    stopHeartbeat();
  }
}
```

- [ ] **Step 3: Indentatie controleren**

Open `index.ts` en visueel verifiëren dat:
- Het volledige body van `runPhaseA` zit binnen één `try { ... } finally { stopHeartbeat(); }` blok.
- Idem voor `runPhaseB`.
- Geen verdwaalde haakjes.

```bash
cd supabase/functions/extract-structure
deno check index.ts
```

Verwacht: geen errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/extract-structure/index.ts
git commit -m "feat(extract-structure): heartbeat ticks during phase runners"
```

---

## Task 7: Edge function deployen + handmatige test

De edge function wordt op de VM gedeployed via het bestaande `scripts/deploy-edge-function.sh` script of via `supabase functions deploy extract-structure`.

**Files:**
- (geen)

- [ ] **Step 1: Functie deployen**

```bash
# Optie A: gebruik het bestaande script
bash scripts/deploy-edge-function.sh extract-structure

# Optie B: directe Supabase CLI, als de juiste env geconfigureerd is
supabase functions deploy extract-structure --no-verify-jwt=false
```

Verwacht: deploy succesvol, geen errors in de output.

- [ ] **Step 2: Test happy path**

In de app:
1. Open een sessie waar documenten zijn geüpload en alle questions zijn beantwoord.
2. Navigeer naar de structure chart.
3. Verifieer dat de chart binnen ~60s genereert en op `draft_ready` eindigt.

Verwacht: chart laadt zoals voorheen. Geen regressie.

- [ ] **Step 3: Test stale recovery handmatig**

Dit is de kerntest. Stappen:

1. Trigger een nieuwe extraction (bv. via "Re-extract" knop in de chart-step of door op een nieuwe sessie de chart te openen).
2. Wacht tot de status in de DB `extracting:stage1` of `extracting:stage2` is.
   Check via Supabase Studio (http://135.225.104.142:3000) → table editor → `atad2_structure_charts` → kolom `status`.
3. Op de VM: kill de edge function container om de pipeline te onderbreken:
   ```bash
   ssh atad2 "docker restart supabase-edge-functions"
   ```
4. Verifieer in de DB dat `status` nog op `extracting:*` staat en `heartbeat_at` niet meer wordt bijgewerkt.
5. Wacht 95 seconden.
6. Trigger opnieuw — bijvoorbeeld door op "Re-extract" te klikken, of door de pagina te herladen (de mount-effect in `StructureChartStep` triggert Phase B als status `phase_a_ready` is; voor `extracting:*` poll-t hij — herstart helpt dan niet meteen. In dat geval: handmatig de `Re-extract` knop gebruiken, of in de DB de status op `phase_a_ready` zetten om de fallback te triggeren).
   Eenvoudiger: roep de endpoint zelf aan met curl:
   ```bash
   curl -X POST https://api.atad2.tax/functions/v1/extract-structure \
     -H "Authorization: Bearer <jouw_access_token>" \
     -H "Content-Type: application/json" \
     -d '{"session_id":"<de_session_id>","phase":"refine"}'
   ```
7. Verwacht response: `200 OK` met `{"ok":true,"chart_id":"...","status":"extracting:stage1","phase":"refine"}`.
8. In de Supabase function logs: zoek naar event `pipeline_takeover_stale`.
9. Wacht tot pipeline klaar is. Verwacht: chart eindigt op `draft_ready`.

- [ ] **Step 4: Test dat verse heartbeat NIET wordt overgenomen**

Dit voorkomt valse positieven.

1. Trigger een nieuwe extraction.
2. Wacht 30 seconden (binnen de 90s drempel).
3. Trigger opnieuw via curl (zoals stap 3.6).
4. Verwacht response: `409` met `{"reason":"already_running",...}`.

- [ ] **Step 5: Commit (alleen als er nog iets te committen is)**

Als alle vorige tasks netjes gecommit zijn, is hier niets nieuws. Sla over.

---

## Self-Review

**1. Spec coverage:**

| Spec-onderdeel | Task |
|---|---|
| Kolom `heartbeat_at` toevoegen | Task 1 |
| `setStatus` schrijft heartbeat | Task 4 |
| 15s heartbeat tijdens lange Claude calls | Task 4 (helper) + Task 6 (ingeplugd in phase runners) |
| 409-check verrijken met stale-detectie | Task 5 |
| Reset status + verse heartbeat bij overname | Task 5 (valt via setStatus regel 73 origineel) |
| Restart met de phase van de huidige caller (niet de dode run) | Task 5 — de bestaande code op regel 58 leest `body.phase` los van de DB-status, dus we erven dit gedrag automatisch zodra we de 409-bypass laten doorlopen |
| `src/integrations/supabase/types.ts` bijwerken | Task 2 |
| Unit test voor stale-detectie | Task 3 |
| Handmatige test door container kill | Task 7 step 3 |
| Geen frontend changes | Bevestigd — geen task raakt frontend bestanden |

**2. Placeholder scan:** Geen TBD/TODO/"implement later" in de plan-stappen. Alle code-blokken zijn compleet.

**3. Type consistency:**
- `isStaleExtracting(status, heartbeatAt, now)` — zelfde signatuur in tests (Task 3 step 1), helper definitie (Task 3 step 3), en call site (Task 5 step 3). ✓
- `STALE_THRESHOLD_MS` — zelfde export-naam in tests + helper. ✓
- `startHeartbeat(client, chartId): () => void` — zelfde return-type in helper (Task 4) en gebruik (Task 6 `stopHeartbeat()` call). ✓
- `ensureChart` return type — uitgebreid in Task 5 step 2, geen call site die op de oude `{id, status}` shape leunt buiten de handler zelf (waar we het lezen). ✓

**4. Ambiguity:**
- Het commit-bericht in Task 1 zegt "for stuck-extraction detection" — concreet en niet te interpreteren.
- "phase van de huidige caller" — uitgelegd in self-review tabel met regel-referentie.

Alles dichtgetimmerd. Geen wijzigingen nodig.
