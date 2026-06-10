#!/bin/bash
# Read-only review sample: open-questions register + dossier block statuses.
DB=$(docker ps --filter name=supabase-db -q | head -1)
docker exec -i "$DB" psql -U supabase_admin -d postgres <<'SQL'
\echo === A. Open-vragen-register: steekproef (recentste sessies) ===
SELECT s.taxpayer_name, oq.question_id AS q, oq.status, oq.source,
       left(coalesce(oq.client_question, '(geen klantzin, valt terug op vraagtekst)'), 70) AS client_question,
       left(coalesce(oq.why_it_matters, ''), 50) AS why_it_matters
FROM atad2_open_questions oq
JOIN atad2_sessions s ON s.session_id = oq.session_id
ORDER BY s.created_at DESC, oq.question_id
LIMIT 14;
\echo === B. Verdeling register ===
SELECT status, source, count(*) FROM atad2_open_questions GROUP BY 1,2 ORDER BY 3 DESC;
\echo === C. Blokstatussen per dossier (de toekomstige hub-kaarten) ===
SELECT s.taxpayer_name, s.fiscal_year AS fy,
       d.documents_status AS docs, d.questions_status AS questions,
       d.structure_status AS structure, d.appendix_status AS appendix,
       d.report_status AS report, d.open_unknown_count AS open_unk
FROM atad2_dossier_blocks d
JOIN atad2_sessions s ON s.session_id = d.session_id
ORDER BY s.created_at DESC
LIMIT 17;
SQL
