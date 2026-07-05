# Appendix latency + acting-together audit (2026-07-02)

Multi-agent audit of two complaints: (A) the appendix step still generates ("thinks") on or during arrival despite the prewarm mechanism, and (B) acting-together is almost never populated. All claims verified against code; file:line references are to the working tree on `design/svalner-l2`.

## Deploy state (verified 2026-07-02)

- **Production frontend (main → Azure) has never contained the appendix feature.** `origin/main` = `b8008e1` (2026-06-08); `git ls-tree main` has zero appendix/acting files. `deploy.yml` triggers on push to main only. The branch is 185 commits ahead with 182 dirty files (brand restyle + functional fixes entangled).
- **The server-side acting-together anti-freeze fix exists in NO git commit on any branch.** It is an uncommitted working-tree diff (`generate-appendix/index.ts`, `factsBuild.ts`, `mootness.ts`). The VM copy was written directly into the container mount on 1 Jul (md5-verified then; local md5 `81323a73` / `4857052e` still matches on 2 Jul, so the VM is running exactly this working tree). Consequence: **the only source of the code running in production-backend is this OneDrive working tree. Commit it before anything else.**
- Frontend halves of the fix (`doActingRetry`, two-milestone `useAppendixPrewarm`, `ActingTogetherSection`, `actingCandidates.ts`) are uncommitted/untracked and not deployed anywhere.
- VM prompt state per 1 Jul verification: `appendix_facts_system` v19 and `appendix_system` v6 active. Re-verify when PIM is available.

## Root causes — complaint A ("still thinks at the appendix step")

- **A1 (structural, biggest).** Part B article rows have no reuse mechanism at all: only facts are hash-cached (`index.ts:168-188`); the per-section Claude swarm (`index.ts:220-230`) runs on every invocation. Every re-trigger (draft-milestone, post-Q&A refresh, acting-retry, structure resync) pays full swarm wall-clock even when inputs are unchanged.
- **A2.** The answer-bearing regeneration is deliberately scheduled to overlap the user's walk to the step: a detached async block after Q&A submit (`Assessment.tsx:1120-1154`) waits for Phase B (up to ~20s + 240s) and then invokes, while the user is already navigating. Users typically arrive mid-generation.
- **A3.** The acting-together retry converts the complaint-B fix into complaint-A pain: on every landing where acting-together is empty with ≥2 candidates, `doActingRetry` (`AssessmentAppendix.tsx:107-124`) fires a FULL regeneration; empty acting is never hash-cached (`index.ts:195,549-551`) and the retry guard is a per-mount ref, so a structure where the model persistently returns no grouping regenerates on EVERY visit, forever.
- **A4.** Single final write (`index.ts:272-277`): nothing is persisted until facts + swarm are done, so a cold landing shows the blocking `AppendixLoadingCard` the whole time (docs download → sequential KB retrieval → 16k-token facts call → swarm).
- **A5.** Prewarm fragility: dedup key consumed before the invoke resolves with a swallowed error (`useAppendixPrewarm.ts:46-48`); module-level Set lost on reload; the detached post-Q&A block dies on tab close/refresh; the hook is only mounted on Upload + Q&A so the draft-milestone fire rarely happens; `needsStart` has no answers-changed check and `computeStaleRows` is dead code → cold start or silently stale appendix after refresh.
- **A6.** The 90s freshness heuristic (`index.ts:111-114`, `AssessmentAppendix.tsx:25-29`) mismatches real run duration; `updated_at` is only written at run start. Long runs get duplicated; dead runs block for 90s.
- **A7.** The facts cache almost never helps the run that matters: free-text answer explanations are part of the hash, and Phase B changes entities/edges, so the post-Q&A run practically always re-runs facts too.
- **A8.** Structure→Previous fires a resync immediately before navigating back to the appendix (`StructureChartStep.tsx:209-216`), guaranteeing a landing mid-regeneration after chart edits.

## Root causes — complaint B (acting-together almost never populated)

- **B1.** Deployment gap: every layer of the fix is uncommitted/unpushed (see deploy state). Server half is live on the VM only via the out-of-band 1 Jul copy; frontend half runs only in local dev.
- **B2.** Historical freeze mechanism (still what HEAD has): empty `actingTogether` stored as `complete:true`, hash cached, `canReuseFacts` short-circuits forever. Fixed in the working tree by the carve-out (`index.ts:173-179`) + completeness gate (`index.ts:549-551`).
- **B3.** Ordering: the phase-A prewarm runs before ownership edges/percentages exist, so no Parent roles and no `shareholderOfTaxpayer` flags (those are produced by the facts pass itself, chicken-and-egg). Fewer than 2 candidates → empty counts as legitimately settled and IS cached. Un-freezing then depends on the fragile later triggers (A5).
- **B4.** Fresh-empty overwrite: `mergeFacts` (`index.ts:589-604`) wholesale-replaces stored clusters with a fresh empty array when nothing was advisor-edited.
- **B5.** Silent degraded passes: facts-model/KB failures return the empty base and still end `ready` (`index.ts:394,552-555`); per-section swarm failures return `[]`. The UI shows "no group" with no error signal.
- **B6.** Display-side: clusters with any advisor-hidden member are dropped entirely (`visibleFacts.ts:15`); `facts: null` renders structurally-empty acting.

## Fix plan

### Phase 0 — verify what's live (needs PIM)
Check on the VM: `docker exec supabase-edge-functions grep -c countActingTogetherCandidates /home/deno/functions/generate-appendix/index.ts` (expect ≥1), md5 vs working tree, and active `atad2_prompts` appendix keys. Script ready at the session scratchpad (`check-appendix-vm.sh`); the 2 Jul attempt failed on `AuthorizationFailed` (PIM inactive). The 1 Jul memory-recorded verification + still-matching local md5 make it near-certain the fix is live.

### Phase 1 — ship what exists (no new code)
1. **Commit everything first**, untangling functional appendix fixes from the brand restyle so they can ship independently (`feat/client-platform` is the cleaner vehicle). The VM-deployed server code must stop existing only as an uncommitted diff.
2. Deploy frontend to Azure via main push (whole appendix feature + retrigger + two-milestone prewarm). Deploy order matters: the VM edge function (already fixed) must stay ahead of the frontend retrigger, otherwise every landing re-POSTs against a freezing server.
3. Re-apply/verify facts prompt v19 on the VM (migration file is untracked; memory says v19 already active — verify).

### Phase 2 — "fully prepared before arrival" (complaint A)
1. **Hash-based reuse for Part B rows** (skeleton version + prompt version + factsBlock + answersBlock + structureBlock); skip the swarm when unchanged. Single biggest win; turns retries/resyncs into cheap no-ops.
2. **Make the post-Q&A regeneration robust**: trigger from Confirmation page mount instead of a detached promise, AND persist an `inputs_hash` on the appendix row so `needsStart` can detect staleness properly (also fixes the silent stale-appendix bug).
3. **Persist facts as an intermediate write** so a cold landing shows Part A + register while the swarm finishes.
4. **Heartbeat `updated_at`** during the run (every ~30s) so the 90s window distinguishes long from dead runs; update all three guard sites consistently.
5. Fix prewarm dedup ordering (add key only after invoke resolves; retry on failure); same for the structure resync swallow.
6. Parallelize KB retrieval (`kbRetrieval.ts:20-35`) and dedupe the double chart load (`index.ts:143,162`).

### Phase 3 — acting-together reliability (complaint B)
1. With row reuse in place, `doActingRetry` becomes facts-only in cost; add a persisted retry counter so persistent-empty structures stop regenerating every visit and surface "could not establish a grouping, assess manually".
2. In `mergeFacts`, keep existing non-empty clusters when the fresh pass is incomplete/empty.
3. **Deterministic candidate floor**: seed `shareholderOfTaxpayer` from chart edges when ≥2 entities hold direct edges to the taxpayer, removing the chicken-and-egg for chart-visible shareholders.
4. Distinguish `ready` from degraded (facts pass failed) so the UI can offer a retry instead of a permanent "Assessing…".

### Risks
- Deploy order: frontend retrigger against an unfixed server = worst of both (every landing re-POSTs, server reuses cached empty, swarm re-runs).
- Pushing main deploys 185 commits + working tree to live production; full local test pass first (memo template v2 Storage-key dependency included).
- Prompt v19 hash-bust forces one fresh facts pass per active dossier (intended).
