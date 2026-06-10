#!/bin/bash
# Read-only: verify the session revenue columns exist on the VM database
# (migration 20260605120000_session_revenue_tracking.sql). Expected: 4 rows.
docker exec $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -At -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='atad2_sessions'
     AND column_name IN ('sold','revenue_eur','revenue_updated_at','revenue_updated_by')
   ORDER BY column_name;"
