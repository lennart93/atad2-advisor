-- Technical appendix storage: one current appendix per session + an append-only edit log.
-- RLS mirrors the atad2_answers pattern (session owner via EXISTS join + admin via has_role).
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.

create table if not exists public.atad2_appendix (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.atad2_sessions(session_id) on delete cascade,
  review_status text not null default 'draft' check (review_status in ('draft','confirmed')),
  generation_status text not null default 'generating' check (generation_status in ('generating','ready','error')),
  rows jsonb not null default '[]'::jsonb,
  model text,
  prompt_version int,
  error_message text,
  generated_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one current appendix per session
create unique index if not exists atad2_appendix_session_uniq on public.atad2_appendix(session_id);

create table if not exists public.atad2_appendix_edits (
  id uuid primary key default gen_random_uuid(),
  appendix_id uuid not null references public.atad2_appendix(id) on delete cascade,
  row_id text not null,
  field text not null check (field in ('decision','reasoning','reference')),
  old_value text,
  new_value text,
  edited_by uuid references auth.users(id),
  edited_at timestamptz not null default now()
);

create index if not exists atad2_appendix_edits_appendix on public.atad2_appendix_edits(appendix_id);

alter table public.atad2_appendix enable row level security;
alter table public.atad2_appendix_edits enable row level security;

-- ---- atad2_appendix policies (session owner) ----
create policy "Users can view appendix for their sessions"
  on public.atad2_appendix for select
  using (exists (
    select 1 from public.atad2_sessions
    where atad2_sessions.session_id = atad2_appendix.session_id
      and atad2_sessions.user_id = auth.uid()
  ));

create policy "Users can create appendix for their sessions"
  on public.atad2_appendix for insert
  with check (exists (
    select 1 from public.atad2_sessions
    where atad2_sessions.session_id = atad2_appendix.session_id
      and atad2_sessions.user_id = auth.uid()
  ));

create policy "Users can update appendix for their sessions"
  on public.atad2_appendix for update
  using (exists (
    select 1 from public.atad2_sessions
    where atad2_sessions.session_id = atad2_appendix.session_id
      and atad2_sessions.user_id = auth.uid()
  ));

create policy "Users can delete appendix for their sessions"
  on public.atad2_appendix for delete
  using (exists (
    select 1 from public.atad2_sessions
    where atad2_sessions.session_id = atad2_appendix.session_id
      and atad2_sessions.user_id = auth.uid()
  ));

create policy "Admins can view all appendix"
  on public.atad2_appendix for select
  using (public.has_role(auth.uid(), 'admin'));

-- ---- atad2_appendix_edits policies (session owner via appendix join) ----
create policy "Users can view appendix edits for their sessions"
  on public.atad2_appendix_edits for select
  using (exists (
    select 1 from public.atad2_appendix a
    join public.atad2_sessions s on s.session_id = a.session_id
    where a.id = atad2_appendix_edits.appendix_id and s.user_id = auth.uid()
  ));

create policy "Users can create appendix edits for their sessions"
  on public.atad2_appendix_edits for insert
  with check (exists (
    select 1 from public.atad2_appendix a
    join public.atad2_sessions s on s.session_id = a.session_id
    where a.id = atad2_appendix_edits.appendix_id and s.user_id = auth.uid()
  ));

create policy "Admins can view all appendix edits"
  on public.atad2_appendix_edits for select
  using (public.has_role(auth.uid(), 'admin'));
