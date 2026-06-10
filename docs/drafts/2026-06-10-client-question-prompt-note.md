# Deploy runbook: client_question for the open-questions register

**Status: READY TO DEPLOY. Built in slice 6, waiting on a PIM window.**

Everything in this change-set is committed in the repo; nothing is applied on
the VM yet. The set fills `atad2_open_questions.client_question` with an
AI-written, ready-to-send client question (1-2 "We understand that ..."
sentences grounded strictly in the dossier documents, then one "Could you
please confirm/clarify ..." ask, max 450 characters). Until it is deployed,
the UI keeps the slice-5 fallback (official question text plus the fixed
sentence) and the "Prepare client questions" button stays disabled with an
honest hint, because the gating RPC does not exist yet.

The companion draft SQL that used to sit next to this note
(`2026-06-10-open-questions-client-question.draft.sql`, the old 300-char
single-question variant) has been deleted; it is fully superseded by the two
real migrations below. Do not resurrect it from git history.

## One-shot script

`deploy_client_question_v12.sh` at the repo root performs all four steps in
order on the VM:

```bash
az vm run-command invoke \
  --resource-group rg-atad2-prod --name adn-x-s-5 \
  --command-id RunShellScript --scripts @deploy_client_question_v12.sh \
  --query "value[0].message" -o tsv
```

From Windows PowerShell use the full `az.cmd` path and
`--scripts "@<absolute path>"` (see CLAUDE.md, section "Deployment naar
self-hosted Supabase"). PIM must be active; every step is idempotent, so if a
PIM window expires mid-run, re-activate and run the whole script again.

## Apply order (what the script does)

**STEP 1: apply `supabase/migrations/20260610210000_open_question_events_check_widening.sql`**

Widens the event-vocabulary CHECK on `atad2_open_question_events` with
`confirmed_unknown`, `dismissed` and the slice-6 `undismissed` (Restore on a
dismissed row). The UI already fires these events and `logEvent` swallows the
CHECK failures until this lands, so this step only starts recording them.
Order-independent from the rest; it goes first so nothing is forgotten.

**STEP 2: apply `supabase/migrations/20260610220000_prefill_client_question_column.sql`**

Three things in one re-runnable file:

- landing column `atad2_question_prefills.client_question` (CHECK <= 450);
- the register trigger `sync_open_questions_from_prefill` re-issued in full
  with the `client_question` pickup: CASE A copies it into
  `atad2_open_questions`, and the wording refresh COALESCEs so a re-analysis
  under an older prompt (which emits NULL) never wipes existing wording;
- SECURITY DEFINER RPC `get_active_prompt_version`, which gates the
  "Prepare client questions" button (`atad2_prompts` SELECT is admin-only,
  so the client cannot read the live version any other way).

Inert on its own: nothing writes the column yet.

**STEP 3: redeploy the `prefill-documents` edge function (BETWEEN the two migrations)**

```bash
rsync -av --delete /root/atad2-advisor/supabase/functions/prefill-documents/ \
  /root/supabase-docker/volumes/functions/prefill-documents/
docker restart supabase-edge-functions
```

DASH path (`/root/supabase-docker/...`), NOT the slash shadow folder; verify
the mount source first per CLAUDE.md. Then confirm `analyze.ts` and
`schemas.ts` md5-match between
`/root/atad2-advisor/supabase/functions/prefill-documents/` on the host and
`/home/deno/functions/prefill-documents/` inside the container. Still inert:
the active prompt (v11) never emits the field, and the zod
`nullish().default(null)` keeps every old response parseable.

**STEP 4: apply `supabase/migrations/20260610220100_swarm_prompt_v12_client_question.sql`**

Deactivates swarm prompt v11 and inserts v12 (WHERE NOT EXISTS guarded, so a
rerun is safe). Only now does the model start emitting `client_question`; the
column, trigger, parser and RPC are already in place to carry it into the
register.

## Why this order

Applying the prompt before steps 2-3 would not crash v11 parsing (zod strips
unknown keys), but every `client_question` the model writes would be silently
dropped; after the zod change but before the column exists, every Route B
upsert would fail on the missing column; and after the column but before the
edge-function change, the field would never flow into the register. Hence:
schema, then function, then prompt, with the edge-function rsync strictly
between the two migrations.

## After the deploy

- The "Prepare client questions" button in the open-questions panel unlocks
  by itself: `get_active_prompt_version('prefill_swarm_system')` starts
  returning 12, which meets `CLIENT_QUESTION_PROMPT_VERSION` in
  `src/hooks/usePrepareClientQuestions.ts`. No frontend deploy is needed.
- Existing dossiers (where `client_question` is NULL everywhere): the advisor
  clicks "Prepare client questions"; it re-runs `analyze_one` for the open
  rows without wording, the trigger copies the fresh wording into still-open
  register rows, and realtime streams it into the panel.
- New swarm runs (fresh uploads / full prefill) write `client_question`
  automatically on every Route B row.

Reminder: run all psql as `supabase_admin`, not `postgres` (table ownership,
see CLAUDE.md). The deploy script already does.
