-- Bump every active prompt to the current best model in its tier, keeping the
-- quality > speed > price priority:
--
--   * Opus 4.7 -> Opus 4.8: same price ($5/$25), strictly better, identical API
--     surface (no breaking change). These rows drive the actual runtime model
--     for the prefill/stage1/stage2/swarm/compose calls, which load `model`
--     from this table at runtime (prefill-documents/prompts.ts -> callOpus).
--
--   * Sonnet 4.6 -> Sonnet 5: same price tier, near-Opus quality. For the
--     appendix + structure prompts this column is only a LABEL: the real model
--     for those runs is hardcoded in the edge functions (generate-appendix and
--     extract-structure claude.ts), which are being moved to Sonnet 5 in the
--     same change. Updating the label keeps the stored generation metadata
--     honest.
--
-- Scoped to is_active rows so historical versions keep their original label.
--
-- NOT covered by this migration (set elsewhere, must be changed by hand):
--   * The memo itself runs through the n8n "Anthropic Chat Model" node, whose
--     model lives in n8n, not in this column. Move that node to
--     claude-opus-4-8, and fix the stale `model: 'claude-opus-4-6'` label in
--     the n8n "Build prompt + metrics" payload jsCode (it should read
--     claude-opus-4-8 too).
--   * classify-document and the prefill salvage step stay on Haiku 4.5
--     (hardcoded, correct for those simple tasks).

update public.atad2_prompts
   set model = 'claude-opus-4-8'
 where is_active = true
   and model = 'claude-opus-4-7';

update public.atad2_prompts
   set model = 'claude-sonnet-5'
 where is_active = true
   and model = 'claude-sonnet-4-6';
