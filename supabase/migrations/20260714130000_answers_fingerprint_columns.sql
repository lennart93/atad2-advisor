-- Vingerafdruk van de effectieve antwoorden-set (echte antwoorden aangevuld
-- met prefill-suggesties) die een run gebruikte. De Facts-pagina vergelijkt
-- deze met de actuele antwoorden en toont pas feiten als ze overeenkomen.
-- Nullable: oude dossiers en nog-niet-herdraaide runs hebben geen waarde.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS answers_fingerprint text;
ALTER TABLE public.atad2_appendix
  ADD COLUMN IF NOT EXISTS answers_fingerprint text;
