# Slice 4 frontend-rider en toepas-instructies (gegenereerd)

## Artifact C: Frontend rider for Slice 4 (client folders). Exact before/after edits for src/pages/Assessment.tsx (?clientId= intake handling) and src/integrations/supabase/types.ts (atad2_clients block + client_id columns). Edit instructions only; nothing applied to the working tree. (src/pages/Assessment.tsx; src/integrations/supabase/types.ts)

# ARTIFACT C: FRONTEND RIDER (?clientId= intake + types.ts delta)

All edits are exact before/after pairs suitable for the Edit tool. Every OLD string was re-verified verbatim against the current working tree on 2026-06-10 (branch feat/client-platform). Edits marked [replace_all] intentionally match twice (Insert + Update blocks receive the identical addition); all other anchors match exactly once.

================================================================
FILE 1: src/pages/Assessment.tsx  (4 edits)
================================================================

--- EDIT 1.1: import useSearchParams (line 2) ---

OLD:
```
import { useNavigate } from "react-router-dom";
```

NEW:
```
import { useNavigate, useSearchParams } from "react-router-dom";
```

--- EDIT 1.2: read the param + holder state (after line 210) ---

OLD:
```
  const resumeSessionId = useAssessmentSessionId();

  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
```

NEW:
```
  const resumeSessionId = useAssessmentSessionId();

  // Optional ?clientId= from a client folder. When present and the client
  // belongs to the current user, the intake prefills the taxpayer name and
  // the new session is linked to that client. Without the param (or when
  // the lookup fails) the intake behaves exactly as it does today.
  const [searchParams] = useSearchParams();
  const intakeClientIdParam = searchParams.get("clientId");
  const [intakeClient, setIntakeClient] = useState<{ id: string; client_name: string } | null>(null);

  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
```

--- EDIT 1.3: client lookup effect (after the question-change effect, lines 253-255) ---

OLD:
```
  useEffect(() => {
    setCommittingExplanation(false);
  }, [currentQuestion?.question_id]);
```

NEW:
```
  useEffect(() => {
    setCommittingExplanation(false);
  }, [currentQuestion?.question_id]);

  // Resolve ?clientId= to a client folder owned by the current user. The
  // ownership filter runs in the query itself and RLS enforces it server-side.
  // Any error or missing row means "no client": the intake then behaves
  // exactly like the normal flow (fail soft, no toast). Skipped entirely in
  // resume mode (?session= present) because the intake form is not shown.
  useEffect(() => {
    if (!intakeClientIdParam || !user?.id || resumeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('atad2_clients')
          .select('id, client_name')
          .eq('id', intakeClientIdParam)
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          if (error) console.warn('Client prefill lookup failed:', error.message);
          return;
        }
        setIntakeClient({ id: data.id, client_name: data.client_name });
        // Prefill only while the field is still empty; never overwrite typing.
        setSessionInfo(prev =>
          prev.taxpayer_name ? prev : { ...prev, taxpayer_name: data.client_name }
        );
      } catch (err) {
        if (!cancelled) console.warn('Client prefill lookup failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [intakeClientIdParam, user?.id, resumeSessionId]);
```

--- EDIT 1.4: include client_id in the single session insert (lines 625-637) ---

OLD:
```
      const { error } = await supabase
        .from('atad2_sessions')
        .insert({
          session_id: newSessionId,
          user_id: user?.id || null,
          taxpayer_name: sessionInfo.taxpayer_name,
          fiscal_year: sessionInfo.tax_year,
          is_custom_period: sessionInfo.tax_year_not_equals_calendar,
          period_start_date: startDate,
          period_end_date: endDate,
          status: 'in_progress',
          completed: false
        });
```

NEW:
```
      const { error } = await supabase
        .from('atad2_sessions')
        .insert({
          session_id: newSessionId,
          user_id: user?.id || null,
          taxpayer_name: sessionInfo.taxpayer_name,
          fiscal_year: sessionInfo.tax_year,
          is_custom_period: sessionInfo.tax_year_not_equals_calendar,
          period_start_date: startDate,
          period_end_date: endDate,
          status: 'in_progress',
          completed: false,
          // Link the session to its client folder only when a validated
          // ?clientId= is present; otherwise the payload is unchanged.
          ...(intakeClient ? { client_id: intakeClient.id } : {})
        });
```

No-op guarantees when ?clientId= is absent: intakeClientIdParam is null, the effect returns on its first line, intakeClient stays null, the conditional spread adds nothing, so the insert payload is byte-identical to today. Fail-soft: an invalid or foreign clientId produces a PostgREST error or zero rows (RLS also blocks other users' clients); both paths log a console.warn and leave the flow untouched. The taxpayer_name input stays fully editable; editing it does not unlink the client. The database-side folder-ownership trigger (trg_atad2_sessions_client_owner, migration 20260610200100) independently rejects a cross-user client_id at insert time, so even a tampered request cannot file a session in someone else's folder.

================================================================
FILE 2: src/integrations/supabase/types.ts  (9 edits)
================================================================

House style notes applied: atad2_sessions and atad2_session_documents blocks are strictly alphabetical, so client_id is inserted at its alphabetical slot (client_id sorts before completed and before created_at). The atad2_assessment_log block follows migration column order, so client_id/client_name go right after session_id. The event_type union already contains 'interim_generated' and 'final_generated'; no change there.

--- EDIT 2.1: new atad2_clients block (between atad2_assessment_log and atad2_context_questions, line 195-196) ---

OLD:
```
        Relationships: []
      }
      atad2_context_questions: {
```

NEW:
```
        Relationships: []
      }
      atad2_clients: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          client_code: string | null
          client_name: string
          created_at: string
          id: string
          jurisdiction: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          client_code?: string | null
          client_name: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          client_code?: string | null
          client_name?: string
          created_at?: string
          id?: string
          jurisdiction?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      atad2_context_questions: {
```

--- EDIT 2.2: atad2_assessment_log Row (lines 136-138) ---

OLD:
```
          session_uuid: string
          session_id: string
          user_id: string | null
```

NEW:
```
          session_uuid: string
          session_id: string
          client_id: string | null
          client_name: string | null
          user_id: string | null
```

--- EDIT 2.3: atad2_assessment_log Insert (lines 156-158) ---

OLD:
```
          session_uuid: string
          session_id: string
          user_id?: string | null
```

NEW:
```
          session_uuid: string
          session_id: string
          client_id?: string | null
          client_name?: string | null
          user_id?: string | null
```

--- EDIT 2.4: atad2_assessment_log Update (lines 176-178) ---

OLD:
```
          session_uuid?: string
          session_id?: string
          user_id?: string | null
```

NEW:
```
          session_uuid?: string
          session_id?: string
          client_id?: string | null
          client_name?: string | null
          user_id?: string | null
```

--- EDIT 2.5: atad2_session_documents Row, add client_id and make session_id nullable (lines 590-604; two sub-edits) ---

EDIT 2.5a, OLD:
```
          category_source: string
          created_at: string
```
NEW:
```
          category_source: string
          client_id: string | null
          created_at: string
```

EDIT 2.5b, OLD:
```
          relevance_note: string | null
          session_id: string
          size_bytes: number
```
NEW:
```
          relevance_note: string | null
          session_id: string | null
          size_bytes: number
```

--- EDIT 2.6: atad2_session_documents Insert + Update, add client_id [replace_all] ---

OLD (matches exactly twice, lines 607 and 623; both get the identical addition):
```
          category_source?: string
          created_at?: string
```
NEW:
```
          category_source?: string
          client_id?: string | null
          created_at?: string
```

--- EDIT 2.7: atad2_session_documents Insert + Update session_id nullability (two sub-edits, distinct anchors) ---

EDIT 2.7a (Insert, line 615-617), OLD:
```
          relevance_note?: string | null
          session_id: string
          size_bytes: number
```
NEW:
```
          relevance_note?: string | null
          session_id?: string | null
          size_bytes: number
```

EDIT 2.7b (Update, line 631-633), OLD:
```
          relevance_note?: string | null
          session_id?: string
          size_bytes?: number
```
NEW:
```
          relevance_note?: string | null
          session_id?: string | null
          size_bytes?: number
```

--- EDIT 2.8: atad2_session_documents Relationships, add client FK (lines 637-646) ---

OLD:
```
        Relationships: [
          {
            foreignKeyName: "atad2_session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_reports: {
```

NEW:
```
        Relationships: [
          {
            foreignKeyName: "atad2_session_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "atad2_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atad2_session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_reports: {
```

--- EDIT 2.9: atad2_sessions, add client_id to Row/Insert/Update + Relationships (three sub-edits) ---

EDIT 2.9a (Row, lines 736-737), OLD:
```
          additional_context: string | null
          completed: boolean | null
```
NEW:
```
          additional_context: string | null
          client_id: string | null
          completed: boolean | null
```

EDIT 2.9b (Insert + Update, lines 765-766 and 794-795) [replace_all]:
OLD (matches exactly twice; the longer name suggested_additional_context at lines 395/412 is NOT followed by a completed line, verified, so it cannot match):
```
          additional_context?: string | null
          completed?: boolean | null
```
NEW:
```
          additional_context?: string | null
          client_id?: string | null
          completed?: boolean | null
```

EDIT 2.9c (Relationships, end of Update block lines 818-823), OLD:
```
          taxpayer_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      atad2_structure_charts: {
```
NEW:
```
          taxpayer_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atad2_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "atad2_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_structure_charts: {
```


### Notes
FINAL; edit instructions only, nothing applied to the working tree. All 13 anchors were re-verified against the current files in this session: line 2 import unique; setCommittingExplanation(false) occurs exactly once (line 254); the insert block ends exactly at line 637; types.ts line 196 holds atad2_context_questions (slot for edit 2.1); the assessment_log anchors match once each (lines 136-138, 156-158, 176-178, disambiguated by the ?-markers); the two [replace_all] edits match exactly twice each (2.6 at lines 607/623, 2.9b at lines 765/794; suggested_additional_context cannot false-match because its following line differs); types.ts contains ZERO pre-existing client_id/client_name occurrences (re-confirmed: the FACTS claim that assessment_log already had them in types.ts was wrong, edits 2.2-2.4 are required). The event_type union already includes interim_generated/final_generated and is correctly left alone. The Relationships FK names (atad2_sessions_client_id_fkey, atad2_session_documents_client_id_fkey) are the Postgres defaults that migration A's inline REFERENCES clauses generate. Behavior guarantees: with no ?clientId= the payload is byte-identical to today (param null, effect exits on first line, conditional spread adds nothing); invalid/foreign clientId fails soft (console.warn only, no toast); prefill never overwrites typing; resume mode skips the effect; and since the final migration A, ownership is ALSO enforced database-side by trg_atad2_sessions_client_owner, so the client-side check is no longer the only line of defense. Ordering constraints: apply both files in one commit (supabase.from('atad2_clients') needs the new types block to typecheck); the code can ship dark before migration A is applied, but do not hand out ?clientId= links until A is live on the VM (A's NOTIFY pgrst makes the new table queryable immediately after apply). No em-dashes, no new user-facing strings (comments and console.warn only).


# Resolution log
REVIEW RESOLUTION (slice 4, client folders; all findings from both lenses addressed):

1. MAJOR, artifact A, missing PostgREST schema reload: RESOLVED. Appended NOTIFY pgrst, 'reload schema'; as the final statement of 20260610200100, with a comment pointing at the house precedent (verified verbatim at supabase/migrations/20260610190500_dossier_blocks_view_and_final_gate.sql line 470). Without it the ?clientId= rider's atad2_clients lookup would fail soft against a stale schema cache and the feature would silently do nothing until a container restart. Header item 6 documents it. Idempotent; fires at commit under psql -1.

2. MINOR, artifact A, atad2_clients.user_id FK style: RESOLVED by switching to ON DELETE CASCADE, matching the house style for OWNER columns (atad2_sessions.user_id is CASCADE per 20250806174342; profiles/user_roles likewise), keeping NO ACTION only for the actor column archived_by (ON DELETE SET NULL, house actor style). Internally consistent: a user hard-delete cascades sessions and folders in the same statement, so the NO ACTION sessions.client_id FK is satisfied at end of statement. The comment records the one future edge: library documents (session_id NULL) have no cascade path and will protectively block a user delete once they exist. Safe to change now because the draft was never applied anywhere (file untracked, VM untouched).

3. MINOR, artifacts A+C, no database-side ownership check on atad2_sessions.client_id: RESOLVED with the stronger of the two suggested fixes. New SECURITY DEFINER function public.enforce_atad2_session_client_owner() + trigger trg_atad2_sessions_client_owner (BEFORE INSERT OR UPDATE OF client_id, user_id) raises when client_id is set and the folder's user_id IS DISTINCT FROM the session's user_id. Properties verified: immediate RETURN NEW when client_id IS NULL, so every existing flow (which never sets client_id) is byte-for-byte unaffected and the slice stays dark; NULL-owner sessions are rejected by IS DISTINCT FROM, matching the backfill's philosophy (assign an owner first); the 200200 backfill passes by construction (step 2 joins on s.user_id = c.user_id); admin updates that do not touch client_id/user_id never fire it; B's header documents the interplay. Verification 6k asserts function + trigger; the final NOTICE mentions the guard. C's notes updated: the client-side ownership check is now defense-in-depth, not the only line.

4. MINOR, artifact B header, phantom atad2_session_documents.updated_at: RESOLVED. Re-verified independently (grep across 20260423100000, 20260427150000, 20260525100000 and all other migrations touching the table: no updated_at column or trigger exists, the FACTS input was wrong). Header now states only step 2 bumps atad2_sessions.updated_at and that step 3 leaves no timestamp trace. SQL unchanged.

5. MINOR, artifact A, write-side client_id gap on session-scoped document rows: ACCEPTED per the finding's own verdict ("acceptable for this dark slice") and now explicitly documented in the section 3 policy comment, including the two concrete tightening options (owned-folder EXISTS in the session-scoped WITH CHECK, or a consistency trigger like the sessions guard) and the trigger point (the slice where the upload path starts writing document client_id).

INDEPENDENT RE-VERIFICATION done this session (not just trusting FINDINGS): both migration files exist untracked on branch feat/client-platform and now carry the fixes; dollar-quoting balanced (3 pairs at final lines 173/196, 308/367, 426/600); zero em-dashes in all three artifacts; NOTIFY house pattern confirmed in 190500; the slice 3 apply mechanics confirmed by reading scripts/deploy-dossier-foundation.sh (heredoc into /tmp + docker exec psql -q -1 -U supabase_admin -v ON_ERROR_STOP=1 + post-apply verification block); every artifact C anchor re-greppped against the working tree, including both [replace_all] anchors matching exactly twice (types.ts 607/623 and 765/794) and types.ts containing zero pre-existing client_id/client_name occurrences. Numbering 200100/200200 still collides with nothing (slice 3 = 190100..190500). All confirmations from both lenses (trigger-extension fidelity, storage policy additivity, CHECK validation safety, RLS mirrors, backfill idempotency, M5 drift-flag immunity, frontend no-op guarantee) remain valid; the only SQL-behavior change introduced by this resolution round is the new sessions ownership guard, which is a pure tightening that no existing write path can trip.

# Apply instructions
PREREQS (every VM step): Lennart activates his PIM role first; windows die after ~10-15 min. Use the full az path: & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd". Both migrations are idempotent: on AuthorizationFailed mid-run, re-activate PIM and run the same command again.

STEP 1: STRUCTURE MIGRATION A (may apply on the next PIM window; ships dark, zero user-visible change).
1a. Build the wrapper script (house pattern, modeled on scripts/deploy-dossier-foundation.sh), e.g. scripts/deploy-client-folders-structure.sh with LF line endings:
    #!/bin/bash
    set -e
    DB=$(docker ps --filter name=supabase-db -q | head -1)
    if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
    mkdir -p /tmp/client-folders
    cat > /tmp/client-folders/20260610200100_client_folders.sql <<'MIGRATION_EOF'
    <full content of supabase/migrations/20260610200100_client_folders.sql>
    MIGRATION_EOF
    md5sum /tmp/client-folders/*.sql
    echo "=== APPLYING 20260610200100_client_folders.sql ==="
    docker exec -i "$DB" psql -q -1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/client-folders/20260610200100_client_folders.sql
    echo "=== DONE: client folders structure applied ==="
    (Quoted heredoc <<'MIGRATION_EOF' is required: the SQL contains $$ blocks. The file contains no line reading MIGRATION_EOF, verified.)
1b. Run from the workstation (PowerShell):
    & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "@scripts/deploy-client-folders-structure.sh" --query "value[0].message" -o tsv
1c. Success criterion in the output: the NOTICE "slice 4 structure verification passed: ..." and the DONE echo. The in-file DO block already asserts all policies, columns, FKs, triggers and indexes, so no separate verification pass is needed; psql -1 means a failed run applied nothing.
1d. After A is live, update src/integrations/supabase/types.ts per artifact C (edits 2.1-2.9) and apply the Assessment.tsx rider (edits 1.1-1.4) in ONE commit (the types block is needed for the new code to typecheck). Run npm run build locally to confirm. Per house rules: commit/push ONLY on explicit request; push to main deploys production via GitHub Actions. The code is a no-op without ?clientId=, so it may also ship before the workspace UI exists; just do not hand out ?clientId= links before A is applied.

STEP 2: BACKFILL B (ONLY after the product owner approves the folder list).
2a. GATE: the owner reviews and approves the 17-folder preview (scripts/client_dedup_preview.sh output; variants like "Kynexis B.V. " vs "Kynexis BV" and "Orchestra Only BV" vs "Orchestra Only BV (Juist)" stay separate folders by design). Do NOT run B before this approval.
2b. Build scripts/deploy-client-folders-backfill.sh with the identical wrapper skeleton, heredoc-ing supabase/migrations/20260610200200_client_folders_backfill.sql, and run it with the same az command (swap the script path).
2c. Read the output: it prints the full folder list (user_id | email | "client_name": N session(s)) as NOTICEs, then either "Backfill verified: every session has a client_id." (success) or an EXCEPTION naming the orphan sessions. On the exception, psql -1 rolled EVERYTHING back: fix the listed sessions' ownership (typically user_id IS NULL rows), then re-run the same script. Note: az run-command truncates long output (~4KB per stream); if the folder list is cut off, re-fetch it read-only with a small script running: docker exec -i "$DB" psql -U supabase_admin -d postgres -c "SELECT c.user_id, c.client_name, count(s.id) FROM atad2_clients c LEFT JOIN atad2_sessions s ON s.client_id = c.id GROUP BY c.id, c.user_id, c.client_name ORDER BY c.client_name;"
2d. B is re-run safe: a second run inserts and updates zero rows and ends in "Backfill verified".

ORDER SUMMARY: A (next PIM window) -> frontend rider C committed/pushed on explicit request -> owner approves folder list -> B. B's preflight block hard-fails if A is missing, so the order cannot be violated silently. Both migration files already sit at supabase/migrations/20260610200100_client_folders.sql and 20260610200200_client_folders_backfill.sql in the working tree (untracked); include them in the same commit as the frontend rider so the repo mirrors the VM.
