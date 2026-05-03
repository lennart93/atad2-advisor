-- final_score was an INTEGER with default 0 and never written, so the admin
-- view always showed Score 0.0. Risk points sum to fractional values
-- (e.g. 0.2, 1.0, 1.2), so the column needs to be NUMERIC. Default-null
-- so the admin chip is hidden until a session genuinely produces a score.

ALTER TABLE atad2_sessions
  ALTER COLUMN final_score DROP DEFAULT;

ALTER TABLE atad2_sessions
  ALTER COLUMN final_score TYPE numeric(5, 2)
    USING NULLIF(final_score, 0)::numeric(5, 2);
