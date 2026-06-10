# Dossier-platform plakken 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plak 1 (documentverlies stoppen) en plak 2 (stil voorwerk) uit de spec [2026-06-10-integral-dossier-platform-design.md](../specs/2026-06-10-integral-dossier-platform-design.md): documenten overleven memo-succes, het dashboard verliest zijn N+1, de memo-sectie-vingerafdrukken landen als pure code, en de twee read-only VM-controles draaien.

**Architecture:** Alleen additieve, risicoarme wijzigingen. Geen schemawijziging, geen deploy van edge functions. Twee pure-code-modules met tests (vitest), twee kleine UI-bestandswijzigingen, één cherry-pick naar feat/technical-appendix, twee read-only-scripts voor de VM.

**Tech Stack:** React + TypeScript + Vite, vitest, Supabase JS client, az vm run-command (read-only psql).

**Branch:** `feat/client-platform`. NIETS pushen; main is productie. Commits blijven lokaal.

---

## File Structure

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `src/pages/AssessmentReport.tsx` | Wijzigen | Cleanup-aanroep na memo-succes verwijderen (regels 6, 79, 469-473) |
| `src/hooks/usePrefill.ts` | Wijzigen | `useCleanupDocuments` markeren als manual/admin-only (regel 507) |
| `src/lib/dashboard/sessionFacts.ts` | Nieuw | Pure helper: antwoord-tellingen + memo-feiten per sessie groeperen |
| `src/lib/dashboard/__tests__/sessionFacts.test.ts` | Nieuw | Tests voor de helper |
| `src/pages/Index.tsx` | Wijzigen | N+1 (2 queries per sessie) vervangen door 2 gebundelde queries + helper |
| `src/lib/memo/sectionDependencies.ts` | Nieuw | Sectie-naar-input-kaart, stabiele hash, staleness-berekening, risicotrio |
| `src/lib/memo/__tests__/sectionDependencies.test.ts` | Nieuw | Tests voor kaart + hash + staleness |
| `scripts/verify_revenue_columns.sh` | Nieuw | Read-only VM-controle: bestaan de 4 revenue-kolommen |
| `scripts/client_dedup_preview.sh` | Nieuw | Read-only VM-controle: voorgestelde klantmappen-lijst |

---

### Task 1: Documentverlies stoppen (plak 1, frontend)

**Files:**
- Modify: `src/pages/AssessmentReport.tsx:6` (import), `:79` (hook), `:469-473` (aanroep)
- Modify: `src/hooks/usePrefill.ts:507`

- [ ] **Step 1: Verwijder de cleanup-aanroep in AssessmentReport.tsx**

Verwijder exact deze regels (nu 469-473), inclusief de commentaarregel:

```typescript
      // Now that the memo has been saved, drop the source documents.
      const cleanupResult = await cleanupDocs.mutateAsync().catch(() => null);
      if (cleanupResult?.deleted_count && cleanupResult.deleted_count > 0) {
        toast.success("Source documents deleted", { description: "The memorandum is saved." });
      }
```

Er komt NIETS voor in de plaats; de regel erna (`queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });`) blijft staan.

- [ ] **Step 2: Verwijder de hook-instantiatie en de import**

Regel 79, verwijder:
```typescript
  const cleanupDocs = useCleanupDocuments(sessionId ?? null);
```

Regel 6, verwijder:
```typescript
import { useCleanupDocuments } from "@/hooks/usePrefill";
```

- [ ] **Step 3: Controleer dat er geen verwijzingen over zijn**

Run: `grep -n "cleanupDocs\|useCleanupDocuments" src/pages/AssessmentReport.tsx`
Expected: geen output (exit code 1).

- [ ] **Step 4: Markeer useCleanupDocuments als manual-only**

In `src/hooks/usePrefill.ts`, vervang regel 507:
```typescript
export function useCleanupDocuments(sessionId: string | null) {
```
door:
```typescript
/**
 * Manual/admin use only. Since the dossier replatform (slice 1, spec
 * 2026-06-10-integral-dossier-platform-design.md) nothing calls this
 * automatically: source documents are retained after memo generation so the
 * client library and year-over-year rollover can use them. The edge function
 * "cleanup" action still exists for deliberate manual cleanup.
 */
export function useCleanupDocuments(sessionId: string | null) {
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build slaagt zonder TypeScript-fouten.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AssessmentReport.tsx src/hooks/usePrefill.ts
git commit -m "fix(documents): stop deleting source documents after memo generation"
```

---

### Task 2: Dezelfde fix als cherry-pick op feat/technical-appendix

De appendix-tak herschreef AssessmentReport.tsx (de cleanup-aanroep zit daar
rond regel 486). Zonder deze cherry-pick blijft het dataverlies bestaan voor
iedereen die vanaf die tak werkt, en groeit de merge-drift.

**Files:**
- Modify (op feat/technical-appendix): `src/pages/AssessmentReport.tsx`, `src/hooks/usePrefill.ts`

- [ ] **Step 1: Pak de commit-hash van Task 1**

Run: `git log -1 --format=%H`
Expected: een 40-teken hash; noteer hem als `<HASH>`.

- [ ] **Step 2: Wissel naar de appendix-tak en cherry-pick**

```bash
git switch feat/technical-appendix
git cherry-pick <HASH>
```

Expected: ofwel een schone cherry-pick, ofwel een conflict in
`src/pages/AssessmentReport.tsx` (de tak verplaatste de regels).

- [ ] **Step 3: Bij conflict, los zo op**

Open het conflicterende bestand en pas drie verwijderingen toe (op deze tak
staat het blok rond regel 486; zoek op `cleanupDocs`):

(a) verwijder dit blok van 5 regels, inclusief de commentaarregel:
```typescript
      // Now that the memo has been saved, drop the source documents.
      const cleanupResult = await cleanupDocs.mutateAsync().catch(() => null);
      if (cleanupResult?.deleted_count && cleanupResult.deleted_count > 0) {
        toast.success("Source documents deleted", { description: "The memorandum is saved." });
      }
```

(b) verwijder de hook-instantiatie:
```typescript
  const cleanupDocs = useCleanupDocuments(sessionId ?? null);
```

(c) verwijder de import:
```typescript
import { useCleanupDocuments } from "@/hooks/usePrefill";
```

usePrefill.ts cherry-pickt doorgaans schoon (de tak wijzigde die functie niet).

```bash
git add src/pages/AssessmentReport.tsx
git cherry-pick --continue
```

- [ ] **Step 4: Controleer en build op de appendix-tak**

Run: `grep -n "cleanupDocs\|useCleanupDocuments" src/pages/AssessmentReport.tsx`
Expected: geen output.

Run: `npm run build`
Expected: slaagt.

- [ ] **Step 5: Terug naar de werkstak**

```bash
git switch feat/client-platform
```

---

### Task 3: Pure helper voor dashboard-feiten (TDD)

**Files:**
- Create: `src/lib/dashboard/sessionFacts.ts`
- Test: `src/lib/dashboard/__tests__/sessionFacts.test.ts`

- [ ] **Step 1: Schrijf de falende test**

```typescript
import { describe, expect, it } from "vitest";
import { groupSessionFacts } from "../sessionFacts";

describe("groupSessionFacts", () => {
  it("counts answers per session and defaults missing sessions to zero", () => {
    const facts = groupSessionFacts(
      ["s1", "s2", "s3"],
      [{ session_id: "s1" }, { session_id: "s1" }, { session_id: "s2" }],
      [],
    );
    expect(facts.get("s1")).toEqual({ answerCount: 2, hasMemorandum: false, memorandumDate: undefined });
    expect(facts.get("s2")?.answerCount).toBe(1);
    expect(facts.get("s3")?.answerCount).toBe(0);
  });

  it("flags a memorandum and picks the latest generated_at regardless of row order", () => {
    const facts = groupSessionFacts(
      ["s1"],
      [],
      [
        { session_id: "s1", generated_at: "2026-01-02T10:00:00Z" },
        { session_id: "s1", generated_at: "2026-03-05T10:00:00Z" },
        { session_id: "s1", generated_at: "2026-02-01T10:00:00Z" },
      ],
    );
    expect(facts.get("s1")).toEqual({
      answerCount: 0,
      hasMemorandum: true,
      memorandumDate: "2026-03-05T10:00:00Z",
    });
  });

  it("ignores rows for sessions that were not requested", () => {
    const facts = groupSessionFacts(
      ["s1"],
      [{ session_id: "ghost" }],
      [{ session_id: "ghost", generated_at: "2026-01-01T00:00:00Z" }],
    );
    expect(facts.get("s1")).toEqual({ answerCount: 0, hasMemorandum: false, memorandumDate: undefined });
    expect(facts.has("ghost")).toBe(false);
  });
});
```

- [ ] **Step 2: Run de test, verwacht falen**

Run: `npx vitest run src/lib/dashboard/__tests__/sessionFacts.test.ts`
Expected: FAIL ("Cannot find module '../sessionFacts'" of vergelijkbaar).

- [ ] **Step 3: Implementeer de helper**

```typescript
export interface SessionFacts {
  answerCount: number;
  hasMemorandum: boolean;
  memorandumDate: string | undefined;
}

/**
 * Groups bulk-fetched answer and report rows back per session, replacing the
 * old per-session N+1 queries on the dashboard. Rows for sessions outside
 * `sessionIds` are ignored; sessions without rows get zero/false defaults.
 */
export function groupSessionFacts(
  sessionIds: string[],
  answerRows: Array<{ session_id: string }>,
  reportRows: Array<{ session_id: string; generated_at: string }>,
): Map<string, SessionFacts> {
  const facts = new Map<string, SessionFacts>();
  for (const id of sessionIds) {
    facts.set(id, { answerCount: 0, hasMemorandum: false, memorandumDate: undefined });
  }
  for (const row of answerRows) {
    const f = facts.get(row.session_id);
    if (f) f.answerCount += 1;
  }
  for (const row of reportRows) {
    const f = facts.get(row.session_id);
    if (!f) continue;
    if (!f.memorandumDate || row.generated_at > f.memorandumDate) {
      f.memorandumDate = row.generated_at;
    }
    f.hasMemorandum = true;
  }
  return facts;
}
```

- [ ] **Step 4: Run de test, verwacht slagen**

Run: `npx vitest run src/lib/dashboard/__tests__/sessionFacts.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/sessionFacts.ts src/lib/dashboard/__tests__/sessionFacts.test.ts
git commit -m "feat(dashboard): pure helper grouping per-session answer/report facts"
```

---

### Task 4: Dashboard-N+1 wegwerken in Index.tsx

**Files:**
- Modify: `src/pages/Index.tsx:81-120` (binnen `loadCompletedSessions`), import-blok bovenin

Huidig gedrag (regels 81-120): per sessie één `count`-query op `atad2_answers`
en één rapport-lookup op `atad2_reports` (1+2N queries). Nieuw: 2 gebundelde
queries + `groupSessionFacts`. De `resumeUrlForSession`-aanroep voor lopende
sessies blijft exact zoals hij is (hij verdwijnt pas in plak 7).

- [ ] **Step 1: Voeg de import toe**

Na regel 24 (`import { resumeUrlForSession } ...`):
```typescript
import { groupSessionFacts } from "@/lib/dashboard/sessionFacts";
```

- [ ] **Step 2: Vervang het N+1-blok**

Vervang regels 81-120 (het hele `const sessionsWithCounts = await Promise.all( ... )`-blok zoals het nu is, beginnend bij `const sessionsWithCounts` en eindigend bij de afsluitende `);` vóór `setSessions`):

```typescript
      const ids = (sessionsData || []).map((s) => s.session_id);

      const [answersRes, reportsRes] = ids.length
        ? await Promise.all([
            supabase
              .from('atad2_answers')
              .select('session_id')
              .in('session_id', ids),
            supabase
              .from('atad2_reports')
              .select('session_id, generated_at')
              .in('session_id', ids)
              .is('archived_at', null),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

      if (answersRes.error) throw answersRes.error;
      if (reportsRes.error) throw reportsRes.error;

      const facts = groupSessionFacts(ids, answersRes.data || [], reportsRes.data || []);

      const sessionsWithCounts = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const sessionFacts = facts.get(session.session_id)!;

          // Where this card should take the user when clicked:
          //  - in-progress → resume at the right step (derived from data)
          //  - completed → report (existing behavior)
          const destination = session.completed
            ? `/assessment-report/${session.session_id}`
            : await resumeUrlForSession({
                session_id: session.session_id,
                completed: session.completed,
                outcome_confirmed: session.outcome_confirmed,
              });

          return {
            ...session,
            completed: Boolean(session.completed),
            outcome_confirmed: Boolean(session.outcome_confirmed),
            answer_count: sessionFacts.answerCount,
            has_memorandum: sessionFacts.hasMemorandum,
            memorandum_date: sessionFacts.memorandumDate,
            destination_url: destination,
          };
        })
      );
```

- [ ] **Step 3: Build en bestaande tests**

Run: `npm run build`
Expected: slaagt.

Run: `npm test`
Expected: alle bestaande tests slagen (er zijn geen tests voor Index.tsx zelf).

- [ ] **Step 4: Handmatige controle**

Run: `npm run dev`, log in, open het dashboard.
Expected: kaarten tonen dezelfde antwoorden-aantallen en memo-badges als
voorheen; het netwerk-tabblad toont 1 sessie-query + 2 gebundelde queries in
plaats van 2 per sessie (resume-lookups voor lopende sessies blijven).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "perf(dashboard): replace per-session N+1 queries with two batched queries"
```

---

### Task 5: sectionDependencies.ts, de memo-vingerafdrukken (TDD)

**Files:**
- Create: `src/lib/memo/sectionDependencies.ts`
- Test: `src/lib/memo/__tests__/sectionDependencies.test.ts`

Fundament voor "Update memorandum" (plak 10), conform spec §5: zes secties,
per sectie de inputbronnen, stabiele hash, risicotrio altijd samen. Pure code,
geen backend. De bron-granulariteit is v1 bewust grof (brongroepen, geen
individuele vraag-ids); verfijning gebeurt bij plak 10 wanneer de echte
sectie-prompts bestaan.

- [ ] **Step 1: Schrijf de falende test**

```typescript
import { describe, expect, it } from "vitest";
import {
  MEMO_SECTIONS,
  RISK_TRIO,
  SECTION_DEPENDENCIES,
  hashSectionInputs,
  staleSections,
  type SectionInputs,
} from "../sectionDependencies";

const baseInputs: SectionInputs = {
  session_meta: { taxpayer_name: "Acme BV", fiscal_year: "2025" },
  documents: [{ id: "d1", created_at: "2026-01-01" }],
  structure: { finalized_at: "2026-01-02", updated_at: "2026-01-02" },
  answers: [{ question_id: "q1", answer: "Yes", explanation: "Because." }],
  outcome: { preliminary_outcome: "low", outcome_overridden: false },
  appendix: { updated_at: "2026-01-03", review_status: "confirmed" },
};

describe("section map", () => {
  it("covers exactly the six memo sections", () => {
    expect(MEMO_SECTIONS).toEqual([
      "introduction",
      "risk_outcome",
      "executive_summary",
      "general_background",
      "technical_assessment",
      "conclusion",
    ]);
    expect(Object.keys(SECTION_DEPENDENCIES).sort()).toEqual([...MEMO_SECTIONS].sort());
  });

  it("keeps the risk trio inside the section list", () => {
    for (const s of RISK_TRIO) expect(MEMO_SECTIONS).toContain(s);
  });
});

describe("hashSectionInputs", () => {
  it("is stable across key order", () => {
    const reordered: SectionInputs = {
      ...baseInputs,
      session_meta: { fiscal_year: "2025", taxpayer_name: "Acme BV" },
    };
    expect(hashSectionInputs("introduction", baseInputs)).toBe(
      hashSectionInputs("introduction", reordered),
    );
  });

  it("changes when a dependent input changes", () => {
    const changed: SectionInputs = {
      ...baseInputs,
      answers: [{ question_id: "q1", answer: "No", explanation: "Changed." }],
    };
    expect(hashSectionInputs("conclusion", changed)).not.toBe(
      hashSectionInputs("conclusion", baseInputs),
    );
  });

  it("ignores inputs the section does not depend on", () => {
    const changed: SectionInputs = {
      ...baseInputs,
      answers: [{ question_id: "q1", answer: "No", explanation: "Changed." }],
    };
    // introduction depends on session_meta + documents, not on answers
    expect(hashSectionInputs("introduction", changed)).toBe(
      hashSectionInputs("introduction", baseInputs),
    );
  });
});

describe("staleSections", () => {
  it("returns nothing when nothing changed", () => {
    const prev = Object.fromEntries(
      MEMO_SECTIONS.map((s) => [s, hashSectionInputs(s, baseInputs)]),
    );
    expect(staleSections(prev, baseInputs)).toEqual([]);
  });

  it("expands any stale risk-trio member to the whole trio", () => {
    const prev = Object.fromEntries(
      MEMO_SECTIONS.map((s) => [s, hashSectionInputs(s, baseInputs)]),
    );
    const changed: SectionInputs = {
      ...baseInputs,
      outcome: { preliminary_outcome: "high", outcome_overridden: false },
    };
    const stale = staleSections(prev, changed);
    for (const s of RISK_TRIO) expect(stale).toContain(s);
    expect(stale).not.toContain("introduction");
  });

  it("treats a missing previous hash as stale", () => {
    const stale = staleSections({}, baseInputs);
    expect(stale.sort()).toEqual([...MEMO_SECTIONS].sort());
  });
});
```

- [ ] **Step 2: Run de test, verwacht falen**

Run: `npx vitest run src/lib/memo/__tests__/sectionDependencies.test.ts`
Expected: FAIL ("Cannot find module '../sectionDependencies'").

- [ ] **Step 3: Implementeer de module**

```typescript
/**
 * Which memo section depends on which dossier inputs, plus the stable
 * fingerprint used to decide which sections must regenerate after inputs
 * change ("Update memorandum", spec 2026-06-10-integral-dossier-platform-design
 * section 5). v1 granularity is per input GROUP; per-question mapping can be
 * added when the section prompts ship (slice 10).
 *
 * NOTE: when the generate-report edge function lands (slice 10) this file gets
 * a Deno mirror under supabase/functions/generate-report/. Keep both in sync.
 */

export const MEMO_SECTIONS = [
  "introduction",
  "risk_outcome",
  "executive_summary",
  "general_background",
  "technical_assessment",
  "conclusion",
] as const;

export type MemoSection = (typeof MEMO_SECTIONS)[number];

/** Regenerated together, always, so the memo cannot contradict its own outcome. */
export const RISK_TRIO: readonly MemoSection[] = [
  "risk_outcome",
  "executive_summary",
  "conclusion",
];

export type SectionInputSource =
  | "session_meta"
  | "documents"
  | "structure"
  | "answers"
  | "outcome"
  | "appendix";

export interface SectionInputs {
  session_meta: unknown;
  documents: unknown;
  structure: unknown;
  answers: unknown;
  outcome: unknown;
  appendix: unknown;
}

export const SECTION_DEPENDENCIES: Record<MemoSection, readonly SectionInputSource[]> = {
  introduction: ["session_meta", "documents"],
  general_background: ["session_meta", "documents", "structure"],
  technical_assessment: ["answers", "structure", "appendix", "documents"],
  risk_outcome: ["answers", "outcome", "appendix"],
  executive_summary: ["answers", "outcome", "appendix"],
  conclusion: ["answers", "outcome", "appendix"],
};

/** JSON.stringify with recursively sorted object keys, so logically equal
 * inputs always serialize identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a 32-bit, hex. Fingerprint only; no cryptographic strength needed. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashSectionInputs(section: MemoSection, inputs: SectionInputs): string {
  const relevant = SECTION_DEPENDENCIES[section].map((source) => [source, inputs[source]]);
  return fnv1a(stableStringify(relevant));
}

/**
 * Which sections must regenerate, given the hashes stored with the previous
 * report and the current inputs. Any stale risk-trio member pulls in the whole
 * trio. Sections without a stored hash count as stale.
 */
export function staleSections(
  previousHashes: Partial<Record<MemoSection, string>>,
  inputs: SectionInputs,
): MemoSection[] {
  const stale = new Set<MemoSection>();
  for (const section of MEMO_SECTIONS) {
    if (previousHashes[section] !== hashSectionInputs(section, inputs)) stale.add(section);
  }
  if (RISK_TRIO.some((s) => stale.has(s))) RISK_TRIO.forEach((s) => stale.add(s));
  return MEMO_SECTIONS.filter((s) => stale.has(s));
}
```

- [ ] **Step 4: Run de test, verwacht slagen**

Run: `npx vitest run src/lib/memo/__tests__/sectionDependencies.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Volledige testrun + build**

Run: `npm test && npm run build`
Expected: alles slaagt.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memo/sectionDependencies.ts src/lib/memo/__tests__/sectionDependencies.test.ts
git commit -m "feat(memo): section dependency map + stable input fingerprints"
```

---

### Task 6: Read-only VM-controles (revenue-kolommen + klant-dedup)

Beide scripts zijn strikt read-only (alleen SELECT). Ze vereisen een actieve
PIM-rol van Lennart; draai ze daarom samen in één PIM-venster. Als `az` niet in
PATH staat: gebruik het volledige pad
`C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` (zie CLAUDE.md).

**Files:**
- Create: `scripts/verify_revenue_columns.sh`
- Create: `scripts/client_dedup_preview.sh`

- [ ] **Step 1: Schrijf het revenue-controlescript**

`scripts/verify_revenue_columns.sh` (LF-regeleinden):
```bash
#!/bin/bash
# Read-only: verify the session revenue columns exist on the VM database
# (migration 20260605120000_session_revenue_tracking.sql). Expected: 4 rows.
docker exec $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -At -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='atad2_sessions'
     AND column_name IN ('sold','revenue_eur','revenue_updated_at','revenue_updated_by')
   ORDER BY column_name;"
```

- [ ] **Step 2: Schrijf het dedup-previewscript**

`scripts/client_dedup_preview.sh` (LF-regeleinden):
```bash
#!/bin/bash
# Read-only: preview of the proposed client folders for the slice-4 backfill
# (one folder per distinct user + normalized taxpayer name). Review the
# name_variants column for typo splits like "Acme BV" vs "Acme B.V.";
# variants are NEVER auto-merged.
docker exec $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -c \
  "SELECT user_id,
          lower(trim(taxpayer_name)) AS normalized,
          array_agg(DISTINCT taxpayer_name) AS name_variants,
          count(*) AS sessions,
          array_agg(fiscal_year ORDER BY fiscal_year) AS years
   FROM atad2_sessions
   GROUP BY user_id, lower(trim(taxpayer_name))
   ORDER BY user_id, normalized;"
```

- [ ] **Step 3: Commit de scripts**

```bash
git add scripts/verify_revenue_columns.sh scripts/client_dedup_preview.sh
git commit -m "chore(vm): read-only checks for revenue columns and client dedup preview"
```

- [ ] **Step 4: Draai de revenue-controle (PIM nodig)**

PowerShell:
```powershell
& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
  --resource-group rg-atad2-prod --name adn-x-s-5 `
  --command-id RunShellScript --scripts "@scripts/verify_revenue_columns.sh" `
  --query "value[0].message" -o tsv
```
Expected: de vier kolomnamen (`revenue_eur`, `revenue_updated_at`,
`revenue_updated_by`, `sold`). Bij minder dan vier: meld aan Lennart dat de
revenue-migratie op de VM nog niet (volledig) is toegepast; NIET zelf toepassen
(die deploy hoort bij de appendix-tak-werkstroom). Bij `AuthorizationFailed`:
PIM opnieuw activeren en hetzelfde commando herhalen.

- [ ] **Step 5: Draai de dedup-preview (zelfde PIM-venster)**

PowerShell:
```powershell
& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
  --resource-group rg-atad2-prod --name adn-x-s-5 `
  --command-id RunShellScript --scripts "@scripts/client_dedup_preview.sh" `
  --query "value[0].message" -o tsv
```
Expected: een tabel met per rij user_id, genormaliseerde naam, naamvarianten,
aantal sessies en jaren. Leg de volledige output aan Lennart voor; zijn akkoord
op deze lijst is de voorwaarde voor de backfill in plak 4. Let op rijen waar
`name_variants` meer dan één variant bevat.

---

## Definition of done

- [ ] Memo genereren verwijdert geen documenten meer (Task 1) op BEIDE takken (Task 2).
- [ ] Dashboard draait op 3 queries in plaats van 1+2N, identieke kaartinhoud (Tasks 3-4).
- [ ] `sectionDependencies.ts` bestaat met groene tests (Task 5).
- [ ] Beide VM-controles gedraaid; revenue-kolommen bevestigd of gemeld; dedup-lijst bij Lennart ter review (Task 6).
- [ ] `npm test` en `npm run build` groen op feat/client-platform.
- [ ] Niets gepusht.
