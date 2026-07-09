-- Row 6.2 (imported mismatch, art. 12ad) condition text: "financing chain" reads
-- awkwardly; the advisor wants plain "structure". Mirrors the code skeletons
-- (src/lib/appendix/skeleton.ts + generate-appendix/skeletonRows.ts). Idempotent:
-- the WHERE matches only the old wording, so re-running is a no-op.

UPDATE atad2_appendix_skeleton
SET condition_tested = 'There is a hybrid mismatch (double deduction or deduction without inclusion) elsewhere in the structure'
WHERE row_id = '6.2'
  AND condition_tested = 'There is a hybrid mismatch (double deduction or deduction without inclusion) elsewhere in the financing chain';
