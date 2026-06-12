-- Part A facts block on the appendix. Apply on the VM as supabase_admin. Idempotent.
alter table public.atad2_appendix add column if not exists facts jsonb;
