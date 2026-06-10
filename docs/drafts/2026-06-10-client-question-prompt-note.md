# DRAFT: client_question for the open-questions register

**Status: DRAFT, NOT BUILT, NOT APPLIED.** This note and its companion
`docs/drafts/2026-06-10-open-questions-client-question.draft.sql` describe the
change-set that fills `atad2_open_questions.client_question` with an
AI-written, client-friendly question. Slice 5 shipped the UI with a fallback
(official question text, then a fixed sentence), so nothing breaks while this
stays a draft. These files live under `docs/drafts/` on purpose: nothing here
may land in `supabase/migrations/` or `supabase/functions/` until the whole
set ships together, otherwise the VM deploy loop would apply the prompt
against a parser and schema that cannot carry the field.

## What changes, where

### 1. Edge function: one-line zod change (plus the upsert field)

`supabase/functions/prefill-documents/schemas.ts`, inside `SwarmPrefillRaw`
(after `suggested_toelichting_unknown`):

```ts
// v12: Route B companion. One plain client-friendly question (<=300 chars)
// the advisor can forward to the client as-is. Old prompt versions never
// emit it; nullish().default(null) keeps them parseable.
client_question: z.string().max(300).nullish().default(null),
```

`nullish().default(null)` is the load-bearing part: prompt v11 and earlier
never emit the key, so the schema must default it instead of rejecting, and
a model emitting an explicit `null` must also pass. The existing `transform`
that clears Route B companions when `suggested_toelichting` is populated
should also null `client_question` (same defensive line that already handles
`suggested_toelichting_unknown`).

`supabase/functions/prefill-documents/analyze.ts`, in the upsert to
`atad2_question_prefills` (next to `suggested_toelichting_unknown`):

```ts
client_question: truncate(parsed.client_question, 300),
```

### 2. Where the register trigger picks it up

`sync_open_questions_from_prefill`
(`supabase/migrations/20260610190300_open_questions_register.sql`, section 5)
fires on every swarm upsert to `atad2_question_prefills`. Its CASE A (the
unknown-suggestion route) inserts or wording-refreshes the register row; the
in-file comment "When the swarm prompt gains client_question (slice 5),
extend this SET (and the VALUES above) with it" marks the exact spot.
The extension (full diff in section 2b of the draft .sql):

- add `client_question` to the INSERT columns and `NEW.client_question` to
  the VALUES;
- add `client_question = COALESCE(EXCLUDED.client_question,
  atad2_open_questions.client_question)` to the ON CONFLICT SET, so a
  re-analysis from an older prompt (null) never wipes an existing wording;
- the SET keeps its `status IN ('open','taken_to_client')` guard, so rows
  the advisor already answered or resolved are never rewritten.

This needs a landing column first:
`ALTER TABLE public.atad2_question_prefills ADD COLUMN IF NOT EXISTS
client_question text` (with a `<= 300` length CHECK; see draft .sql 2a),
plus the matching manual edit to the `atad2_question_prefills` Row/Insert/
Update interfaces in `src/integrations/supabase/types.ts` (no Supabase CLI
against the self-hosted instance).

### 3. Frontend

No change. `resolveClientQuestion` (`src/lib/openQuestions/grouping.ts`)
already prefers `client_question`, then the official question text, then the
fixed sentence. The panel, sheet, stream, exports and the re-check document
all resolve through it, so the new wording appears everywhere at once.

## Rollout order

1. **Schema migration first**: the `atad2_question_prefills.client_question`
   column and the register-trigger extension (draft .sql section 2). Inert on
   its own: nothing writes the column yet.
2. **Edge function next** (zod + upsert, section 1 above). Deploy via rsync to
   `/root/supabase-docker/volumes/functions/prefill-documents/` and restart
   the `supabase-edge-functions` container; verify with the md5sum check from
   CLAUDE.md. Still inert: the active prompt (v11) never emits the field, and
   the zod default keeps every old response parseable.
3. **Prompt migration last** (draft .sql section 1, swarm v12). Only now does
   the model start emitting `client_question`; the parser, the column and the
   trigger are already in place to carry it into the register.

Applying the prompt before steps 1-2 would not crash v11 parsing (zod strips
unknown keys), but every `client_question` the model writes would be silently
dropped, and after the zod change but before the column, every Route B upsert
would fail on the missing column. Hence: schema, then function, then prompt.
