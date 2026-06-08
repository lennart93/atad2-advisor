-- Appendix UX iteration. Apply on the VM as supabase_admin. Idempotent.
-- Adds `related_view` (none | popover | inline) for surfacing the associated-
-- enterprise data, drops the year from citations ("CIT Act 1969" -> "CIT Act"),
-- and sets row 1.2 (cross-border element) to a non-statutory "N/A" basis.

alter table public.atad2_appendix_skeleton add column if not exists related_view text not null default 'none';

update public.atad2_appendix_skeleton
set legal_basis = replace(legal_basis, 'CIT Act 1969', 'CIT Act')
where legal_basis like '%CIT Act 1969%';

update public.atad2_appendix_skeleton set legal_basis = 'N/A' where row_id = '1.2';

update public.atad2_appendix_skeleton set related_view = 'inline'  where row_id = '2.1';
update public.atad2_appendix_skeleton set related_view = 'popover' where row_id in ('6.1', '8.2');
