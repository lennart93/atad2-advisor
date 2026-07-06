-- Factsheet-pipeline, part 1a: per-document extracted facts.
--
-- One row per uploaded document, written by the NEW extract-docfacts edge
-- function (service role) during upload. build-factsheet later merges all
-- rows of a session into atad2_session_factsheet. See the "Factsheet-pipeline"
-- section in CLAUDE.md for the deploy order.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Re-runnable: CREATE TABLE / INDEX / POLICY are all IF NOT EXISTS or guarded.
--
-- NOTE ON session_id TYPE: the spec sketch says `uuid`, but atad2_sessions'
-- primary key session_id is TEXT (see atad2_session_documents,
-- atad2_appendix). We follow the live schema, so session_id is text here too.

create table if not exists public.atad2_document_facts (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.atad2_sessions(session_id) on delete cascade,
  -- unique + FK: exactly one facts row per document, gone when the document is
  -- deleted (mirrors atad2_document_summaries' on delete cascade).
  document_id uuid not null unique references public.atad2_session_documents(id) on delete cascade,
  facts jsonb,
  status text not null default 'pending' check (status in ('pending','complete','error')),
  error text,
  model text,
  prompt_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_facts_session on public.atad2_document_facts(session_id);

alter table public.atad2_document_facts enable row level security;

-- RLS mirrors atad2_session_documents / atad2_appendix: session owner has full
-- CRUD; admins can read. Actual writes go through the service role (edge
-- function), which bypasses RLS.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_document_facts' and policyname='Users can view document facts for their sessions') then
    create policy "Users can view document facts for their sessions"
      on public.atad2_document_facts for select
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_document_facts.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_document_facts' and policyname='Users can create document facts for their sessions') then
    create policy "Users can create document facts for their sessions"
      on public.atad2_document_facts for insert
      with check (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_document_facts.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_document_facts' and policyname='Users can update document facts for their sessions') then
    create policy "Users can update document facts for their sessions"
      on public.atad2_document_facts for update
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_document_facts.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_document_facts' and policyname='Users can delete document facts for their sessions') then
    create policy "Users can delete document facts for their sessions"
      on public.atad2_document_facts for delete
      using (exists (
        select 1 from public.atad2_sessions
        where atad2_sessions.session_id = atad2_document_facts.session_id
          and atad2_sessions.user_id = auth.uid()
      ));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='atad2_document_facts' and policyname='Admins can view all document facts') then
    create policy "Admins can view all document facts"
      on public.atad2_document_facts for select
      using (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;

notify pgrst, 'reload schema';
