-- Remove row 3.3 (FKR qualification) and all of section 7 (art. 12ag documentation)
-- from the appendix legal framework. Apply on the VM as supabase_admin.
delete from public.atad2_appendix_skeleton
where row_id in ('3.3', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6');
