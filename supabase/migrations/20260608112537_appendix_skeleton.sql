-- atad2_appendix_skeleton: the editable legal-framework rows (the rechtskader).
-- Seeded from src/lib/appendix/skeleton.ts. Admin edits text/structure; the wiring
-- fields (driven_by_question_ids, render_if, flags) are set by the seed and not
-- exposed in the admin edit UI. Apply on the VM as supabase_admin.

create table if not exists public.atad2_appendix_skeleton (
  id uuid primary key default gen_random_uuid(),
  row_id text not null unique,
  section_id text not null,
  section_title text not null,
  legal_framework text not null,
  effect text,
  allowed_states jsonb not null default '[]'::jsonb,
  driven_by_question_ids jsonb not null default '[]'::jsonb,
  render_if jsonb,
  flags jsonb,
  sort_order int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atad2_appendix_skeleton enable row level security;

create policy "Authenticated can read appendix skeleton"
  on public.atad2_appendix_skeleton for select
  using (auth.uid() is not null);

create policy "Admins manage appendix skeleton"
  on public.atad2_appendix_skeleton for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.atad2_appendix_skeleton
  (row_id, section_id, section_title, legal_framework, effect, allowed_states, driven_by_question_ids, render_if, flags, sort_order)
values
  ('0.1', '0', 'Gateway and scope (art. 2 / art. 3; art. 12ac)', 'Article 2(1) / Article 3 Wet Vpb 1969, subject to Dutch CIT (resident, or non-resident with a Dutch permanent establishment)', null, '["Yes","No","Further information needed"]'::jsonb, '["Q1","Q2"]'::jsonb, null, null, 0),
  ('0.2', '0', 'Gateway and scope (art. 2 / art. 3; art. 12ac)', 'Cross-border element present', null, '["Yes","No","Further information needed"]'::jsonb, '["Q3"]'::jsonb, null, null, 1),
  ('0.3', '0', 'Gateway and scope (art. 2 / art. 3; art. 12ac)', 'Article 12ac jo. Article 10a(6) Wet Vpb 1969, related party (broad associated-enterprise test) or structured arrangement', null, '["Yes","No","Further information needed"]'::jsonb, '["Q28"]'::jsonb, null, null, 2),
  ('0.4', '0', 'Gateway and scope (art. 2 / art. 3; art. 12ac)', 'Financial year starting on or after 1 Jan 2020 (Article 12ag in force)', null, '["Yes","No"]'::jsonb, '[]'::jsonb, null, null, 3),
  ('1.a', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(a) Wet Vpb 1969, hybrid financial instrument or hybrid transfer', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q30","Q8","Q11"]'::jsonb, null, null, 4),
  ('1.b', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(b) Wet Vpb 1969, payment to a hybrid entity', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q26","Q27"]'::jsonb, null, null, 5),
  ('1.c', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(c) Wet Vpb 1969, payment to an entity with permanent establishment(s), allocation conflict', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q12","Q13","Q14"]'::jsonb, null, null, 6),
  ('1.d', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(d) Wet Vpb 1969, disregarded permanent establishment', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q14","Q18b"]'::jsonb, null, null, 7),
  ('1.e', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(e) Wet Vpb 1969, payment by a hybrid entity (disregarded payment)', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q26","Q27"]'::jsonb, null, null, 8),
  ('1.f', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment between head office and PE', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q20b","Q21b"]'::jsonb, null, null, 9),
  ('1.g', '1', 'Mismatch categories, art. 12aa(1)(a)-(g)', 'Article 12aa(1)(g) Wet Vpb 1969, double deduction', 'DD', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q19","Q4c","Q4d"]'::jsonb, null, '["contested"]'::jsonb, 10),
  ('1bis.1', '1bis', 'Non-resident taxpayer with a Dutch PE, art. 3', 'Foreign head office inside or outside the EU', null, '["Yes","No","Further information needed"]'::jsonb, '["Q31"]'::jsonb, '{"questionId":"Q2","equals":"Yes"}'::jsonb, null, 11),
  ('1bis.2', '1bis', 'Non-resident taxpayer with a Dutch PE, art. 3', 'Article 12aa(1)(g) Wet Vpb 1969, double deduction at head office and Dutch PE', 'DD', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q32"]'::jsonb, '{"questionId":"Q2","equals":"Yes"}'::jsonb, null, 12),
  ('1bis.3', '1bis', 'Non-resident taxpayer with a Dutch PE, art. 3', 'Article 12aa(1)(f) Wet Vpb 1969, deemed payment to the Dutch PE, included abroad or not', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q33","Q34"]'::jsonb, '{"questionId":"Q2","equals":"Yes"}'::jsonb, null, 13),
  ('1bis.4', '1bis', 'Non-resident taxpayer with a Dutch PE, art. 3', 'Article 12aa(1)(f) Wet Vpb 1969, non-EU PE makes a deemed payment to the Dutch PE', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q35"]'::jsonb, '{"questionId":"Q2","equals":"Yes"}'::jsonb, null, 14),
  ('2.1', '2', 'Secondary inclusion rule, art. 12ab', 'Article 12ab(1) jo. (3) Wet Vpb 1969, NL as recipient state includes income where the payer state does not deny the deduction, only for an art. 12aa(1)(a), (b), (c), (e) or (f) mismatch (never d, never g)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 15),
  ('3.1', '3', 'Definitions and scope, art. 12ac', 'Article 12ac Wet Vpb 1969, associated-enterprise / related-party test met (broad: holdings up/down/sister, consolidated group, significant influence, acting together; 25%, raised to 50% for hybrid-entity cases)', null, '["Yes","No","Further information needed"]'::jsonb, '["Q28"]'::jsonb, null, null, 16),
  ('3.2', '3', 'Definitions and scope, art. 12ac', 'Article 12ac Wet Vpb 1969, structured arrangement', null, '["Yes","No","Further information needed"]'::jsonb, '["Q28"]'::jsonb, null, null, 17),
  ('3.3', '3', 'Definitions and scope, art. 12ac', 'Qualification under Dutch standards (FKR comparison method, from 1 Jan 2025)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 18),
  ('3.4', '3', 'Definitions and scope, art. 12ac', 'Dual-inclusion income present', null, '["Yes","No","Further information needed"]'::jsonb, '["Q4d","Q11","Q25"]'::jsonb, null, null, 19),
  ('4.1', '4', 'Imported mismatches, art. 12ad', 'Article 12ad Wet Vpb 1969, NL payment to a related party or under a structured arrangement', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q5","Q28"]'::jsonb, null, null, 20),
  ('4.2', '4', 'Imported mismatches, art. 12ad', 'Article 12ad Wet Vpb 1969, hybrid mismatch (DD or D/NI) elsewhere in the financing chain', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q9","Q10"]'::jsonb, null, null, 21),
  ('4.3', '4', 'Imported mismatches, art. 12ad', 'Article 12ad Wet Vpb 1969, the NL payment funds that foreign cost (direct/indirect, back-to-back)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q9","Q10"]'::jsonb, null, null, 22),
  ('4.4', '4', 'Imported mismatches, art. 12ad', 'Article 12ad(2) Wet Vpb 1969, mismatch not neutralised in any foreign state (carve-out)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q11"]'::jsonb, null, null, 23),
  ('4.5', '4', 'Imported mismatches, art. 12ad', 'Article 12aa/12ab Wet Vpb 1969, already neutralised in NL on the same payment', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 24),
  ('5A.1', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), a related participant treats the NL taxpayer as transparent (classification conflict)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q4"]'::jsonb, null, '["unverified"]'::jsonb, 25),
  ('5A.2', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), deductible payment to that holder, not in its tax base', 'D/NI', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q4b"]'::jsonb, null, null, 26),
  ('5A.3', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), costs, charges or losses also deducted in the holder state', 'DD', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q4c"]'::jsonb, null, null, 27),
  ('5A.4', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), set off against dual-inclusion income', null, '["Yes","No","Further information needed"]'::jsonb, '["Q4d"]'::jsonb, null, null, 28),
  ('5A.5', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), 50% or more of votes, capital or profit held, directly or indirectly, by related parties (the reverse-hybrid test)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q4"]'::jsonb, null, null, 29),
  ('5A.6', '5A', 'Reverse hybrid, art. 2 (verify live lid)', 'Article 2 Wet Vpb 1969 (verify live lid), UCITS/AIF exception, or former open CV whose CIT liability lapsed on 1 Jan 2025 (Wet FKR)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 30),
  ('5B.1', '5B', 'Dual residence, art. 12ae', 'Article 12ae Wet Vpb 1969, dual tax residence (the NL taxpayer is also resident elsewhere)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q29"]'::jsonb, null, null, 31),
  ('5B.2', '5B', 'Dual residence, art. 12ae', 'Article 12ae Wet Vpb 1969, same remunerations, payments, charges or losses deducted in both states', 'DD', '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '["Q29"]'::jsonb, null, null, 32),
  ('5B.3', '5B', 'Dual residence, art. 12ae', 'Article 12ae Wet Vpb 1969, set off against dual-inclusion income', null, '["Yes","No","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 33),
  ('5B.4', '5B', 'Dual residence, art. 12ae', 'Article 12ae(2) Wet Vpb 1969, for an EU Member State the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 34),
  ('6.1', '6', 'Carry-forward of denied deductions, art. 12af', 'Article 12af Wet Vpb 1969, earlier-year denial under 12aa(1)(e)/(f)/(g), 12ae, or inclusion under 12ab(1)', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, '["unverified"]'::jsonb, 35),
  ('6.2', '6', 'Carry-forward of denied deductions, art. 12af', 'Article 12af Wet Vpb 1969, dual-inclusion income in a later year than the denial', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 36),
  ('7.1', '7', 'Documentation obligation, art. 12ag', 'Article 12ag(1) Wet Vpb 1969, within Section 2.2a, financial year from 1 Jan 2020', null, '["Yes","No"]'::jsonb, '["Q1","Q2"]'::jsonb, null, null, 37),
  ('7.2', '7', 'Documentation obligation, art. 12ag', 'Article 12ag Wet Vpb 1969, inventory per remuneration, payment, deemed payment, charge or loss', null, '["Further information needed","Not applicable"]'::jsonb, '[]'::jsonb, null, null, 38),
  ('7.3', '7', 'Documentation obligation, art. 12ag', 'Article 12ag Wet Vpb 1969, records show, per item, to what extent and how Section 2.2a applies', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 39),
  ('7.4', '7', 'Documentation obligation, art. 12ag', 'Article 12ag Wet Vpb 1969, where a correction is applied, its computation is in the file', null, '["Not applicable","Potentially applicable","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 40),
  ('7.5', '7', 'Documentation obligation, art. 12ag', 'Article 12ag Wet Vpb 1969, file producible on request', null, '["Yes","Further information needed"]'::jsonb, '[]'::jsonb, null, null, 41),
  ('7.6', '7', 'Documentation obligation, art. 12ag', 'Article 12ag(3) Wet Vpb 1969, checked for a ministerial regulation with extra data fields', null, '["Yes","Further information needed"]'::jsonb, '[]'::jsonb, null, '["unverified"]'::jsonb, 42)
on conflict (row_id) do nothing;
