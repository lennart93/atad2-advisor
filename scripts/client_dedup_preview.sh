#!/bin/bash
# Read-only: preview of the proposed client folders for the slice-4 backfill
# (one folder per distinct user + normalized taxpayer name). Review the
# name_variants column for typo splits like "Acme BV" vs "Acme B.V.";
# variants are NEVER auto-merged.
docker exec $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -c \
  "SELECT user_id,
          lower(trim(taxpayer_name)) AS normalized,
          array_agg(DISTINCT taxpayer_name) AS name_variants,
          count(*) AS sessions,
          array_agg(fiscal_year ORDER BY fiscal_year) AS years
   FROM atad2_sessions
   GROUP BY user_id, lower(trim(taxpayer_name))
   ORDER BY user_id, normalized;"
