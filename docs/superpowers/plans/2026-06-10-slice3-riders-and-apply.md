# Slice 3 riders en toepas-instructies (gegenereerd)


## 20260610190100_answer_resolution_and_events.sql

### Migration note
M1 of the dossier foundation (slice 3, shipped dark): atad2_answers gains the confirmed-unknown sign-off columns (unknown_confirmed_at/by/note) plus updated_at with the house auto-update trigger and a one-time backfill from answered_at; a BEFORE UPDATE trigger clears the sign-off whenever the answer value changes (carve-out only for a fresh sign-off on a row that stays Unknown, so the new CHECK constraint can never reject a legitimate value change); new append-only audit table atad2_answer_events written by a SECURITY DEFINER AFTER INSERT/UPDATE trigger in the same transaction (owner+staff SELECT, no direct writes, privileges revoked); atad2_structure_charts gains finalized_by. Answer DELETEs (Assessment.tsx backtrack) deliberately not logged, documented in header. Re-runnable end to end.

### Notes
FILE IS ON DISK on feat/client-platform (untracked, not committed, not applied to the VM). Changes vs the draft, per review findings: (1) the clear-trigger carve-out is tightened: a fresh sign-off in the same UPDATE is only honoured when the row STAYS Unknown; a fresh sign-off arriving with a change to Yes/No is cleared, so the new CHECK constraint (atad2_answers_unknown_confirmed_only_on_unknown) can never reject a legitimate answer-value change, and the migration comment now matches behavior literally. This is still a documented deviation from the spec's unconditional clear rule; it enables a future one-statement confirm dialog while keeping the stale-sign-off guarantee intact. Decide before the confirm-unknown UI slice if the literal rule is preferred. (2) The Assessment.tsx backtrack-delete is now named explicitly in the header and the events table comment as the deliberate not-logged case. Unchanged from the draft and verified: the answers CHECK already allows 'Unknown' (20250811183445) so it is not touched; updated_at backfill is guarded and ordered before trigger creation; trigger-writes-vs-RLS uses the verified log_atad2_session_event house mechanism (SECURITY DEFINER function owned by supabase_admin, no write policies, privileges revoked).

### Frontend changes
One ride-along edit (the finalize write path starts recording the actor; everything else in M1 is dark). Apply ONLY after the migration has run on the VM and the types.ts delta is in, otherwise TypeScript rejects the new column.

File: src/lib/structure/client.ts (currently lines 144-167)

Edit 1 - finalizeChart records the actor.
Before:
```typescript
export async function finalizeChart(chartId: string) {
  await supabase.from('atad2_structure_charts')
    .update({ status: 'finalized', finalized_at: new Date().toISOString() })
    .eq('id', chartId);
}
```
After:
```typescript
export async function finalizeChart(chartId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('atad2_structure_charts')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: user?.id ?? null,
    })
    .eq('id', chartId);
}
```

Edit 2 - unfinalizeChart clears it (a chart that is no longer finalized has no finalizer). In the update object inside unfinalizeChart, add one line after `finalized_at: null,`:
```typescript
      finalized_by: null,
```

No other frontend changes belong to M1. The confirm-unknown UI that writes unknown_confirmed_* arrives in a later slice; callers of finalizeChart (StructureChartStep.tsx line ~726) need no change.

### types.ts delta
All in src/integrations/supabase/types.ts (hand-maintained; no Supabase CLI).

1. atad2_answers (block at lines 17-73): add to Row:
```typescript
          unknown_confirmed_at: string | null
          unknown_confirmed_by: string | null
          unknown_confirmed_note: string | null
          updated_at: string
```
Add to Insert and Update (optional in both):
```typescript
          unknown_confirmed_at?: string | null
          unknown_confirmed_by?: string | null
          unknown_confirmed_note?: string | null
          updated_at?: string
```

2. atad2_structure_charts: add to Row:
```typescript
          finalized_by: string | null
```
Add to Insert and Update:
```typescript
          finalized_by?: string | null
```
(No Relationships entry needed; the existing blocks do not model auth.users FKs, e.g. atad2_reports.archived_by has none.)

3. New table block, inserted alphabetically BEFORE atad2_answers ("answer_events" sorts before "answers"):
```typescript
      atad2_answer_events: {
        Row: {
          actor: string | null
          confirmation_change: "set" | "cleared" | null
          created_at: string
          id: string
          new_answer: string | null
          new_explanation: string | null
          old_answer: string | null
          old_explanation: string | null
          question_id: string
          session_id: string
        }
        Insert: {
          actor?: string | null
          confirmation_change?: "set" | "cleared" | null
          created_at?: string
          id?: string
          new_answer?: string | null
          new_explanation?: string | null
          old_answer?: string | null
          old_explanation?: string | null
          question_id: string
          session_id: string
        }
        Update: {
          actor?: string | null
          confirmation_change?: "set" | "cleared" | null
          created_at?: string
          id?: string
          new_answer?: string | null
          new_explanation?: string | null
          old_answer?: string | null
          old_explanation?: string | null
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_atad2_answer_events_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
```

No Views or Functions changes in M1 (atad2_dossier_blocks and final_report_gate are M5).

## 20260610190200_prefill_job_heartbeat.sql

### Migration note
M2 - Prefill job heartbeat: adds atad2_prefill_jobs.heartbeat_at (browser swarm ticks every ~20s; readers apply a 2-minute staleness threshold), a guarded session-owner UPDATE policy (without which both the heartbeat tick and the existing browser finalize UPDATE are silent RLS no-ops), and NEW vs draft a one-time repair marking legacy jobs frozen in a running status as completed (running + NULL heartbeat + older than 1 hour + at least one prefill row), so the M5 status oracle does not paint every existing dossier 'attention'. Frontend rider: heartbeat ticker plus a job re-claim on duplicate insert so re-analysis refreshes started_at (load-bearing for M5's Documents 'ready'). Dark infrastructure.

### Notes
FILE IS ON DISK on feat/client-platform. Changes vs the draft, resolving the M2+M5 interplay major: (1) NEW section 3, a one-time repair marking legacy frozen jobs as completed. The condition (running status + heartbeat_at NULL + older than 1 hour + at least one prefill row) only ever matches pre-M2 rows: post-M2 runs tick the heartbeat from their first second, and no legitimate swarm run lasts an hour. stage2_finished_at is backfilled from the newest prefill row's created_at (the honest finish moment). Jobs stuck running with ZERO prefill rows are deliberately left alone ('attention' + Resume is the honest state). Re-run safe: repaired rows never match again. (2) The frontend rider gained the job re-claim on duplicate insert (status/started_at/stage2_finished_at/error_message/locked_at refreshed), which fixes the review's documents-never-ready-again finding: M5's Documents block keys 'ready' on started_at >= newest upload, and without the re-claim started_at stays frozen at the first run. The re-claim also makes Resume work for 'failed' jobs. Side effect already flagged in the draft and still true: with the new UPDATE policy, the browser finalize write starts actually persisting (it has been silently no-opping). Constants named where used: PREFILL_HEARTBEAT_INTERVAL_MS = 20_000 in code, 2-minute staleness in the migration header, COMMENT ON COLUMN, and helper doc comment; enforced by readers, never DDL. Deploy order: migration first, then the frontend commit (rider + types delta together).

### Frontend changes
FILE: src/hooks/usePrefill.ts (two edits) + one line in src/lib/prefill/types.ts. Apply AFTER the migration is on the VM and in the same commit as the types.ts delta.

=== EDIT 1: new heartbeat helper. ANCHOR: insert after the closing `}` of useUploadText (line 384) and BEFORE the block comment `/** Client-orchestrated swarm: ... */` that precedes useStartAnalyze (line 386). New code:

```ts
/**
 * Heartbeat for the browser-orchestrated swarm. While this tab owns the
 * analysis run, tick atad2_prefill_jobs.heartbeat_at every ~20s so a reader
 * can tell "still running" from "tab was closed mid-run". Copies
 * startHeartbeat in supabase/functions/extract-structure/index.ts (the chart
 * pipeline's 15s heartbeat). Readers treat a running status with a heartbeat
 * older than 2 minutes as dead (STALENESS THRESHOLD, see migration
 * 20260610190200_prefill_job_heartbeat.sql); 20s gives ~6 beats inside that
 * window, so one dropped request never flags a live run as dead.
 *
 * Returns a stop function. Caller MUST call stop() in a finally block so the
 * interval never outlives the swarm. A failed beat is logged to the console
 * and otherwise ignored: fire-and-forget, no toast, no retry, never thrown.
 */
const PREFILL_HEARTBEAT_INTERVAL_MS = 20_000;

function startJobHeartbeat(sessionId: string): () => void {
  const tick = async () => {
    try {
      const { error } = await supabase
        .from("atad2_prefill_jobs")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("session_id", sessionId);
      if (error) console.warn("[prefill-heartbeat] update failed", error.message);
    } catch (err) {
      console.warn("[prefill-heartbeat] update failed", err);
    }
  };
  void tick(); // first beat right away so a fresh job is never "stale at birth"
  const timer = setInterval(() => { void tick(); }, PREFILL_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
```

=== EDIT 2: wire into useStartAnalyze's mutationFn. ANCHOR: replace everything from the duplicate-insert guard (line 414, `if (jobErr && ...`) through the final `return` of mutationFn (line 482). Steps 3-6 are byte-identical to the current file except for being wrapped in try/finally (re-indented +2). Replacement:

```ts
      if (jobErr && !`${jobErr.message}`.toLowerCase().includes("duplicate")) {
        throw jobErr;
      }
      if (jobErr) {
        // Re-analysis: the job row already exists (one row per session).
        // Re-claim it so started_at reflects THIS run. The dossier status
        // view (atad2_dossier_blocks, M5) derives "Documents ready" from
        // "last completed analysis started at or after the newest upload",
        // so a frozen started_at would block 'ready' forever after a later
        // upload. Allowed by the session-owner UPDATE policy from M2.
        await supabase.from("atad2_prefill_jobs").update({
          status: "stage2_running",
          started_at: new Date().toISOString(),
          stage2_finished_at: null,
          error_message: null,
          locked_at: new Date().toISOString(),
        }).eq("session_id", sessionId);
      }

      // 2b. Start the heartbeat now that the job row exists / is re-claimed.
      //     Stopped in the finally below; if this tab dies instead, the beats
      //     stop with it, which is exactly the signal readers use to detect
      //     an abandoned run.
      const stopHeartbeat = startJobHeartbeat(sessionId);
      try {
        // 3. Load distinct questions.
        //    ... (steps 3, 4, 5 and 6 from the current file, lines 418-482,
        //    unchanged, re-indented one level) ...
        return { ok: true, prefill_count: questions.length - failures.length, failure_count: failures.length };
      } finally {
        stopHeartbeat();
      }
```

=== EDIT 3 (one-line ride-along): FILE: src/lib/prefill/types.ts, PrefillJob interface (lines 114-125). After `locked_at: string | null;` (line 124), add:

```ts
  // Ticked ~20s by the browser swarm while it runs; NULL on legacy rows.
  heartbeat_at: string | null;
```

(usePrefillJob does select("*"), so the column flows into this type after the migration; the staleness reader in a later slice consumes it.)

### types.ts delta
FILE: src/integrations/supabase/types.ts, table atad2_prefill_jobs (lines 204-252). Insert one line per block, keeping alphabetical order (between `failed_at` and `id`):

In Row (after `failed_at: string | null`):
```ts
          heartbeat_at: string | null
```

In Insert (after `failed_at?: string | null`):
```ts
          heartbeat_at?: string | null
```

In Update (after `failed_at?: string | null`):
```ts
          heartbeat_at?: string | null
```

Without the Update entry, the new .update({ heartbeat_at: ... }) call in startJobHeartbeat fails typecheck, so this delta must land in the same commit as the frontend edit. No Views/Functions changes for M2.

## 20260610190300_open_questions_register.sql

### Migration note
M3 - the open-questions register: atad2_open_questions (work layer over atad2_answers, never gates) + append-only atad2_open_question_events + the log_open_question_event SECURITY DEFINER RPC + the swarm-side trigger (cases A/B/C, fail-soft) + the answers-side sync trigger (fail-loud) + session-owner/staff RLS + tolerant realtime DO block + backfill keyed on no non-archived report. BLOCKER RESOLVED vs draft: unknown-suggestion detection now covers both swarm representations (v8+ rows store suggested_answer NULL with contextual_hint; only pre-v8 rows store the 'unknown' literal), in trigger case A and backfill 8b. Also new: a fail-fast preflight aborts the whole file before anything applies if M1 is missing.

### Notes
FILE IS ON DISK on feat/client-platform. Changes vs the draft: (1) BLOCKER fixed: the live swarm pipeline (prompt v8+, Rule 0) stores a cannot-answer as suggested_answer NULL + contextual_hint NOT NULL, never as the 'unknown' enum value; verified against analyze.ts line 187 and 20260524100000_swarm_prompt_v8.sql. Case A and backfill 8b now test (suggested_answer = 'unknown' OR (suggested_answer IS NULL AND contextual_hint IS NOT NULL)), keeping the literal for pre-v8 historic rows, with the dual representation documented at both sites. The early-exit guard already watched contextual_hint changes, so no other logic moved. (2) Fail-fast preflight DO block as the very first statement: a misordered apply (M3 before M1) now raises before anything commits, instead of installing a live answers trigger that would error on every answer save (psql autocommits per statement and plpgsql bodies are not validated at CREATE time). The header claim now matches reality. (3) log_open_question_event accepts service-role callers via the request.jwt.claims role pattern (the previous auth.uid()-only check made the service_role EXECUTE grant dead code). (4) REVOKE/GRANT belt-and-braces on atad2_open_question_events, consistent with M1's events table. (5) Header documents the Assessment.tsx backtrack-delete behavior; section 8 documents that a re-run converges (post-archive sessions gain rows) rather than strictly no-ops. Retained deliberate extensions, documented in the SQL: Yes/No also resolves confirmed_unknown rows (M1 wipes the confirmation in the same transaction); prefill-side trigger is fail-soft, answers-side fail-loud. Hard dependency: M1 first (enforced by the preflight). No dependency on M2/M4/M5 and nothing VM-only.

### Frontend changes
none

### types.ts delta
In src/integrations/supabase/types.ts, insert the two table entries alphabetically between atad2_feedback (ends ~line 203) and atad2_prefill_jobs (starts ~line 204):

      atad2_open_question_events: {
        Row: {
          actor: string | null
          created_at: string
          detail: Json | null
          event: string
          id: string
          question_id: string
          session_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          event: string
          id?: string
          question_id: string
          session_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          detail?: Json | null
          event?: string
          id?: string
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_open_question_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_open_questions: {
        Row: {
          client_answer: string | null
          client_answer_at: string | null
          client_question: string | null
          created_at: string
          id: string
          question_id: string
          reopen_reason: string | null
          resolution_note: string | null
          resolved_at: string | null
          session_id: string
          source: string
          status: string
          taken_to_client_at: string | null
          updated_at: string
          why_it_matters: string | null
        }
        Insert: {
          client_answer?: string | null
          client_answer_at?: string | null
          client_question?: string | null
          created_at?: string
          id?: string
          question_id: string
          reopen_reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          session_id: string
          source: string
          status?: string
          taken_to_client_at?: string | null
          updated_at?: string
          why_it_matters?: string | null
        }
        Update: {
          client_answer?: string | null
          client_answer_at?: string | null
          client_question?: string | null
          created_at?: string
          id?: string
          question_id?: string
          reopen_reason?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          session_id?: string
          source?: string
          status?: string
          taken_to_client_at?: string | null
          updated_at?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atad2_open_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }

And in the Functions section (alphabetical, after has_role):

      log_open_question_event: {
        Args: {
          p_detail?: Json | null
          p_event: string
          p_question_id: string
          p_session_id: string
        }
        Returns: Json
      }

## 20260610190400_report_columns_and_rls_hardening.sql

### Migration note
M4: atad2_reports gains report_kind/generation_status/error_message/prompt_version/parent_report_id/regenerated_sections/open_questions; total_risk integer -> numeric (guarded, lock note in-file); INSERT policy replaced by a service_role-only variant (old policy verified WITH CHECK (true) with no role restriction); user DELETE policy dropped (admin DELETE kept); archive_report(p_report_id uuid) SECURITY DEFINER RPC for the owner-facing Archive action (atad2_reports has no user UPDATE policy, so a direct frontend update would silently no-op); assessment_log event_type CHECK widened with interim_generated/final_generated, drop+re-add now atomic in one DO block; closing verification DO block fails loudly on any drift. Frontend rider: ReportDetail.tsx Delete becomes Archive via the RPC.

### Notes
FILE IS ON DISK on feat/client-platform (was already present; now patched). Changes vs the draft: (1) the assessment_log event_type CHECK drop loop and the widened re-add now live in ONE DO block (single transaction): a failure can no longer strand the table with no constraint at all, which was the one stranding scenario the rerun-safety review found. Nested dollar-quoting ($ddl$ inside $$) is valid. (2) LOCK NOTE added in-file above the total_risk conversion (ACCESS EXCLUSIVE + full rewrite, tiny table, sub-second, guarded). (3) The deploy-gap description is corrected in the header AND here: dropping the DELETE policy does NOT make the old Delete button error; PostgREST returns success on a zero-row delete, so the old UI would show "Report deleted" while the report survives. Therefore: apply M4 on the VM and ship the ReportDetail Archive rider in the same frontend deploy, no gap. (4) typesTsDelta corrected: event_type in types.ts is a literal union (verified lines 92/112/132), so the union must be widened now to keep the hand-maintained file honest; nothing writes the new values in this dark slice, so this is type-only. Unchanged and verified: policy names match 20250814181123 verbatim; the n8n-report edge function inserts with the service key so the service_role-only INSERT policy does not break it; admin DELETE policy stays; archive_report deviates deliberately from the literal task (frontend .update()) because atad2_reports has no user UPDATE policy and granting one would let users rewrite delivered memos; the closing verification DO block makes every re-run self-checking.

### Frontend changes
File: src/pages/ReportDetail.tsx (three edits; ship in the SAME frontend deploy as the M4 apply, see the DEPLOY ORDER note in the migration header)

EDIT 1, line 10 (icon import):
BEFORE:
import { Download, ArrowLeft, Trash2 } from "lucide-react";
AFTER:
import { Download, ArrowLeft, Archive } from "lucide-react";

EDIT 2, lines 38-61 (the mutation):
BEFORE:
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No report ID");
      
      const { error } = await supabase
        .from("atad2_reports")
        .delete()
        .eq("id", reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Report deleted" });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      navigate("/");
    },
    onError: (error) => {
      toast({
        title: "Error deleting report",
        description: error.message,
        variant: "destructive",
      });
    },
  });
AFTER:
  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No report ID");

      // Archiving goes through a SECURITY DEFINER RPC. atad2_reports has no
      // user UPDATE policy on purpose (reports stay unchangeable for users),
      // so a direct .update() here would silently match zero rows. The RPC
      // checks ownership and sets archived_at and archived_by server-side.
      const { error } = await supabase.rpc("archive_report", {
        p_report_id: reportId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Report archived" });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report", reportId] });
      navigate("/");
    },
    onError: (error) => {
      toast({
        title: "Error archiving report",
        description: error.message,
        variant: "destructive",
      });
    },
  });

EDIT 3, lines 170-194 (the dialog and button):
BEFORE:
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete report</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this report? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
AFTER:
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive report</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the report from your dashboard. An archived copy is kept for the audit trail.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => archiveMutation.mutate()}
                    disabled={archiveMutation.isPending}
                  >
                    {archiveMutation.isPending ? "Archiving…" : "Archive"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

No other frontend files need edits: Index.tsx, AssessmentReport.tsx and DownloadMemoButton.tsx already filter with .is("archived_at", null), so the archived report disappears from all user-facing lists automatically. Admin SessionDetail.tsx already renders archived reports with a badge. All strings are English with no em-dashes (the "Archiving…" ellipsis matches the existing "Deleting…" style).

### types.ts delta
File: src/integrations/supabase/types.ts (hand-maintained; apply after the migration runs on the VM)

1. atad2_reports.Row (lines 486-501): add these keys in alphabetical position. total_risk stays `number | null` (numeric maps to number):
   error_message: string | null          (after archived_by)
   generation_status: string             (after generated_at)
   open_questions: Json | null           (after model)
   parent_report_id: string | null       (after open_questions)
   prompt_version: string | null         (after parent_report_id)
   regenerated_sections: string[] | null (after prompt_version)
   report_kind: string                   (between report_json and report_md)

2. atad2_reports.Insert (lines 502-517): same keys, all optional:
   error_message?: string | null
   generation_status?: string
   open_questions?: Json | null
   parent_report_id?: string | null
   prompt_version?: string | null
   regenerated_sections?: string[] | null
   report_kind?: string

3. atad2_reports.Update (lines 518-533): identical optional keys as Insert.

4. atad2_reports.Relationships (lines 534-542): add a self-FK entry BEFORE the existing fk_atad2_reports_session entry (alphabetical):
        {
          foreignKeyName: "atad2_reports_parent_report_id_fkey"
          columns: ["parent_report_id"]
          isOneToOne: false
          referencedRelation: "atad2_reports"
          referencedColumns: ["id"]
        },

5. Functions section (lines ~1021-1046): add alphabetically between anonymize_old_sessions and can_modify_admin_role:
      archive_report: {
        Args: { p_report_id: string }
        Returns: Json
      }

6. atad2_assessment_log (CORRECTED vs draft: event_type is a LITERAL UNION in types.ts, not plain string): widen the union in all three blocks.
   Line 92 (Row) and line 112 (Insert), change:
     event_type: "created" | "completed" | "deleted" | "backfill"
   to:
     event_type: "created" | "completed" | "deleted" | "backfill" | "interim_generated" | "final_generated"
   Line 132 (Update), change:
     event_type?: "created" | "completed" | "deleted" | "backfill"
   to:
     event_type?: "created" | "completed" | "deleted" | "backfill" | "interim_generated" | "final_generated"

## 20260610190500_dossier_blocks_view_and_final_gate.sql

### Migration note
M5: the status oracle + the gate. security_invoker view atad2_dossier_blocks (one row per session, five block statuses in the six-status vocabulary plus raw facts incl. inputs_changed_after_final), SECURITY DEFINER final_report_gate(p_session_id) returning {allowed, blockers:[{code,count}]}, staff SELECT policies on atad2_question_prefills/atad2_prefill_jobs/atad2_structure_charts. MAJORS RESOLVED vs draft: the structure block now flags 'extraction_failed' (the real ChartStatus failure value; the draft's 'failed'/'stale' matched nothing and hid failed charts), and the questions CASE is reordered so a finished questionnaire outranks a dead legacy job (fresh-pulse generating still first). References VM-only atad2_appendix, documented loudly in the header. Depends on M1+M2+M4.

### Notes
FILE IS ON DISK on feat/client-platform (was already present; now patched). Changes vs the draft, per review: (1) MAJOR fixed: the structure block's attention rule now matches 'extraction_failed', the only stored failure value in the chart state machine (verified in src/lib/structure/types.ts ChartStatus); the draft's 'failed'/'stale' matched nothing, so failed charts derived 'in_progress' forever. The dead values are kept in the IN-list as harmless forward-compat, with a comment. The gate was already correct (checks only 'finalized'). (2) MAJOR fixed (M2+M5 interplay): the questions CASE is reordered, fresh-pulse 'generating' first, then the two completed-questionnaire branches, THEN the stale-running 'attention' branch, so a finished questionnaire is never painted red by an abandoned legacy job; M2's one-time repair handles the data side. (3) Documents block now carries a LOAD-BEARING comment tying 'ready' to the M2 rider's started_at re-claim on re-analysis (without it the block could never re-reach 'ready' after a later upload). (4) Header additions: the appendix column list is marked as a subset of the real VM table; the partial-apply behavior when M1-M4 are missing is spelled out (CREATE VIEW fails atomically, only the idempotent staff policies land); the DROP+CREATE re-run contract is documented for future migrations. Unchanged and verified: appendix DDL against feat/technical-appendix (review_status draft/confirmed, generation_status generating/ready/error, unique session index), the three policy targets are owner-only today, the JWT-role service_role detection, the GREATEST NULL semantics, and the documented staff-visibility limits (no staff policy on session_documents; appendix staff policy is admin-only on the branch). The report block never derives 'confirmed' on purpose (there is no report sign-off). Could not be executed locally (no database, by design); desk-checked against verified DDL; run the in-file verification recipe on the VM after the first apply.

### Frontend changes
none

### types.ts delta
Two hand-edits in src/integrations/supabase/types.ts (apply together with the M1-M4 deltas to avoid clashing edits on the same file):

1. Replace the empty Views section (currently `Views: { [_ in never]: never }`, lines 1018-1020) with:

    Views: {
      atad2_dossier_blocks: {
        Row: {
          session_id: string
          documents_status: "empty" | "generating" | "in_progress" | "attention" | "ready" | "confirmed"
          questions_status: "empty" | "generating" | "in_progress" | "attention" | "ready" | "confirmed"
          structure_status: "empty" | "generating" | "in_progress" | "attention" | "ready" | "confirmed"
          appendix_status: "empty" | "generating" | "in_progress" | "attention" | "ready" | "confirmed"
          report_status: "empty" | "generating" | "in_progress" | "attention" | "ready" | "confirmed"
          docs_count: number
          last_doc_at: string | null
          prefill_job_status: string | null
          prefill_count: number
          open_unknown_count: number
          answers_count: number
          completed: boolean
          outcome_confirmed: boolean
          chart_status: string | null
          finalized_at: string | null
          appendix_generation_status: string | null
          appendix_review_status: string | null
          has_interim_report: boolean
          has_final_report: boolean
          report_generation_status: string | null
          inputs_changed_after_final: boolean
        }
        Relationships: []
      }
    }

2. In the Functions section (alphabetical, between can_modify_admin_role and has_role), add:

      final_report_gate: {
        Args: { p_session_id: string }
        Returns: Json
      }


# Resolution log
CONSOLIDATION RESULT. All five migration files now exist on disk on feat/client-platform (the drafting agents had only materialized M4/M5; M1-M3 existed solely as JSON because of a misread branch). A house-style deploy script, scripts/deploy-dossier-foundation.sh (90 KB, bash -n clean, five well-formed heredocs), was generated from the final files so the VM apply does not depend on a git pull.

BLOCKER RESOLVED (M3): the register's swarm feed would never have fired. The live pipeline (swarm prompt v8+, Rule 0; verified in supabase/migrations/20260524100000_swarm_prompt_v8.sql and supabase/functions/prefill-documents/analyze.ts:187) stores a cannot-answer as suggested_answer NULL + contextual_hint NOT NULL; the 'unknown' enum value only exists on pre-v8 rows. Trigger case A and backfill 8b now test (suggested_answer = 'unknown' OR (suggested_answer IS NULL AND contextual_hint IS NOT NULL)), with the dual representation documented at both sites.

MAJORS RESOLVED: (1) M5 structure block: replaced the nonexistent 'failed'/'stale' statuses with 'extraction_failed' (verified against src/lib/structure/types.ts ChartStatus); failed charts now derive 'attention' instead of being silently hidden as 'in_progress'. (2) M2+M5 interplay (every existing dossier would have shown Questions=attention and Documents never ready): M2 gained a one-time repair marking legacy frozen jobs completed (running status + NULL heartbeat + older than 1 hour + at least one prefill row; stage2_finished_at backfilled from the newest prefill row; jobs with zero prefill rows deliberately left as honest 'attention'), and M5's questions CASE was reordered so the completed-questionnaire branches outrank the stale-running attention branch (fresh-pulse 'generating' stays first). (3) M3 ordering hazard: a fail-fast preflight DO block is now the first statement; a misordered apply (M3 before M1) raises before anything commits, instead of installing a live trigger that breaks every answer save (plpgsql bodies are not validated at CREATE time and psql autocommits per statement). (4) The related M5 documents-never-ready-again finding is fixed in the M2 frontend rider: on re-analysis, when the job insert hits the duplicate, the existing row is re-claimed (status/started_at/stage2_finished_at/error_message/locked_at refreshed), which M5 documents as load-bearing.

MINORS FIXED: M1 clear-trigger carve-out tightened (a fresh sign-off in the same UPDATE is only honoured when the row stays Unknown), so the new CHECK constraint can never reject a legitimate answer-value change and the comment is now literally true; M1+M3 headers explicitly document the Assessment.tsx backtrack-delete as the deliberate not-covered write path; M3's log_open_question_event now accepts service-role callers via the request.jwt.claims role pattern (the service_role grant was dead code before) and the events table got the same REVOKE/GRANT belt-and-braces as M1's; M3 section 8 documents that a re-run converges (post-archive-reset sessions gain rows) rather than strictly no-ops; M4's assessment_log constraint drop+re-add was merged into one DO block (no window where event_type is unchecked, no strandable state), a lock note was added above the total_risk rewrite, and the deploy-gap description was corrected (a zero-row DELETE returns success, so the old Delete button would show a lying 'Report deleted' toast; the Archive rider must ship in the same frontend deploy as the M4 apply); M4's typesTsDelta now widens the atad2_assessment_log event_type literal union (verified at types.ts lines 92/112/132; the draft wrongly claimed it was plain string); M5 header gained the subset-columns caveat, the partial-apply behavior note, and the DROP+CREATE re-run contract; the header em-dash was removed.

NOT CHANGED, DELIBERATE (flag for the parent): M1's carve-out remains a documented deviation from the spec's unconditional clear-on-value-change rule (it preserves the stale-sign-off guarantee and enables a future one-statement confirm dialog; decide before the confirm-unknown UI slice). M3 keeps the two documented extensions (Yes/No also resolves confirmed_unknown rows; prefill-side trigger fail-soft vs answers-side fail-loud). M4 keeps the archive_report RPC instead of the literal frontend .update() (atad2_reports has no user UPDATE policy; a direct update would silently no-op, and granting one would let users rewrite delivered memos). M5's report block never derives 'confirmed' (no report sign-off exists).

Nothing was committed and nothing was applied to the VM. Workstation md5s of the final files (LF-normalized, what the VM's md5sum must show): M1 523899f297658704e29549e723cedf1d, M2 d508d98aea1b2649f490d578416c2323, M3 ee63f454d1663ed4f433b4353da1e1d8, M4 3173d166eaa7420dfbfc2701ccbc829f, M5 92b83ce8f333c3dd62d57e16a56dfb66.

# Apply instructions
PREREQS: Lennart activates his PIM role (VM rights) immediately before each step; a window expires after ~10-15 min. On any AuthorizationFailed mid-call: re-activate PIM and run the SAME command again (everything is idempotent). az lives at the full path below; Lennart is already logged in, no az login.

STEP 1 - Apply all five migrations on the VM (one command). The generated script scripts/deploy-dossier-foundation.sh (already on disk, built from the five final migration files) writes each migration to /tmp/dossier-foundation/ via heredoc, prints md5sums, applies them in M1..M5 order as supabase_admin with -v ON_ERROR_STOP=1, then runs read-only verification queries. From PowerShell:

  & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "@C:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\scripts\deploy-dossier-foundation.sh" --query "value[0].message" -o tsv

If the migration files are ever edited, regenerate the deploy script first (bash, from the repo root):
  FILES="20260610190100_answer_resolution_and_events.sql 20260610190200_prefill_job_heartbeat.sql 20260610190300_open_questions_register.sql 20260610190400_report_columns_and_rls_hardening.sql 20260610190500_dossier_blocks_view_and_final_gate.sql"; then re-run the generator used by the consolidator (writes heredocs with awk '{ sub(/\r$/,""); print }' per file, the md5 list, the five psql -q apply lines, and the VERIFY_EOF block) and re-print local md5s with: for f in $FILES; do awk '{ sub(/\r$/,"); print }' "supabase/migrations/$f" | md5sum; done

STEP 2 - md5 verification (house rule). In the run-command output, the section "=== md5sums on VM (compare against workstation values) ===" must show EXACTLY:
  523899f297658704e29549e723cedf1d  20260610190100_answer_resolution_and_events.sql
  d508d98aea1b2649f490d578416c2323  20260610190200_prefill_job_heartbeat.sql
  ee63f454d1663ed4f433b4353da1e1d8  20260610190300_open_questions_register.sql
  3173d166eaa7420dfbfc2701ccbc829f  20260610190400_report_columns_and_rls_hardening.sql
  92b83ce8f333c3dd62d57e16a56dfb66  20260610190500_dossier_blocks_view_and_final_gate.sql
Any mismatch: stop, regenerate the script from the repo files, run again (safe; nothing applied from a corrupted file would have passed ON_ERROR_STOP anyway).

STEP 3 - Read the verification output at the end of the same run. Expect: (a) three triggers on atad2_answers (trg_atad2_answers_clear_stale_confirmation, trg_atad2_answers_log, trg_atad2_answers_updated_at); (b) answers_missing_updated_at = 0 and preconfirmed_unknowns = 0; (c) exactly one SELECT, INSERT and UPDATE policy on atad2_prefill_jobs; (d) still_stuck_running_jobs only counts jobs with zero prefill rows; (e) all four to_regclass and all three to_regprocedure values non-NULL; (f) register_rows > 0 with from_swarm > 0 on a VM that has analyzed dossiers without live reports (the M3 blocker fix makes the swarm rows appear; 0 from_swarm on real data would mean the unknown-detection regressed); (g) the publication rows tell you whether realtime streams (FOR ALL TABLES, or register_in_publication = 1) or the UI must rely on refetch-on-focus. The M4 in-file verification DO block RAISEs loudly if the RLS hardening did not land; look for its "M4 verification passed" NOTICE. PIM died mid-run? Re-activate and re-run STEP 1; all five files are re-run safe (M3's backfill converges rather than no-ops, documented in the file).

STEP 4 - Frontend + types (ONE commit, only after STEP 1 succeeded, and pushed to main ONLY on Lennart's explicit request; main = live production): (1) all typesTsDelta edits from the five artifacts in src/integrations/supabase/types.ts (M1 answers/charts/answer_events, M2 prefill_jobs heartbeat_at, M3 open_questions tables + log_open_question_event, M4 reports columns + archive_report + widened assessment_log event_type union, M5 Views + final_report_gate); (2) the M1 rider in src/lib/structure/client.ts (finalized_by in finalizeChart/unfinalizeChart); (3) the M2 rider in src/hooks/usePrefill.ts (startJobHeartbeat helper + re-claim-on-duplicate + try/finally) and the one-liner in src/lib/prefill/types.ts; (4) the M4 rider in src/pages/ReportDetail.tsx (Delete becomes Archive via the archive_report RPC). IMPORTANT: do not leave a gap between applying M4 and deploying the ReportDetail rider; with the DELETE policy gone, the old Delete button silently does nothing while showing a success toast (documented in the M4 header). Run npm run build / tsc before asking to push. n8n needs no change (it inserts with the service key, unaffected by the hardening).

# Follow-up voor de hub-plak (vastgelegd bij eindcontrole 2026-06-10)

**MAJOR (latent, blokkeert dark-apply niet):** de `questions_status`-regel in
`atad2_dossier_blocks` zet 'attention' wanneer een voltooide swarm-job minder
prefill-rijen heeft dan er vragen zijn. De swarm laat echter bewust rijen
vallen (bad-lead-in / forbidden-phrase guards in
supabase/functions/prefill-documents/analyze.ts retourneren ok:false ZONDER
upsert en zonder failure-telling), dus een gezond dossier kan blijvend op
'attention' staan; opnieuw analyseren dropt deterministisch dezelfde rijen.
Onschadelijk zolang niets de view toont; FIX VEREIST vóór de hub-plak de view
gaat renderen. Opties: (a) analyze.ts laat bij een guard-drop een stub-rij
achter en de strenge telling blijft, of (b) de view tolereert een kleine
deficit. Voorkeur eindcontroleur: (a), want (b) maskeert echte partial
failures.
