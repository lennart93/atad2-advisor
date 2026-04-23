# Admin-light + Session names + Question explanation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rol-light gebruikers (moderator) geven read-only toegang tot de hele admin suite, tonen wie de eigenaar is van een sessie, en `question_explanation` ontsluiten in de admin-editor — volgens `docs/superpowers/specs/2026-04-22-admin-light-and-session-names-design.md`.

**Architecture:** Defense-in-depth: nieuwe `has_admin_access()` SQL-functie + SELECT RLS voor admin+moderator (mutations blijven admin-only); één centrale `useAdminAccess` React-hook die de UI gating stuurt; gedimde-maar-klikbare mutation-knoppen openen een gedeelde `AccessRequiredDialog` modal.

**Tech Stack:** PostgreSQL + Supabase RLS, React + TypeScript, TanStack Query, shadcn/ui Dialog, Supabase JS client.

**Testen:** Geen unit-test-framework aanwezig — elke taak eindigt met `npm run build` + `npm run lint` en manual verification in browser. Geen auto-commits; commit-stappen zijn optioneel en alleen op expliciet verzoek van Lennart.

---

## File Structure

### Nieuwe bestanden

```
supabase/migrations/
  20260422_admin_light_access.sql         - has_admin_access() + SELECT policies

src/hooks/
  useAdminAccess.ts                       - unified admin/moderator access hook

src/components/admin/
  AccessRequiredDialog.tsx                - "Admin access required" modal
  useAdminUsers.ts                        - role update mutation hook
```

### Te wijzigen bestanden

```
src/hooks/useIsAdmin.ts                    - verwijderen, vervangen door useAdminAccess
src/components/routing/AdminRoute.tsx      - gebruik hasAccess i.p.v. isAdmin
src/pages/AppLayout.tsx                    - gebruik hasAccess voor Admin-link
src/pages/admin/Users.tsx                  - role-select dropdown met gating
src/pages/admin/Questions.tsx              - + New question gating
src/pages/admin/ContextQuestions.tsx       - + New context question gating
src/pages/admin/SessionDetail.tsx          - Delete button gating + owner info cell
src/pages/admin/Sessions.tsx               - owner-naam op meta-regel
src/components/admin/QuestionEditorPanel.tsx   - question_explanation veld + gating
src/components/admin/ContextQuestionEditorPanel.tsx - gating
src/components/admin/useAdminSessions.ts   - owner join in SELECT
src/components/admin/useAdminQuestions.ts  - question_explanation in type + select
```

---

## Phase 0: Database migration

### Task 0.1: Inventariseer bestaande admin-only policies

**Files:** geen code; SQL query in Supabase Studio.

- [ ] **Step 1: Verbind met Supabase Studio**

Open `http://135.225.104.142:3000` → SQL Editor. Of gebruik `curl` met service-role key (zie `c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/secrets.txt`).

- [ ] **Step 2: List relevante policies**

```sql
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual ILIKE '%has_role%' OR policyname ILIKE '%admin%')
ORDER BY tablename, cmd;
```

Expected: een lijst per `tablename` + `cmd` (SELECT/INSERT/UPDATE/DELETE) waarvoor `has_role(auth.uid(), 'admin')` wordt gebruikt. Noteer welke tabellen een **SELECT**-policy hebben met admin-check — dat zijn de kandidaten voor uitbreiding naar moderator.

**Verwachte kandidaten** op basis van spec:
- `user_roles` — "Admins can view all roles"
- `audit_logs` — SELECT policy voor admins
- `profiles` — mogelijk admin-view policy
- `atad2_sessions`, `atad2_answers`, `atad2_reports` — bekijken of er admin-only SELECT policy is

- [ ] **Step 3: Noteer exact namen**

Schrijf per tabel de exacte `policyname` van elke admin-only SELECT policy op. Gebruik deze in Task 0.2 om ze te `DROP POLICY IF EXISTS` met de juiste naam. Als een tabel al publieke SELECT heeft (bv. `atad2_questions` is public-read), skip 'm.

---

### Task 0.2: Maak de migration file

**Files:**
- Create: `supabase/migrations/20260422_admin_light_access.sql`

- [ ] **Step 1: Schrijf de helper-functie**

Maak het bestand met:

```sql
-- Adds "admin-light" (moderator) read access to the admin suite.
-- Admin-only mutations remain unchanged.

-- 1) Helper: true if user has admin OR moderator role
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

- [ ] **Step 2: Policy updates — user_roles SELECT**

Append aan hetzelfde bestand:

```sql
-- 2) user_roles: let moderators read roles too
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_admin_access(auth.uid()));
```

- [ ] **Step 3: Policy updates — audit_logs**

Append (vervang `<ACTUAL_NAME>` door de naam uit Task 0.1 Step 3):

```sql
-- 3) audit_logs: moderators can read
DROP POLICY IF EXISTS "<ACTUAL_NAME>" ON public.audit_logs;
CREATE POLICY "Staff can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_admin_access(auth.uid()));
```

- [ ] **Step 4: Policy updates — profiles**

Als er een admin-only SELECT policy is op `profiles`, voeg toe:

```sql
-- 4) profiles: moderators can view all profiles (for session owner display + users page)
DROP POLICY IF EXISTS "<ACTUAL_NAME>" ON public.profiles;
CREATE POLICY "Staff can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR user_id = auth.uid()
);
```

De `OR user_id = auth.uid()` behoudt dat gewone users hun eigen profiel mogen zien — als de oude policy dat ook deed. Anders alleen `has_admin_access(...)`.

- [ ] **Step 5: Policy updates — atad2_sessions/answers/reports**

Voor elke tabel die een admin-only SELECT policy had (uit Task 0.1):

```sql
-- 5) atad2_sessions: moderators can read
DROP POLICY IF EXISTS "<ACTUAL_NAME>" ON public.atad2_sessions;
CREATE POLICY "Staff can view all sessions"
ON public.atad2_sessions
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR user_id = auth.uid()
);

-- 6) atad2_answers
DROP POLICY IF EXISTS "<ACTUAL_NAME>" ON public.atad2_answers;
CREATE POLICY "Staff can view all answers"
ON public.atad2_answers
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_answers.session_id AND s.user_id = auth.uid()
  )
);

-- 7) atad2_reports
DROP POLICY IF EXISTS "<ACTUAL_NAME>" ON public.atad2_reports;
CREATE POLICY "Staff can view all reports"
ON public.atad2_reports
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_reports.session_id AND s.user_id = auth.uid()
  )
);
```

Skip tabellen waarop al publieke SELECT staat (bv. `atad2_questions`).

- [ ] **Step 6: Verifieer lokaal syntactisch**

Als je `psql` lokaal hebt: `psql --set ON_ERROR_STOP=1 --dry-run` — niet strict nodig. Anders lees het bestand even door; check dat elke `DROP POLICY IF EXISTS` gevolgd wordt door een `CREATE POLICY`.

---

### Task 0.3: Migratie draaien

**Files:** geen code; SQL uitvoeren.

- [ ] **Step 1: Draai het statement in Studio**

In Supabase Studio SQL Editor: copy-paste de inhoud van `supabase/migrations/20260422_admin_light_access.sql` → Run.

Verwacht: elke `DROP POLICY IF EXISTS` werkt stil (ook als de policy niet bestond), elke `CREATE POLICY` slaagt. Als je een "policy already exists" error krijgt, dan heb je een DROP overgeslagen — voeg de juiste `policyname` toe.

- [ ] **Step 2: Sanity check — helper functie**

```sql
SELECT public.has_admin_access(
  (SELECT id FROM auth.users WHERE email = 'lennart.wilming@svalneratlas.com')
);
```

Verwacht: `true`.

Voor een niet-admin user:
```sql
SELECT public.has_admin_access(
  (SELECT id FROM auth.users WHERE email = 'martin.bogdanovski@svalneratlas.com')
);
```

Verwacht: `false` (of `true` als die toevallig al moderator/admin is).

- [ ] **Step 3: Sanity check — policies aanwezig**

```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND policyname ILIKE 'Staff can%'
ORDER BY tablename;
```

Verwacht: minstens `user_roles`, `audit_logs`, `profiles`. En alle tabellen waarvan Task 0.1 een admin-only SELECT toonde.

---

## Phase 1: useAdminAccess hook + routing

### Task 1.1: Nieuwe hook `useAdminAccess`

**Files:**
- Create: `src/hooks/useAdminAccess.ts`

- [ ] **Step 1: Schrijf de hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface AdminAccess {
  isAdmin: boolean;
  isModerator: boolean;
  hasAccess: boolean;
  canEdit: boolean;
  isLoading: boolean;
}

export function useAdminAccess(): AdminAccess {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-access", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return { isAdmin: false, isModerator: false };
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) return { isAdmin: false, isModerator: false };
      const roles = new Set((data ?? []).map((r) => r.role));
      return {
        isAdmin: roles.has("admin"),
        isModerator: roles.has("moderator"),
      };
    },
  });

  const isAdmin = Boolean(data?.isAdmin);
  const isModerator = Boolean(data?.isModerator);
  return {
    isAdmin,
    isModerator,
    hasAccess: isAdmin || isModerator,
    canEdit: isAdmin,
    isLoading: isLoading && !!user,
  };
}
```

- [ ] **Step 2: Verifieer compile**

Run: `npx tsc --noEmit`
Expected: geen errors.

---

### Task 1.2: `AdminRoute` → `hasAccess`

**Files:**
- Modify: `src/components/routing/AdminRoute.tsx`

- [ ] **Step 1: Vervang hele bestand**

```typescript
import { ReactNode } from "react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import NotAuthorized from "@/pages/NotAuthorized";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { hasAccess, isLoading } = useAdminAccess();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return <NotAuthorized />;
  }

  return <>{children}</>;
};

export default AdminRoute;
```

- [ ] **Step 2: Verifieer build**

Run: `npm run build`
Expected: build slaagt.

---

### Task 1.3: `AppLayout` + delete oude `useIsAdmin`

**Files:**
- Modify: `src/pages/AppLayout.tsx`
- Delete: `src/hooks/useIsAdmin.ts`

- [ ] **Step 1: Update AppLayout import + usage**

Open `src/pages/AppLayout.tsx`. Vervang:

```typescript
import { useIsAdmin } from "@/hooks/useIsAdmin";
```

door:

```typescript
import { useAdminAccess } from "@/hooks/useAdminAccess";
```

En vervang:

```typescript
const { data: isAdmin } = useIsAdmin();
```

door:

```typescript
const { hasAccess: isAdmin } = useAdminAccess();
```

(We behouden de variable-naam `isAdmin` lokaal zodat de conditional JSX niet hoeft te wijzigen — hij gedraagt zich als "heeft admin-suite toegang".)

- [ ] **Step 2: Verwijder oude hook-file**

```bash
rm src/hooks/useIsAdmin.ts
```

- [ ] **Step 3: Zoek naar resterende imports**

Run grep:
```bash
grep -rn "useIsAdmin" src/
```

Expected: geen resultaten. Anders: update die call-sites om `useAdminAccess` te gebruiken.

- [ ] **Step 4: Verifieer build**

Run: `npm run build && npm run lint`
Expected: slaagt zonder errors.

- [ ] **Step 5: Optioneel commit-checkpoint**

```bash
git add src/hooks/useAdminAccess.ts src/components/routing/AdminRoute.tsx src/pages/AppLayout.tsx
git rm src/hooks/useIsAdmin.ts
git commit -m "feat(admin): add useAdminAccess hook (admin + moderator)"
```

---

## Phase 2: AccessRequiredDialog component

### Task 2.1: Shared modal

**Files:**
- Create: `src/components/admin/AccessRequiredDialog.tsx`

- [ ] **Step 1: Schrijf component**

```typescript
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export interface AccessRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel?: string;
}

export function AccessRequiredDialog({
  open, onOpenChange, actionLabel = "perform this action",
}: AccessRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>Admin access required</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            To {actionLabel} you need full admin access. Please contact the admin in person.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verifieer build**

Run: `npm run build`
Expected: slaagt.

---

## Phase 3: Question explanation field

### Task 3.1: Extend AdminQuestion type + hook

**Files:**
- Modify: `src/components/admin/useAdminQuestions.ts`

- [ ] **Step 1: Voeg `question_explanation` toe aan interface**

Open `src/components/admin/useAdminQuestions.ts`. Zoek naar de `export interface AdminQuestion` en voeg toe tussen `term_explanation` en `created_at`:

```typescript
export interface AdminQuestion {
  id: string;
  question_id: string;
  question_title: string | null;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
  question_explanation: string | null;   // ← NEW
  created_at?: string;
}
```

De `.select("*")` in `useAdminQuestionsList` haalt automatisch ook dit veld op — geen query-wijziging nodig.

- [ ] **Step 2: Verifieer compile**

Run: `npx tsc --noEmit`
Expected: geen errors.

---

### Task 3.2: Edit panel — voeg veld toe

**Files:**
- Modify: `src/components/admin/QuestionEditorPanel.tsx`

- [ ] **Step 1: Update zod schema**

Open het bestand. In de `const Schema = z.object({...})` toevoegen:

```typescript
const Schema = z.object({
  question_id: z.string().min(1, "Required"),
  question_title: z.string().nullable().optional(),
  question: z.string().min(1, "Required"),
  answer_option: z.string().min(1, "Required"),
  risk_points: z.coerce.number().min(0).multipleOf(0.1).default(0),
  next_question_id: z.string().nullable().optional(),
  difficult_term: z.string().nullable().optional(),
  term_explanation: z.string().nullable().optional(),
  question_explanation: z.string().nullable().optional(),  // ← NEW
});
```

- [ ] **Step 2: Default value toevoegen**

In `useForm({ resolver: ..., defaultValues: {...} })`:

```typescript
    defaultValues: {
      question_id: question?.question_id ?? "",
      question_title: question?.question_title ?? "",
      question: question?.question ?? "",
      answer_option: question?.answer_option ?? "",
      risk_points: question?.risk_points ?? 0,
      next_question_id: question?.next_question_id ?? "",
      difficult_term: question?.difficult_term ?? "",
      term_explanation: question?.term_explanation ?? "",
      question_explanation: question?.question_explanation ?? "",  // ← NEW
    },
```

- [ ] **Step 3: Form field toevoegen**

Na het `question` veld (Textarea), vóór `answer_option`, voeg toe:

```tsx
          <FormField control={form.control} name="question_explanation" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Explanation
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  rows={3}
                  placeholder="Optional guidance shown to users during the assessment"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
```

- [ ] **Step 4: Preview toevoegen**

Zoek de preview-section (`<div className="rounded-lg bg-white shadow-sm p-4">`). Voeg een `watchedExplanation` variabele toe bovenaan het component (bij de andere `watched*`):

```typescript
  const watchedExplanation = form.watch("question_explanation");
```

En in de preview, na de `watchedQuestion` render maar vóór de answer options:

```tsx
              <div className="text-[12px] text-foreground mb-3">
                {watchedQuestion || <span className="text-muted-foreground italic">(empty)</span>}
              </div>
              {watchedExplanation && (
                <div className="text-[11px] text-muted-foreground italic mb-3 border-l-2 border-muted pl-2">
                  {watchedExplanation}
                </div>
              )}
```

- [ ] **Step 5: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

Handmatig: `npm run dev` → navigate naar `/admin/questions` → click vraag → zie "Explanation" textarea. Typ → preview toont italic tekst.

- [ ] **Step 6: Optioneel commit-checkpoint**

```bash
git add src/components/admin/useAdminQuestions.ts src/components/admin/QuestionEditorPanel.tsx
git commit -m "feat(admin): expose question_explanation in question editor"
```

---

## Phase 4: Sessions owner-naam

### Task 4.1: Session type + hook

**Files:**
- Modify: `src/components/admin/useAdminSessions.ts`

- [ ] **Step 1: Extend AdminSessionRow type**

Voeg `owner` toe aan de interface:

```typescript
export interface AdminSessionRow {
  id: string;
  session_id: string;
  user_id: string | null;
  taxpayer_name: string;
  entity_name: string | null;
  fiscal_year: string;
  status: string;
  final_score: number | null;
  completed: boolean | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  owner: { full_name: string | null; email: string } | null;   // ← NEW
}
```

- [ ] **Step 2: Update SELECT in useAdminSessionsList**

Vervang de huidige `.select(...)` van `useAdminSessionsList` door:

```typescript
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select(`
          id, session_id, user_id, taxpayer_name, entity_name, fiscal_year, status,
          final_score, completed, confirmed_at, created_at, updated_at,
          owner:profiles!user_id(full_name, email)
        `)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as AdminSessionRow[];
    },
```

**N.B. over FK-join:** als deze query faalt met "Could not find a relationship between 'atad2_sessions' and 'profiles'", dan is er geen expliciete FK-constraint. Fallback: verwijder de embedded select, doe een separate query voor `profiles` en merge client-side. Detecteer dit bij Step 4.

- [ ] **Step 3: Update useAdminSession (detail hook)**

Zoek `useAdminSession` in hetzelfde bestand. Update de `.select("*")` naar:

```typescript
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select(`
          *,
          owner:profiles!user_id(full_name, email)
        `)
        .eq("session_id", sessionId!)
        .maybeSingle();
```

- [ ] **Step 4: Verifieer build**

Run: `npm run build`
Expected: slaagt.

Handmatig: `npm run dev` → `/admin/sessions` → open DevTools Network → reload → check de sessions-query returnt `owner` objecten. Als ze allemaal `null` zijn, check of FK-join werkt; zie Step 2 fallback.

---

### Task 4.2: Render owner op SessionRow

**Files:**
- Modify: `src/pages/admin/Sessions.tsx`

- [ ] **Step 1: Update meta-regel**

Zoek de `<SessionRow>` component body. Vervang:

```tsx
        <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
          {session.session_id} · FY {session.fiscal_year}
        </div>
```

door:

```tsx
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          <span className="font-mono">{session.session_id}</span> · FY {session.fiscal_year}
          {session.owner && (
            <> · {session.owner.full_name ?? session.owner.email}</>
          )}
        </div>
```

- [ ] **Step 2: Verifieer**

Run: `npm run build`
Expected: slaagt.

Handmatig: `/admin/sessions` → row moet nu `atad2_xyz · FY 2025 · Lennart Wilming` tonen (waar owner bestaat).

---

### Task 4.3: Owner info cell op SessionDetail

**Files:**
- Modify: `src/pages/admin/SessionDetail.tsx`

- [ ] **Step 1: Update InfoCell-grid**

Zoek de `<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t...">` sectie. Verander naar `md:grid-cols-5` en voeg een nieuwe `<InfoCell>` toe voor owner:

```tsx
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-[#ececec] text-[11px]">
          <InfoCell label="Fiscal year" value={session.fiscal_year} />
          <InfoCell
            label="Period"
            value={
              session.period_start_date && session.period_end_date
                ? `${session.period_start_date} → ${session.period_end_date}`
                : "—"
            }
          />
          <InfoCell
            label="Owner"
            value={session.owner?.full_name ?? session.owner?.email ?? "—"}
          />
          <InfoCell label="Created" value={new Date(session.created_at).toLocaleString()} />
          <InfoCell
            label="Confirmed"
            value={session.confirmed_at ? new Date(session.confirmed_at).toLocaleString() : "—"}
          />
        </div>
```

- [ ] **Step 2: Type check**

`session.owner` type bestaat nu op row via `useAdminSession` (Task 4.1 Step 3). Als TypeScript error: `Property 'owner' does not exist on type 'any'...`, cast de session naar de juiste type of breidt interface uit.

Als `useAdminSession` momenteel `any` retourneert, voeg dan een type-annotatie toe:

```typescript
interface AdminSessionDetail {
  id: string;
  session_id: string;
  user_id: string | null;
  taxpayer_name: string;
  entity_name: string | null;
  fiscal_year: string;
  status: string;
  final_score: number | null;
  completed: boolean | null;
  confirmed_at: string | null;
  period_start_date: string | null;
  period_end_date: string | null;
  created_at: string;
  updated_at: string;
  owner: { full_name: string | null; email: string } | null;
}
```

En in de hook: `.select(...).maybeSingle()<AdminSessionDetail>` — of cast na de call `return data as AdminSessionDetail | null`.

- [ ] **Step 3: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

- [ ] **Step 4: Optioneel commit-checkpoint**

```bash
git add src/components/admin/useAdminSessions.ts src/pages/admin/Sessions.tsx src/pages/admin/SessionDetail.tsx
git commit -m "feat(admin): show session owner name in list and detail"
```

---

## Phase 5: Users role-select dropdown

### Task 5.1: `useAdminUsers` hook met `updateUserRole`

**Files:**
- Create: `src/components/admin/useAdminUsers.ts`

- [ ] **Step 1: Schrijf de hook**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type UserRole = "user" | "moderator" | "admin";

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (delErr) {
        if (delErr.message.includes("can_modify_admin_role")) {
          throw new Error("Cannot remove last admin or insufficient permissions");
        }
        throw delErr;
      }
      if (role !== "user") {
        const { error: insErr } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (insErr) {
          if (insErr.message.includes("can_modify_admin_role")) {
            throw new Error("Insufficient permissions to grant admin role");
          }
          throw insErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed"),
  });
}
```

- [ ] **Step 2: Verifieer compile**

Run: `npx tsc --noEmit`
Expected: geen errors.

---

### Task 5.2: Rewrite Users page met role-select

**Files:**
- Modify: `src/pages/admin/Users.tsx`

- [ ] **Step 1: Vervang volledig**

```typescript
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Shield, User as UserIcon } from "lucide-react";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminCard } from "@/components/admin/AdminCard";
import { IconChip } from "@/components/admin/IconChip";
import { StatusChip } from "@/components/admin/StatChip";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useUpdateUserRole, UserRole } from "@/components/admin/useAdminUsers";

interface ProfileRow {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

function currentRole(userId: string, roles: { user_id: string; role: UserRole }[]): UserRole {
  const mine = roles.filter((r) => r.user_id === userId);
  if (mine.some((r) => r.role === "admin")) return "admin";
  if (mine.some((r) => r.role === "moderator")) return "moderator";
  return "user";
}

const Users = () => {
  const { canEdit } = useAdminAccess();
  const [search, setSearch] = useState("");
  const [accessDialog, setAccessDialog] = useState(false);
  const [confirmChange, setConfirmChange] = useState<
    { user: ProfileRow; newRole: UserRole; oldRole: UserRole } | null
  >(null);

  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    staleTime: 60_000,
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: UserRole }[];
    },
    staleTime: 60_000,
  });

  const updateRole = useUpdateUserRole();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles ?? [];
    return (profiles ?? []).filter(
      (p) =>
        p.email.toLowerCase().includes(q) ||
        (p.full_name ?? "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const handleRoleChange = (user: ProfileRow, newRole: UserRole) => {
    if (!canEdit) {
      setAccessDialog(true);
      return;
    }
    const oldRole = currentRole(user.user_id, roles);
    if (oldRole === newRole) return;
    const securitySensitive = oldRole === "admin" || newRole === "admin";
    if (securitySensitive) {
      setConfirmChange({ user, newRole, oldRole });
    } else {
      updateRole.mutate({ userId: user.user_id, role: newRole });
    }
  };

  const isLoading = loadingProfiles || loadingRoles;

  return (
    <main>
      <Seo title="Admin Users & Roles" description="Manage users and roles" canonical="/admin/users" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Users & Roles</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${profiles?.length ?? 0} users…`}
      />

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p) => {
            const role = currentRole(p.user_id, roles);
            const Icon = role === "admin" ? ShieldCheck : role === "moderator" ? Shield : UserIcon;
            return (
              <AdminCard key={p.user_id} className="flex items-center gap-4 py-3">
                <IconChip icon={Icon} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">
                    {p.full_name || p.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                </div>
                <StatusChip
                  label={role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "User"}
                  tone={role === "admin" ? "success" : role === "moderator" ? "warning" : "neutral"}
                />
                <div className="w-[140px]">
                  <Select
                    value={role}
                    onValueChange={(v) => handleRoleChange(p, v as UserRole)}
                  >
                    <SelectTrigger
                      className={`h-8 text-[12px] ${!canEdit ? "opacity-60 cursor-help" : ""}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AdminCard>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No users found.</div>
          )}
        </div>
      )}

      <AlertDialog
        open={confirmChange !== null}
        onOpenChange={(open) => !open && setConfirmChange(null)}
      >
        <AlertDialogContent>
          {confirmChange && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmChange.newRole === "admin" ? "Grant admin rights" : "Revoke admin rights"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmChange.newRole === "admin"
                    ? `Grant admin rights to ${confirmChange.user.email}? This action is logged.`
                    : `Revoke admin rights from ${confirmChange.user.email}? This action is logged.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    updateRole.mutate({
                      userId: confirmChange.user.user_id,
                      role: confirmChange.newRole,
                    });
                    setConfirmChange(null);
                  }}
                >
                  {confirmChange.newRole === "admin" ? "Grant" : "Revoke"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="change user roles"
      />
    </main>
  );
};

export default Users;
```

- [ ] **Step 2: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

Handmatig: `/admin/users` → zie dropdowns werken; wisselen van `User ↔ Moderator` zonder confirm; wisselen van/naar `Admin` opent confirm-dialog.

- [ ] **Step 3: Optioneel commit-checkpoint**

```bash
git add src/components/admin/useAdminUsers.ts src/components/admin/AccessRequiredDialog.tsx src/pages/admin/Users.tsx
git commit -m "feat(admin): role-select dropdown with User/Moderator/Admin options"
```

---

## Phase 6: Gating on mutation UI

### Task 6.1: Gating op Questions.tsx

**Files:**
- Modify: `src/pages/admin/Questions.tsx`

- [ ] **Step 1: Import hook + dialog**

Voeg imports toe bovenaan:

```typescript
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
```

- [ ] **Step 2: Gebruik canEdit**

In de component body, na de bestaande hooks:

```typescript
  const { canEdit } = useAdminAccess();
  const [accessDialog, setAccessDialog] = useState(false);
```

- [ ] **Step 3: Update "+ New question" button**

Zoek:
```tsx
        actions={
          <Button size="sm" onClick={() => navigate("/admin/questions/new")}>
            <Plus className="mr-1 h-4 w-4" /> New question
          </Button>
        }
```

Vervang door:

```tsx
        actions={
          <Button
            size="sm"
            onClick={() => canEdit ? navigate("/admin/questions/new") : setAccessDialog(true)}
            className={!canEdit ? "opacity-60 cursor-help" : ""}
          >
            <Plus className="mr-1 h-4 w-4" /> New question
          </Button>
        }
```

- [ ] **Step 4: Render dialog**

Na de `</SlideInPanel>` tag maar vóór `</main>`:

```tsx
      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="create a question"
      />
```

- [ ] **Step 5: Verifieer build**

Run: `npm run build`
Expected: slaagt.

---

### Task 6.2: Gating op QuestionEditorPanel

**Files:**
- Modify: `src/components/admin/QuestionEditorPanel.tsx`

- [ ] **Step 1: Props uitbreiden**

Update interface:

```typescript
export interface QuestionEditorPanelProps {
  question: AdminQuestion | null;
  allQuestions: AdminQuestion[];
  canEdit: boolean;
  onSave: (values: QuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onRequestAccess?: () => void;
}
```

- [ ] **Step 2: Destructure in function signature**

```typescript
export function QuestionEditorPanel({
  question, allQuestions, canEdit, onSave, onDelete, onCancel, onRequestAccess,
}: QuestionEditorPanelProps) {
```

- [ ] **Step 3: Disable all inputs als !canEdit**

Bij ELKE `<Input>`, `<Textarea>`, `<select>` in het formulier, voeg `disabled={!canEdit}` toe. Voorbeeld voor `question_id`:

```tsx
          <FormField control={form.control} name="question_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Question ID
              </FormLabel>
              <FormControl>
                <Input {...field} disabled={!canEdit || !isNew} placeholder="q_001" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
```

Herhaal het `disabled={!canEdit}` pattern voor alle velden:
- `question_title` → `disabled={!canEdit}`
- `question` → `disabled={!canEdit}`
- `answer_option` → `disabled={!canEdit}`
- `risk_points` → `disabled={!canEdit}`
- `next_question_id` select → `disabled={!canEdit}`
- `difficult_term` → `disabled={!canEdit}`
- `term_explanation` → `disabled={!canEdit}`
- `question_explanation` → `disabled={!canEdit}`

- [ ] **Step 4: Vervang footer knoppen**

Zoek de laatste `<div className="flex items-center justify-between pt-2">` sectie. Vervang **de hele div met daarin de knoppen** door:

```tsx
        <div className="flex items-center justify-between pt-2">
          <div>
            {canEdit && !isNew && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[#991b1b] border-[#fecaca]"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {question?.question_id} will be permanently deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { await onDelete(); }}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Close</Button>
                <Button
                  type="button"
                  onClick={() => onRequestAccess?.()}
                  className="opacity-60 cursor-help"
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
```

- [ ] **Step 5: Verifieer build**

Run: `npm run build`
Expected: slaagt.

---

### Task 6.3: Wire Questions page → panel

**Files:**
- Modify: `src/pages/admin/Questions.tsx`

- [ ] **Step 1: Pass canEdit + onRequestAccess**

In de `<QuestionEditorPanel>` render:

```tsx
        {panelOpen && (
          <QuestionEditorPanel
            question={editingQuestion}
            allQuestions={data ?? []}
            canEdit={canEdit}
            onRequestAccess={() => setAccessDialog(true)}
            onSave={async (values) => {
              const rowId = editingQuestion?.id;
              await upsert.mutateAsync({ ...(rowId ? { id: rowId } : {}), ...values });
              closeEdit();
            }}
            onDelete={
              editingQuestion
                ? async () => {
                    await del.mutateAsync(editingQuestion.id);
                    closeEdit();
                  }
                : undefined
            }
            onCancel={closeEdit}
          />
        )}
```

- [ ] **Step 2: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

---

### Task 6.4: Gating op ContextQuestionEditorPanel

**Files:**
- Modify: `src/components/admin/ContextQuestionEditorPanel.tsx`

- [ ] **Step 1: Props uitbreiden**

```typescript
export interface ContextQuestionEditorPanelProps {
  question: AdminContextQuestion | null;
  parentQuestionIds: string[];
  canEdit: boolean;
  onSave: (values: ContextQuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onRequestAccess?: () => void;
}
```

- [ ] **Step 2: Destructure**

```typescript
export function ContextQuestionEditorPanel({
  question, parentQuestionIds, canEdit, onSave, onDelete, onCancel, onRequestAccess,
}: ContextQuestionEditorPanelProps) {
```

- [ ] **Step 3: Disable inputs**

Bij de drie velden (question_id select, answer_trigger Input, context_question Textarea), voeg `disabled={!canEdit}` toe aan elk.

- [ ] **Step 4: Vervang footer**

Zelfde pattern als Task 6.2 Step 4 — maar voor context question Delete dialog:

```tsx
        <div className="flex items-center justify-between pt-2">
          <div>
            {canEdit && !isNew && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[#991b1b] border-[#fecaca]"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete context question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { await onDelete(); }}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Close</Button>
                <Button
                  type="button"
                  onClick={() => onRequestAccess?.()}
                  className="opacity-60 cursor-help"
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
```

- [ ] **Step 5: Verifieer**

Run: `npm run build`
Expected: slaagt.

---

### Task 6.5: Gating op ContextQuestions.tsx

**Files:**
- Modify: `src/pages/admin/ContextQuestions.tsx`

- [ ] **Step 1: Import + state**

```typescript
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
```

Binnen component:

```typescript
  const { canEdit } = useAdminAccess();
  const [accessDialog, setAccessDialog] = useState(false);
```

- [ ] **Step 2: Gate "+ New" button**

```tsx
        actions={
          <Button
            size="sm"
            onClick={() => canEdit ? navigate("/admin/context-questions/new") : setAccessDialog(true)}
            className={!canEdit ? "opacity-60 cursor-help" : ""}
          >
            <Plus className="mr-1 h-4 w-4" /> New context question
          </Button>
        }
```

- [ ] **Step 3: Pass canEdit + onRequestAccess aan panel**

```tsx
        {panelOpen && (
          <ContextQuestionEditorPanel
            question={editing}
            parentQuestionIds={(parentQuestions ?? []).map((p) => p.question_id)}
            canEdit={canEdit}
            onRequestAccess={() => setAccessDialog(true)}
            onSave={async (values) => {
              const rid = editing?.id;
              await upsert.mutateAsync({ ...(rid ? { id: rid } : {}), ...values });
              closeEdit();
            }}
            onDelete={
              editing
                ? async () => {
                    await del.mutateAsync(editing.id);
                    closeEdit();
                  }
                : undefined
            }
            onCancel={closeEdit}
          />
        )}
```

- [ ] **Step 4: Render dialog**

Vóór `</main>`:

```tsx
      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="edit context questions"
      />
```

- [ ] **Step 5: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

---

### Task 6.6: Gating op SessionDetail

**Files:**
- Modify: `src/pages/admin/SessionDetail.tsx`

- [ ] **Step 1: Import + state**

```typescript
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
```

Binnen component (na bestaande `const`s):

```typescript
  const { canEdit } = useAdminAccess();
  const [accessDialog, setAccessDialog] = useState(false);
```

- [ ] **Step 2: Gate Delete button**

Zoek de `<AlertDialog>` met "Delete session" inhoud. Vervang **de gehele AlertDialog door een conditionele render**:

```tsx
        {canEdit ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-[#991b1b] border-[#fecaca]">
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete session
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete session?</AlertDialogTitle>
                <AlertDialogDescription>
                  {session.taxpayer_name} ({session.session_id}) will be permanently deleted, including answers and reports. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await del.mutateAsync(session.id);
                    navigate("/admin/sessions");
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="text-[#991b1b] border-[#fecaca] opacity-60 cursor-help"
            onClick={() => setAccessDialog(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete session
          </Button>
        )}
```

- [ ] **Step 3: Render dialog**

Vóór `</main>`:

```tsx
      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="delete this session"
      />
```

- [ ] **Step 4: Verifieer**

Run: `npm run build && npm run lint`
Expected: slaagt.

- [ ] **Step 5: Optioneel commit-checkpoint**

```bash
git add src/pages/admin/Questions.tsx src/pages/admin/ContextQuestions.tsx src/pages/admin/SessionDetail.tsx src/components/admin/QuestionEditorPanel.tsx src/components/admin/ContextQuestionEditorPanel.tsx
git commit -m "feat(admin): gate all mutation UI on canEdit for moderator read-only"
```

---

## Phase 7: End-to-end smoke test

### Task 7.1: Admin user test

**Files:** geen code; manual test.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server op `http://localhost:8080/` (als 8080 vrij is).

- [ ] **Step 2: Login als admin**

Login als `lennart.wilming@svalneratlas.com`. Verwacht: Admin-knop zichtbaar in header; `/admin` laadt.

- [ ] **Step 3: Checklist admin-functionaliteit**

Loop door:
- [ ] Hub laadt normaal
- [ ] Sessions lijst toont owner-namen waar `user_id` bestaat
- [ ] Session detail header toont "Owner: X" InfoCell
- [ ] Questions — `+ New question` werkt normaal, slide-in editor is bewerkbaar, Save werkt
- [ ] Question editor toont nieuw "Explanation" veld; preview toont italic
- [ ] Context questions — zelfde, bewerkbaar
- [ ] Users — dropdown per rij: `User / Moderator / Admin`
  - Wisselen tussen `User` en `Moderator` → stilletje, toast "Role updated"
  - Wisselen naar `Admin` → confirm dialog
  - Wisselen weg van `Admin` → confirm dialog
- [ ] Session detail Delete button werkt normaal

---

### Task 7.2: Moderator user test

**Files:** geen code; SQL-setup + manual test.

- [ ] **Step 1: Grant moderator-rol aan test-user**

Kies een test-account (bv. `martin.bogdanovski@svalneratlas.com`). Via Supabase Studio SQL:

```sql
INSERT INTO user_roles (user_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'martin.bogdanovski@svalneratlas.com'),
  'moderator'
)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Login als moderator**

(Vraag Martin om in te loggen, of gebruik je eigen alternatief test-account.) Verwacht: Admin-knop zichtbaar; `/admin/*` laadt.

- [ ] **Step 3: Checklist moderator-ervaring**

- [ ] Hub laadt met KPI's
- [ ] Sessions lijst laadt (zou anders RLS-error geven)
- [ ] Klik session → detail pagina laadt; "Delete session" button is gedimd; klik opent modal "Admin access required"
- [ ] Questions: `+ New question` button is gedimd; klik opent modal
- [ ] Klik vraag → slide-in panel opent; alle form-velden zijn disabled; footer toont `[Close] [Save*]` waarbij Save gedimd is; klik Save opent modal
- [ ] Context questions: zelfde
- [ ] Users: dropdowns zijn gedimd; klik opent modal
- [ ] Data Explorer + AuditLogs: werken normaal (waren al read-only)

- [ ] **Step 4: RLS-test via DevTools**

Open DevTools console op een admin-pagina als moderator. Probeer:

```javascript
const sb = (await import("/src/integrations/supabase/client.ts")).supabase;
await sb.from("atad2_questions").delete().eq("id", "non-existent-uuid");
```

Verwacht: `{ error: { message: "...", code: "42501" } }` of vergelijkbare RLS-permission-denied.

---

### Task 7.3: Regular user test

**Files:** geen code; manual test.

- [ ] **Step 1: Login als gewone user (geen rol)**

- [ ] **Step 2: Check**

- [ ] Admin-knop NIET zichtbaar in header
- [ ] Direct navigeren naar `http://localhost:8080/admin/questions` → `NotAuthorized` pagina

---

### Task 7.4: Final build + lint

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `✓ built in Xs`, geen errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: geen nieuwe errors in de admin-files (oude pre-existing warnings buiten admin scope mogen blijven).

- [ ] **Step 3: Rapport aan Lennart**

Maak een kort rapport: "Plan 3 klaar. Getest als admin, moderator, user. Build/lint schoon. Wil je committen?" Wacht op expliciete goedkeuring voor commits.

- [ ] **Step 4: Optionele eind-commit**

Alleen op Lennart's goedkeuring:

```bash
git add .
git status  # verifieer staged files
git commit -m "feat(admin): admin-light (moderator) role, session owner names, question explanation"
```

**Nooit `git push` zonder expliciete goedkeuring** (push → auto-deploy naar productie).

---

## Open risks tijdens implementatie

1. **Exact policy-namen** — Task 0.1 verwacht handmatige lookup. Als policy-naam afwijkt van wat in de migration DROP-statement staat, slaagt de DROP stil (IF EXISTS), maar de oude policy blijft bestaan — wat resulteert in TWEE policies op dezelfde tabel. Dubbele SELECT policies zijn additief (OR), dus functioneel nog steeds correct, maar niet schoon. Fix: na migratie `SELECT policyname FROM pg_policies ...` draaien en duplicaten droppen.

2. **Profiles FK naar atad2_sessions.user_id** — de Supabase embedded join (`owner:profiles!user_id`) vereist een FK-constraint. Als die niet bestaat in het schema, geeft de query error. Fallback in Task 4.1 Step 2: doe twee separate queries (sessions + profiles) en join client-side.

3. **TypeScript strict mode** — het `as unknown as AdminSessionRow[]` cast in Task 4.1 omzeilt type-check voor de embedded join. Als TypeScript strict is, kan er een warning komen. Acceptabel voor nu; Supabase-types genereren (via `supabase gen types typescript`) zou dit netter maken — buiten scope.

4. **`moderator` enum-waarde** — zit al in `app_role`. Als per ongeluk verwijderd, krijgt INSERT een constraint-error. Check vooraf: `SELECT unnest(enum_range(NULL::app_role));` moet `admin, moderator, user` teruggeven.
