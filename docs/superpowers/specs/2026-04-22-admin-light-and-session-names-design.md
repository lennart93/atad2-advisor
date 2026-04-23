# Admin-light role + Session user names + Question explanation — Design Spec

**Datum:** 2026-04-22
**Auteur:** Lennart Wilming (via brainstorm met Claude)
**Status:** Goedgekeurd in brainstorm; wacht op review

## 1. Goal

Drie kleine verbeteringen aan de admin-suite:

1. **Admin-light rol (`moderator`)** — een read-only variant van admin. Ziet alles, kan niks aanpassen. Bij elke poging tot wijzigen verschijnt een modal met "Admin access required — please contact the admin in person".
2. **User-naam op Sessions lijst** — toon de naam van de consultant die de sessie heeft aangemaakt, naast taxpayer + entity.
3. **`question_explanation` veld in admin** — staat in DB maar wordt niet getoond/bewerkt in het admin-panel; toevoegen.

## 2. Scope

**In scope:**
- Nieuwe `has_admin_access()` DB-functie + aangepaste SELECT-policies
- Hergebruik bestaand `moderator` waarde uit `app_role` enum — geen enum-migratie
- `useAdminAccess` hook vervangt `useIsAdmin`
- `AdminRoute` laat admin én moderator door
- Alle admin-pagina's consumeren `canEdit` om mutation-UI te gaten
- Disabled buttons + "Admin access required" modal
- `question_explanation` toevoegen aan QuestionEditorPanel form + preview
- Sessions list/detail: user-owner join + rendering
- Users page: rol-select dropdown (User/Moderator/Admin) per rij

**Out of scope:**
- Nieuwe rollen naast admin/moderator
- Granulaire permissies per entiteit
- Email-notificatie, access-request workflow, of aparte `role_requests` tabel
- Audit logging specifiek voor rol-wijzigingen (bestaande `user_roles` audit-trail blijft gelden)

## 3. Database changes

Eén nieuwe migratie: `supabase/migrations/YYYYMMDD_admin_light_access.sql`.

### 3.1 Helper function

```sql
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'moderator')
  );
$$;
```

### 3.2 Policy updates (SELECT only → admin OR moderator)

Op de volgende tabellen: drop de bestaande admin-only SELECT policy en vervang door een `staff-kan-lezen` policy via `has_admin_access()`:

- `public.user_roles` (SELECT: "Staff can view all roles")
- `public.audit_logs` (SELECT)
- `public.profiles` (SELECT voor admin-zicht op alle profielen)
- `public.atad2_sessions` (indien admin-only SELECT bestaat)
- `public.atad2_answers` (indien admin-only SELECT bestaat)
- `public.atad2_questions` (SELECT blijft publiek lijkt me — niet raken)
- `public.atad2_context_questions` (SELECT blijft publiek — niet raken)
- `public.atad2_reports` (indien admin-only SELECT bestaat)

Tijdens implementatie eerst `SELECT polname, tablename, cmd FROM pg_policies WHERE polname ILIKE '%admin%'` draaien om de exacte lijst en naamgeving te bevestigen. Bij elke admin-only SELECT: rename + switch naar `has_admin_access`.

### 3.3 Unchanged (stay admin-only)

- `can_modify_admin_role` trigger (voorkomt laatste-admin-weghalen)
- Alle INSERT/UPDATE/DELETE policies op alle tabellen

**Effect:** een moderator kan lezen wat de app toont maar een directe `.insert()/.update()/.delete()` call geeft RLS-permission-denied.

## 4. Frontend — access control

### 4.1 Nieuwe hook `useAdminAccess`

Locatie: `src/hooks/useAdminAccess.ts`. Vervangt `useIsAdmin` (oude hook wordt verwijderd; alle call-sites updaten).

```ts
export interface AdminAccess {
  isAdmin: boolean;       // has 'admin' row in user_roles
  isModerator: boolean;   // has 'moderator' row
  hasAccess: boolean;     // isAdmin || isModerator → toegang tot /admin
  canEdit: boolean;       // === isAdmin
  isLoading: boolean;
}
```

Implementatie: één `useQuery` die `SELECT role FROM user_roles WHERE user_id = auth.uid()` doet en de flags afleidt. Staletime 60s.

### 4.2 `AdminRoute`

Verandert zodat `hasAccess` (admin OR moderator) doorgang krijgt tot `/admin/*`.

### 4.3 Admin sidebar link in hoofdapp

`AppLayout.tsx` toont de "Admin" knop als `hasAccess` true is (zowel admin als moderator zien de knop). Tekst blijft gewoon "Admin".

### 4.4 "Admin access required" modal

Gedeelde component `src/components/admin/AccessRequiredDialog.tsx`:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>Admin access required</DialogTitle>
      <DialogDescription>
        To {actionLabel} you need full admin access. Please contact the admin in person.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button onClick={() => onOpenChange(false)}>Close</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Props: `open`, `onOpenChange`, `actionLabel` (bv. `"save changes"`, `"delete this session"`, `"grant roles"`).

### 4.5 Gating pattern

Waar nu een mutation-knop staat:

```tsx
// Oud
<Button onClick={doThing}>Save</Button>

// Nieuw
const { canEdit } = useAdminAccess();
const [accessDialog, setAccessDialog] = useState(false);

<Button
  onClick={canEdit ? doThing : () => setAccessDialog(true)}
  className={!canEdit ? "opacity-60" : ""}
>
  Save
</Button>
<AccessRequiredDialog open={accessDialog} onOpenChange={setAccessDialog} actionLabel="save changes" />
```

**Waarom niet `disabled`?** Een disabled button reageert niet op clicks, dus de modal zou niet openen. We maken 'm dus visueel gedimd (`opacity-60` + `cursor-help`) maar klikbaar, zodat moderator een duidelijke melding krijgt. Admins zien een normale knop.

Voor `Input`/`Textarea`/`select` in editor-panelen: wél échte `readOnly`/`disabled` property, omdat typen zonder feedback niet werkt.

### 4.6 Call-sites (alle gating plekken)

| Pagina | Gekapseld als moderator |
|---|---|
| `Users.tsx` | Role-select dropdown → opent modal i.p.v. muteren |
| `Questions.tsx` | "+ New question" button → modal. Rij-klik werkt wel (panel opent read-only) |
| `ContextQuestions.tsx` | Idem |
| `QuestionEditorPanel` | Alle `Input/Textarea/select` → `readOnly`/`disabled`. "Delete" button weg. "Save" button → modal. Footer wordt `[Close]` i.p.v. `[Cancel, Save]` |
| `ContextQuestionEditorPanel` | Idem |
| `SessionDetail.tsx` | "Delete session" button → modal |
| Hub / Analytics / Data Explorer / AuditLogs | Geen mutation-UI, niks te doen |

## 5. Users page — rol-select dropdown

Vervang de huidige "Grant/Revoke" AlertDialog door een inline `Select` per rij:

```
[avatar] Lennart Wilming    lennart.wilming@svalneratlas.com   [Admin ▾]
[avatar] Martin Bogdanovski martin.bogdanovski@...              [User ▾]
[avatar] Co van Oostveen    co.vanoostveen@...                  [Moderator ▾]
```

**Waarden van de Select:** `User` (geen rol) · `Moderator` · `Admin`.

**onChange logic** (hook `useUpdateUserRole` in `src/components/admin/useAdminUsers.ts`):
1. `DELETE FROM user_roles WHERE user_id = $user`
2. Als nieuwe rol ≠ `user`: `INSERT (user_id, role)`
3. Toast "Role updated" / error handling via bestaande `can_modify_admin_role`-constraint

**Bevestigingsdialog** voor security-gevoelige transities:
- naar `Admin`: "Grant admin rights to {email}?"
- weg van `Admin`: "Revoke admin rights from {email}?"

Toekenning/intrekking van `Moderator` gebeurt direct zonder confirm (lagere impact).

**Voor moderator**: de hele Select-component is gedisabled (gedimd, klik → AccessRequiredDialog met `actionLabel="change user roles"`).

## 6. Sessions — user-owner naam

### 6.1 Hook update

`useAdminSessionsList` in `src/components/admin/useAdminSessions.ts`:

```ts
const { data, error } = await supabase
  .from("atad2_sessions")
  .select(`
    id, session_id, user_id, taxpayer_name, entity_name, fiscal_year, status,
    final_score, completed, confirmed_at, created_at, updated_at,
    owner:profiles!user_id(full_name, email)
  `)
  .order("created_at", { ascending: false })
  .limit(1000);
```

`AdminSessionRow` type uitgebreid met:
```ts
owner: { full_name: string | null; email: string } | null;
```

**N.B.** de foreign-key relatie tussen `atad2_sessions.user_id` en `profiles.user_id` moet bestaan voor deze implicit join. Zo niet: tijdens implementatie expliciet `.select(...)` met separate query of FK toevoegen in migratie.

### 6.2 SessionRow render

Huidige meta-regel:
```
atad2_abc123 · FY 2025
```

Nieuw:
```
atad2_abc123 · FY 2025 · Lennart Wilming
```

Code: `{session.session_id} · FY {session.fiscal_year}{session.owner ? ` · ${session.owner.full_name ?? session.owner.email}` : ""}`. Als `owner` null is, niks renderen (geen "Unknown").

### 6.3 SessionDetail header

`useAdminSession` hook ook updaten met de `owner` join. In de header-kaart de `InfoCell`-grid van 4 naar 5 kolommen (of wrap op kleine schermen): **Fiscal year · Period · Owner · Created · Confirmed**.

## 7. Question explanation in admin panel

### 7.1 Type + hook

`AdminQuestion` interface in `useAdminQuestions.ts` krijgt extra veld:
```ts
question_explanation: string | null;
```

(staat al in DB; alleen toevoegen aan select-query en type.)

### 7.2 Editor panel

`QuestionEditorPanel.tsx`:

- Zod schema: `question_explanation: z.string().nullable().optional()`
- Default value: `question?.question_explanation ?? ""`
- Nieuw `<FormField>` tussen "Question" en "Difficult term", label **"Explanation"**, `<Textarea rows={3}>`, placeholder `"Optional guidance shown to users"`

### 7.3 Preview

In de bestaande preview-box (onder de form) toegevoegd: onder de vraag-tekst, als `watchedExplanation` niet leeg is, een kleine gedimde regel:

```tsx
{watchedExplanation && (
  <div className="text-[11px] text-muted-foreground italic mt-2">
    {watchedExplanation}
  </div>
)}
```

## 8. Migration order

1. DB-migratie draaien (`has_admin_access` + policy updates)
2. Nieuwe `useAdminAccess` hook aanmaken
3. `useIsAdmin` verwijderen; alle imports → `useAdminAccess`
4. `AdminRoute` op `hasAccess`
5. `AccessRequiredDialog` component maken
6. Gating toevoegen op: Users, Questions, ContextQuestions, QuestionEditorPanel, ContextQuestionEditorPanel, SessionDetail
7. Users: rol-select dropdown + `useUpdateUserRole` hook
8. Sessions: owner-join + render op list + detail
9. Questions: `question_explanation` veld
10. Smoke-test als admin, als moderator (via test-user), als user (NotAuthorized)

## 9. Testplan

**Als admin (lennart.wilming@svalneratlas.com):**
- Alles werkt zoals nu; knoppen niet gedimd; formulieren bewerkbaar; rol-select in Users werkt
- Verander eigen rol per ongeluk naar Moderator via direct SQL: zou nog steeds `/admin` moeten kunnen openen (moderator-toegang), maar knoppen gaan dan dim

**Als moderator** (test-user krijgt `moderator` rol via SQL of via admin-grant):
- `/admin/*` opent normaal; Admin-link in hoofdapp zichtbaar
- Alle pagina's laden data; geen pagina geeft RLS-error
- Sessie-detail laadt; "Delete session" is gedimd; klik → modal "Admin access required"
- Question-rij klik → slide-in paneel opent; alle inputs zijn read-only; footer heeft alleen "Close"
- Users page: dropdowns zichtbaar maar gedimd; klik → modal
- DevTools: `supabase.from('atad2_questions').delete()...` geeft RLS-error

**Als gewone user (geen rol):**
- `/admin` → `NotAuthorized` (zoals nu)

## 10. Open risks

- **FK-relatie `atad2_sessions.user_id` ↔ `profiles.user_id`**: als die niet als foreign key in het schema staat, werkt de Supabase implicit join niet. Tijdens implementatie verifiëren; zo niet, òf FK toevoegen òf separate query.
- **`profiles` SELECT policy**: mogelijk mag een user nu alleen eigen profiel zien. Als we admin-view van alle user-namen willen, dan moet er een "Staff can view all profiles" policy komen. Tijdens implementatie checken.
- **`user_roles` update timing**: als een moderator wordt gepromoveerd tot admin, ziet de browser dat pas na staletime (60s) of na re-login. Acceptabel voor nu; als je live toggle wilt, invalidate-by-hand op het moment van de `useUpdateUserRole` success.
