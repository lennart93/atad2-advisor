# Document Pre-Fill — UX iteratie 2 (design)

**Date:** 2026-04-24
**Author:** Lennart Wilming (with Claude)
**Status:** Approved design, ready for implementation plan
**Scope:** Vier polish-fixes op de werkende pre-fill flow.

## Context

De Document Pre-Fill feature werkt end-to-end (Stage 1 + Stage 2 voltooien, suggesties komen in de UI). Bij user testing zijn vier concrete pijnpunten gevonden:

1. **"Don't show again" preference is per-device (localStorage)**, niet per-account. Inloggen op een andere machine = modal opnieuw zien. Account-bound is logisch en correct.
2. **Twee checkbox-blokken op session-info (`tax year does not equal calendar year` + `I want to upload supporting documents`) matchen niet visueel** — verschillende styling, verschillende heights, uitleg-tekst direct zichtbaar wat het scherm rommelig maakt.
3. **Bug op DocumentUploader Select**: zodra een categorie wordt gekozen flipt het bestand naar `status = "uploading"` en wordt de Select gedisabled. Gebruiker kan de categorie niet meer wijzigen, ook niet ná succesvolle upload.
4. **`summarize` blijft soms een 500 returnen.** Zonder VM/Edge Function logs (Azure auth tijdelijk geweigerd) is de root cause niet te bevestigen — punt 3 is een waarschijnlijke oorzaak (race waarbij upload twee keer triggert), wall-clock blijft de andere kandidaat.

## Goals

- Account-bound dismiss van Before-You-Start
- Visuele eenheid + cleane uitleg via Info-icon Tooltip op de twee checkbox-blokken
- Categorie blijft wijzigbaar tot de extraction job actief is gestart (ook ná upload)
- Diagnostisch verbeterde upload-flow: client-side log per upload-stap zodat de volgende 500 instant traceerbaar is
- Geen pipeline-architectuur veranderingen — de werkende Edge Function logica blijft staan

## Non-goals

- Geen wall-clock workaround, geen async-job pattern (uit eerdere iteratie geconcludeerd: niet nodig zolang docs binnen budget passen)
- Geen UI redesign verder dan deze 4 punten
- Geen migratie van bestaande sessions data

---

## Aanpak

### 1. Profile-bound dismiss preference

**Datamodel:**
```sql
ALTER TABLE profiles
  ADD COLUMN before_you_start_dismissed boolean NOT NULL DEFAULT false;
```

Migratie file: `supabase/migrations/20260424180000_add_before_you_start_dismissed.sql`. Toepassen via Studio SQL editor (consistent met eerdere migraties).

**Frontend:**

Nieuwe hook `src/hooks/useUserPreference.ts`:
```ts
export function useUserPreference() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    enabled: !!user?.id,
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("before_you_start_dismissed")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ before_you_start_dismissed: true })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });

  return {
    dismissed: !!profile.data?.before_you_start_dismissed,
    isLoading: profile.isLoading,
    dismiss: dismiss.mutateAsync,
  };
}
```

[Assessment.tsx](src/pages/Assessment.tsx) wijzigingen:

- Verwijder `BEFORE_YOU_START_DISMISSED_KEY` constant en bijbehorende `localStorage` checks.
- Importeer `useUserPreference`.
- In `validateAndShowWarning`: vervang `localStorage.getItem(...)` check door `if (pref.dismissed) { startSession(); return; }`.
- In de modal confirm-handler: vervang `localStorage.setItem(...)` door `if (dontShowBeforeYouStartAgain) await pref.dismiss();`.

### 2. Visueel matchende checkbox-blokken

**Nieuwe component:** `src/components/prefill/OptionToggle.tsx`
```tsx
interface Props {
  id: string;
  label: string;
  description: string;        // tooltip content
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}
```

Layout (high-level):
```
<Card className="p-4 min-h-[72px] flex items-start gap-3">
  <Checkbox id={id} checked={checked} onCheckedChange={...} />
  <div className="flex-1">
    <label htmlFor={id} className="text-sm font-medium">
      {label}
    </label>
  </div>
  <Tooltip>
    <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
    <TooltipContent className="max-w-xs">{description}</TooltipContent>
  </Tooltip>
</Card>
```

[Assessment.tsx](src/pages/Assessment.tsx) wijzigingen:

- Locate de bestaande "tax year does not equal calendar year" checkbox (rond regel ~1530-1570 in de sessie-info kaart).
- Vervang die markup door `<OptionToggle id="tax_year_not_equals_calendar" label="The tax year does not equal the calendar year" description="..." checked={...} onCheckedChange={...} />`.
- De net-toegevoegde "wants_documents" checkbox (rond ~1650) ook vervangen door `<OptionToggle ... />`.
- Wrap de twee toggles in `<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">` zodat ze side-by-side staan op desktop, gestackt op mobile.

### 3. Category Select altijd wijzigbaar

[DocumentUploader.tsx](src/components/prefill/DocumentUploader.tsx) wijzigingen:

**Voor pending files (Zustand store):**
```tsx
<Select
  value={p.category ?? undefined}
  onValueChange={(v) => {
    const cat = v as DocumentCategory;
    store.setCategory(p.localId, cat);
    if (p.status === "queued") kickUpload({ ...p, category: cat });
    // For uploaded pending files, also push the change to DB:
    if (p.status === "uploaded" && p.remoteDocumentId) {
      updateCategory.mutate({ docId: p.remoteDocumentId, category: cat });
    }
  }}
  disabled={locked}   // <-- alleen locked, geen status-checks meer
>
```

**Voor remote-only docs (pasted text — al separately gerendeerd in DocumentUploader):**
- Vervang de read-only category badge door dezelfde `<Select>` patroon
- Disabled bij `locked`
- onChange triggert `updateCategory.mutate({ docId: d.id, category: cat })`

**Nieuwe mutation in [usePrefill.ts](src/hooks/usePrefill.ts):**
```ts
export function useUpdateDocumentCategory(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}
```

Geen re-summarize triggered — de Stage 1 fact extraction is content-based, category is alleen een prompt-hint die niet kritisch was.

### 4. 500 error diagnostics

Zonder Azure access kunnen we nu geen logs lezen. Aanpak in twee delen:

**a) Client-side stap-logging** in [usePrefill.ts](src/hooks/usePrefill.ts):

In `useUploadDocument` en `useUploadText`, log elke async stap:
```ts
console.log("[upload] step: storage upload", { docId, size: blob.size, mime: blob.type });
// after storage success
console.log("[upload] step: db insert", { docId });
// after db success
console.log("[upload] step: invoke summarize", { docId });
```

Failure paths verbeteren: catch errors per stap met context:
```ts
} catch (err) {
  console.error("[upload] step failed", { step, docId, err });
  throw err;
}
```

Dit geeft de gebruiker en mij in DevTools direct zicht op WAAR het misgaat zonder server-logs.

**b) Verificatie zodra Azure auth ververst:** `az login` opnieuw, dan `az vm run-command invoke ... 'docker logs --since 5m supabase-edge-functions'`. Verwachte gevallen:

| Patroon in logs | Diagnose | Fix |
|---|---|---|
| `wall clock duration reached` | Zelfde wall-clock issue | Bekend, prompt is al concise. Mogelijk PDF te groot — overweeg client-side text size check vóór upload |
| `stage1_failed: <iets nieuws>` | Anthropic / SDK kant | Specifieke fix |
| Geen errors, gewone success | Was race condition opgelost door fix #3 | Geen verdere actie |

### Files te wijzigen

Nieuw:
- `supabase/migrations/20260424180000_add_before_you_start_dismissed.sql`
- `src/components/prefill/OptionToggle.tsx`
- `src/hooks/useUserPreference.ts`

Te wijzigen:
- `src/pages/Assessment.tsx` — preference hook, checkbox markup vervangen, grid-layout voor toggles
- `src/components/prefill/DocumentUploader.tsx` — Select disable rule + category change voor remote docs
- `src/hooks/usePrefill.ts` — `useUpdateDocumentCategory` mutation + diagnostiek-logging in `useUploadDocument`/`useUploadText`

Database:
- Apply migratie via Studio SQL editor

---

## Verificatie

1. **Account-bound dismiss:**
   - Start nieuwe assessment, vink "Don't show again", confirm
   - In Studio: `SELECT before_you_start_dismissed FROM profiles WHERE user_id = ...` → `true`
   - Refresh app, nieuwe assessment → modal komt niet
   - Login op andere device (of incognito + zelfde account) → modal komt ook niet (bevestigt account-bound)

2. **Visuele match:**
   - Open session-info scherm
   - Beide checkbox-blokken zien er identiek uit qua hoogte, padding, border
   - Hover op info-icon → tooltip met uitleg verschijnt
   - Description-tekst staat niet meer inline

3. **Category Select:**
   - Upload een file, kies categorie "Local File" — upload start
   - Tijdens upload: Select moet wijzigbaar blijven (klik open dropdown, andere optie kiezen werkt)
   - Na "Uploaded" status: Select nog steeds enabled, change → verifiëren dat `atad2_session_documents.category` is bijgewerkt in DB
   - Klik "Start extraction" → Select wordt nu disabled (`locked`)

4. **500 diagnostics:**
   - Herhaal upload-flow uit eerdere fout
   - Bij eventueel 500: DevTools console toont `[upload] step failed { step: 'storage_upload' | 'db_insert' | 'invoke_summarize', err: ... }` — exact welke stap faalde

---

## Spec-zelfreview

- Geen TBD/TODO placeholders
- Internally consistent: `useUserPreference` hook gebruikt op beide check-points (mount + modal confirm)
- Scope: 4 onafhankelijke fixes op één feature, past in één implementatie-plan
- Ambiguïteit gecheckt: "categorie wijzigen na upload" expliciet → metadata-only update, geen re-summarize
