-- Part of slice 5: widens the event vocabulary for atad2_open_question_events
-- with 'confirmed_unknown' and 'dismissed' -- actions that record a judgement,
-- not just a transport event (export / clipboard / send / recheck).
-- Slice 6 adds 'undismissed' (Restore on a dismissed row) to the same list;
-- this file was still unapplied on the VM, so it is extended in place.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS, ADD CONSTRAINT IF NOT EXISTS
-- (emulated via DO block), and the verification DO block at the end.
-- Run as supabase_admin via az vm run-command with psql -1 -v ON_ERROR_STOP=1.

ALTER TABLE public.atad2_open_question_events
  DROP CONSTRAINT IF EXISTS atad2_open_question_events_event_check;

ALTER TABLE public.atad2_open_question_events
  ADD CONSTRAINT atad2_open_question_events_event_check CHECK (event IN (
    'exported',           -- row included in a Word export that downloaded successfully
    'copied',             -- row included in a successful "Copy as text"
    'answer_saved',       -- advisor saved "What did the client say?"
    'marked_sent',        -- per-row "Mark as sent to client"
    'recheck_started',    -- "Re-check with AI" fired for this question
    'confirmed_unknown',  -- advisor confirmed "keep as unknown" for this question
    'dismissed',          -- advisor marked the question as not relevant
    'undismissed'         -- advisor restored a dismissed question back to open
  ));

-- Verification: fail loudly if the constraint did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'atad2_open_question_events_event_check'
      AND conrelid = 'public.atad2_open_question_events'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint atad2_open_question_events_event_check not found after ALTER; migration did not apply correctly.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
