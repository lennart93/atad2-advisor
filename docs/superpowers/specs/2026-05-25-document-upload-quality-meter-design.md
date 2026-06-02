# Document upload — quality-meter ("password strength" voor documenten)

**Datum:** 2026-05-25
**Probleem:** De huidige document-upload stap zegt alleen "Optional. Documents are processed only for pre-fill extraction". Niets vertelt de gebruiker dat goede pre-fill staat of valt met goede inputdocumenten. Iedereen klikt door zonder uploads, of upload één random bestand. Resultaat: pre-fill is onnauwkeurig en de gebruiker snapt niet waarom.

We willen dat de gebruiker — net als bij een wachtwoord-sterktemeter — real-time, visueel, en zonder na te denken aanvoelt dat meer/diverser uploads tot een beter rapport leiden.

## Doel

1. Real-time strength-meter (Empty / Good / Strong / Excellent) in de footer van de upload-stap.
2. Eerste upload voelt direct als een win — geen "Fair"-tier die tegenvalt.
3. AI categoriseert elke upload automatisch (snel, zichtbaar, overrulebaar).
4. AI vlagt "thin" docs (lege scans, dekbladen) zodat ze de score niet ophogen.
5. Bij doorklikken met lage score: vriendelijke dialog die wijst op wat ontbreekt, géén harde blokkade.

## Tier-mapping

| Tier | Segmenten | Wanneer | Voorbeeld-copy in footer |
|---|---|---|---|
| Empty | 0 / 4 | Geen documenten | "Add a document to start" |
| Good | 2 / 4 | 1 relevant document (welke categorie dan ook) | "Good start — add another type for more context" |
| Strong | 3 / 4 | 2 verschillende relevante categorieën | "Strong — one more type would round it out" |
| Excellent | 4 / 4 | 3 of meer verschillende categorieën | "Excellent — comprehensive set" |

**Telregel:** distinct categorieën. Vijf jaarrekeningen = 1 categorie = Good. Bewust gekozen om "spam-uploaden" niet te belonen.

**Wat geldt als "relevant":** alles behalve `other`, en niet gevlagd als `is_thin`. Concrete categorieën:

- `financial_statements`
- `tax_returns`
- `previous_year_atad2_analysis`
- `structure_chart` *(nieuw)*
- `client_correspondence` *(nieuw)*
- `master_file`, `local_file`
- `trial_balance`, `general_ledger`
- `memo`, `comment_letter_to_tax_return`

`other` telt mee als "geüpload" maar niet als categorie — anders kan iemand 5 ongelabelde PDFs droppen en Excellent halen.

## Visuele stijl

Variant A uit de mockup: vier segmenten + pill-label in sticky footer, naast de "Run pre-fill"-knop. Bij Empty: alle segmenten grijs, geen pill, alleen hint-tekst "Add a document to start". Vanaf Good lichten de segmenten op, kleur volgt de tier (amber/Good → groen-amber/Strong → groen/Excellent).

Plek: alleen op de DocumentUploadStep — andere assessment-stappen blijven ongewijzigd.

## Datamodel

**Uitbreiden `DOCUMENT_CATEGORIES` in [src/lib/prefill/types.ts](src/lib/prefill/types.ts):**

```ts
{ value: "structure_chart", label: "Structure chart" },
{ value: "client_correspondence", label: "Client correspondence" },
```

**Migratie op `atad2_session_documents`:**

```sql
ALTER TABLE atad2_session_documents
  ADD COLUMN is_thin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN category_source TEXT NOT NULL DEFAULT 'filename'
    CHECK (category_source IN ('filename', 'ai', 'user'));
```

- `is_thin`: gezet door classify-call. True voor docs < ±200 woorden of images zonder OCR-resultaat.
- `category_source`: bepaalt of de UI "(suggested)" badge laat zien en of een latere AI-call de categorie nog mag overschrijven (`user` is permanent).

## Filename-heuristiek (client-side, sync)

Nieuwe pure module `src/lib/prefill/categorize.ts`. Geen AI-call. Tabel van regex → categorie:

| Patroon (case-insensitive) | Categorie |
|---|---|
| `jaarrekening`, `annual.report`, `financial.statement` | `financial_statements` |
| `aangifte`, `vpb`, `corporate.tax`, `tax.return` | `tax_returns` |
| `structure`, `organogram`, `org.chart`, `holding.chart` | `structure_chart` |
| `atad2?.*(analyse|analysis|memo)`, `previous.year.atad` | `previous_year_atad2_analysis` |
| `master.file` | `master_file` |
| `local.file` | `local_file` |
| `trial.balance`, `kolommenbalans` | `trial_balance` |
| `general.ledger`, `grootboek` | `general_ledger` |
| `memo`, `memorandum` | `memo` |
| `comment.letter` | `comment_letter_to_tax_return` |
| `email`, `correspondence`, `correspondentie`, `.eml$`, `.msg$` | `client_correspondence` |
| (geen match) | `other` |

Eerste match wint. Heuristiek draait synchroon bij upload — meter tikt direct.

## Quality-module (`src/lib/prefill/qualityMeter.ts`)

Pure function:

```ts
type Tier = 'empty' | 'good' | 'strong' | 'excellent';

export function computeQuality(docs: SessionDocument[]): {
  tier: Tier;
  segments: 0 | 2 | 3 | 4;
  distinctCategories: DocumentCategory[];
  hint: string;
  missingTypes: DocumentCategory[];
} {
  const qualifying = docs.filter(d => d.category !== 'other' && !d.is_thin);
  const categories = [...new Set(qualifying.map(d => d.category))];

  if (categories.length === 0) return { tier: 'empty',     segments: 0, ... };
  if (categories.length === 1) return { tier: 'good',      segments: 2, ... };
  if (categories.length === 2) return { tier: 'strong',    segments: 3, ... };
  return                              { tier: 'excellent', segments: 4, ... };
}
```

`hint` past zich aan op wat al ligt: heeft user `financial_statements`, wijs op `tax_returns` of `structure_chart` als next-best step.

`missingTypes` wordt gebruikt door de soft-gate dialog om gepersonaliseerde copy te genereren.

## Edge Function: `classify-document`

Nieuwe Supabase Edge Function. Path: `supabase/functions/classify-document/index.ts`.

**Input:** `{ document_id: string }`

**Stappen:**
1. Lees `atad2_session_documents` row (storage_path, mime_type, filename).
2. Skip als `category_source === 'user'` (gebruiker heeft override gedaan — niet aankomen).
3. Download eerste ±2 KB uit storage. Voor PDF: extract eerste pagina tekst. Voor image: kort OCR-resultaat als beschikbaar, anders `is_thin = true` en exit.
4. Word count → `is_thin = words < 200`.
5. Stuur tekst + filename naar Haiku met strakke JSON-prompt:
   ```
   Return: { "category": "<one of: financial_statements|tax_returns|...>", "confidence": 0..1 }
   ```
6. Bij `confidence >= 0.5`: update row met `{ category, is_thin, category_source: 'ai' }`.
7. Bij `confidence < 0.5`: laat `category` staan (heuristiek-resultaat blijft), zet alleen `{ is_thin, category_source: 'ai' }`.
8. Bij fout: silent fail, geen update — meter werkt door met heuristiek-categorie.

Model: snelste beschikbare (Haiku 4.5). Max input ~500 tokens. Geen retries — als 'ie faalt blijft heuristiek de waarheid.

## Frontend-componenten

| Bestand | Status | Verantwoordelijkheid |
|---|---|---|
| `src/lib/prefill/categorize.ts` | nieuw | Filename-heuristiek (zie boven) |
| `src/lib/prefill/qualityMeter.ts` | nieuw | `computeQuality()` (zie boven) |
| `src/components/prefill/DocumentQualityMeter.tsx` | nieuw | Segmented bar + pill + hint. Props: `docs: SessionDocument[]`. Roept `computeQuality` aan. |
| `src/components/prefill/LowQualityGateDialog.tsx` | nieuw | Soft-gate dialog met adaptieve copy op `missingTypes` |
| `src/components/prefill/CategoryDropdown.tsx` | nieuw | Per-file dropdown met "(suggested)" badge bij `category_source !== 'user'`. Op wijziging: PATCH row met `category_source: 'user'`. |
| [src/components/prefill/DocumentUploader.tsx](src/components/prefill/DocumentUploader.tsx) | modify | (a) heuristiek toepassen bij upload-time, (b) classify-call triggeren parallel per file, (c) `CategoryDropdown` per file renderen |
| [src/components/assessment/AssessmentFooterSlot.tsx](src/components/assessment/AssessmentFooterSlot.tsx) | modify | Op DocumentUploadStep: `DocumentQualityMeter` links + Next/Run pre-fill rechts. Andere stappen: ongewijzigd. |
| [src/hooks/usePrefill.ts](src/hooks/usePrefill.ts) | modify | `useUploadDocument` voegt heuristiek-categorie + `category_source: 'filename'` toe bij insert. Nieuwe `useClassifyDocument` mutation triggert de edge function. |

## Data-flow van één file-drop

```
1. User dropt file in DocumentUploader
2. Storage-upload (bestaand)
3. Filename-heuristiek bepaalt category client-side
4. Row insert: { category, category_source: 'filename', is_thin: false }
5. Meter recomputed → tikt direct op
6. classify-document call fires (parallel met andere files)
7. Row updated met { category, is_thin, category_source: 'ai' }
8. useSessionDocuments invalideert → meter recomputed
9. User kan in dropdown override → row update { category: gekozen, category_source: 'user' }
10. Latere classify-calls overslaan deze row (zie edge function stap 2)
```

## Soft-gate dialog

Trigger: user klikt "Run pre-fill" terwijl tier ∈ {`empty`, `good`}. Bij `strong` en `excellent`: direct door.

**Empty-copy:**
> ### Run pre-fill without documents?
> Pre-fill works best when there's something to ground it in. Without documents, suggestions will be based purely on the answers you've already given.
>
> `[ Cancel — add documents ]`   `[ Continue without ]`

**Good-copy** (adaptief op wat er ligt):
> ### Solid start — want to add more?
> You've added **{category-label}**. The pre-fill will work, but tends to be much sharper with at least one more type — {suggest 2 missing essentials based on `missingTypes`}.
>
> `[ Add more documents ]`   `[ Run pre-fill anyway ]`

**Edge case — alles `is_thin`:** behandel als Empty.

**Edge case — alles `other`:** dialog-copy wisselt naar "You have N documents but categories aren't set yet. Set them to help the pre-fill, or proceed anyway."

**Dismissal-gedrag:** dialog onthoudt zijn `dismissed`-state op session-niveau (sessionStorage). Niet opnieuw tonen totdat er een nieuwe upload bijkomt of een categorie wijzigt — anders wordt 'ie nag-ware.

## Snelheid (harde eis)

- Heuristiek = sync, microseconden, niet wachten op AI.
- Classify-call: aparte snelle Edge Function (níet aan summarize hangen — die is traag).
- Haiku, max ~500 tokens input, geen tools.
- Parallel: meerdere uploads = meerdere classify-calls tegelijk.
- Geen blocking spinner — meter update optimistisch op heuristiek, classify wijzigt het later silent.

Doel: van file-drop tot tier-update onder 1 seconde. Classify-precisie kan rustig 2–4 seconden later komen.

## Out of scope (deze iteratie)

- Meter op dashboard / session-list / SessionCard.
- Retroactief categoriseren van bestaande documenten.
- Wijzigingen aan de bestaande `summarizing` → `summarized` flow.
- Per-engagement quality-aggregaten of reporting.

## Testdekking

- Unit: `categorize.ts` — heuristiek-tabel, edge cases (no match, multiple matches → eerste wint).
- Unit: `qualityMeter.ts` — alle vier tier-overgangen, thin-filter, other-filter, lege docs-array.
- Component: `DocumentQualityMeter` — render per tier (snapshots), correcte hint-copy.
- Component: `LowQualityGateDialog` — copy past zich aan op `missingTypes`, dismissal-flow.
- Edge function: integratie-test met fixture-docs (1 normaal, 1 thin, 1 met low-confidence).
- Geen nieuwe E2E nodig — bestaande prefill-tests dekken upload-flow.

## Open vraagje voor implementatie-fase

Standaard: dialog triggert bij Empty én Good. Configureerbaar achter één boolean zodat we 'm makkelijk kunnen terugbrengen tot alleen Empty als feedback laat zien dat Good-dialog te veel onderbreekt.
