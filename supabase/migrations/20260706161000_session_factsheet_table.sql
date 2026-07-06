-- Factsheet-pipeline, part 1b: one merged fact sheet per session.
--
-- One row per session, written by the NEW build-factsheet edge function
-- (service role, async generation_status pattern copied from generate-appendix
-- / atad2_appendix). Every rebuild bumps version. prefill-documents re-runs
-- read this row and record which version they used (atad2_question_prefills.
-- factsheet_version). See the "Factsheet-pipeline" section in CLAUDE.md.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Re-runnable: CREATE TABLE / POLICY are IF NOT EXISTS or guarded.
--
-- session_id is TEXT (matches atad2_sessions PK), same note as the
-- atad2_document_facts migration.

create table if not exists public.atad2_session_factsheet (
  session_id text primary key references public.atad2_sessions(session_id) on delete cascade,
  factsheet jsonb,
  version int not null default 0,
  generation_status text not null default 'idle' check (generation_status in ('idle','generating','complete','error')),
  error text,
  source_document_ids uuid[],
  model text,
  prompt_version int,
  built_at timestamptz,
  -- created_at/updated_at added beyond the spec column list for parity with
  -- the other tables; harmless.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atad2_session_factsheet enable row level security;

-- RLS mirrors atad2_appendix: session owner full CRUD, admins read. Writes go
-- through the service role (edge function), which bypasses RLS.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_session_factsheet' and policyname='Users can view factsheet for their sessions') then
    create policy "Users can view factsheet for their sessions"
      on public.atad2_session_factsheet for select
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_session_factsheet.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_session_factsheet' and policyname='Users can create factsheet for their sessions') then
    create policy "Users can create factsheet for their sessions"
      on public.atad2_session_factsheet for insert
      with check (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_session_factsheet.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_session_factsheet' and policyname='Users can update factsheet for their sessions') then
    create policy "Users can update factsheet for their sessions"
      on public.atad2_session_factsheet for update
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_session_factsheet.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_session_factsheet' and policyname='Users can delete factsheet for their sessions') then
    create policy "Users can delete factsheet for their sessions"
      on public.atad2_session_factsheet for delete
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_session_factsheet.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_session_factsheet' and policyname='Admins can view all factsheets') then
    create policy "Admins can view all factsheets"
      on public.atad2_session_factsheet for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

notify pgrst, 'reload schema';
