# ATAD2 Advisor — Security Audit & Remediation (2026-07-02)

**Method:** Whole-tool review across 5 dimensions (RLS/database, edge functions, prompt-IP leakage, frontend, infra/webhook/supply-chain), every finding independently re-verified adversarially (18 agents), then cross-checked by hand. Supersedes the April 2026 `SECURITY_AUDIT_REPORT.md` for the items below.

---

## TL;DR

- **Your prompt IP is safe.** The ATAD2 system prompts in `atad2_prompts` are locked to admins by RLS across the table's full history, read server-side via the service role, and are **not** in the repo, the seed, or the browser bundle. Verified and cleared.
- **7 real issues** survived verification: **2 HIGH**, **2 MEDIUM**, **3 LOW**.
- **3 fixes applied in source now** (working tree, not deployed): the two HIGH edge-function bugs and the MEDIUM memo XSS.
- **4 items need action outside this repo** (n8n workflow, Azure/Caddy headers) or are a lower-priority refactor — documented below with exact steps.
- **No secrets are committed.** `.env` holds only the public anon key + URLs and is gitignored. The seed contains only the question bank (no PII, no prompts).

---

## What was fixed in this pass (code-only, in the working tree)

> Per your standing rule (`main` = live, no auto-deploy) nothing was committed, pushed, or deployed. The two edge-function fixes are **source edits that only take effect after a VM edge-function redeploy**; the XSS fix ships with the next Azure App Service build.

### FIX 1 — `n8n-report`: HMAC now fails closed (was HIGH)
`supabase/functions/n8n-report/index.ts`. `verifySignature()` used to `return true` when the signature header was missing, so an attacker could skip HMAC entirely by simply not sending `x-n8n-signature` and inject a forged tax report into any known `session_id` (the function runs with the service role and is the sole permitted inserter into `atad2_reports`). Both fail-open branches now `return false`.
- **Deploy dependency:** the n8n `generate-report` workflow must sign the raw body and send `x-n8n-signature: sha256=<hmac>`. Deploy the function **together with** that n8n change, or report insertion will 401. `N8N_SIGNING_SECRET` is already set on the VM.

### FIX 2 — `cleanup-expired-sessions`: authenticated + no more client-name leak (was HIGH)
`supabase/functions/cleanup-expired-sessions/index.ts`. The function did destructive, cross-tenant deletes (reports/answers/sessions) with the service role and **no authentication**, and returned every deleted session's `taxpayer_name` (client identity) in the response. Added a fail-closed shared-secret gate (`x-cleanup-secret` compared in constant time) before any work, and reduced the response to counts only. The per-session audit line stays in the **server** log.
- **Deploy dependency:** set `CLEANUP_SECRET` on the VM and configure whatever invokes this function (cron/scheduler) to send the matching `x-cleanup-secret` header. Until both are set the endpoint returns 401 (fail closed).

### FIX 3 — Memo rendering: stored XSS closed (was MEDIUM, browser-verified)
The memo is rendered with `rehype-raw` (needed for `<u>`/`<sup>`/`<sub>`/`<br>`) and had **no** sanitizer, so attacker-influenced memo text (from uploaded documents / feedback) could carry `<svg><script>` or `<iframe srcdoc>` and steal the Supabase token from `localStorage`. Added a self-contained rehype sanitizer (no new dependency) that runs after `rehype-raw` and strips script/frame/svg/event-handler/`javascript:` vectors while keeping the formatting tags.
- New file `src/components/memo/sanitizeMemoHtml.ts`; shared hardened list `MEMO_REHYPE_PLUGINS` in `src/components/memo/memoProse.tsx`; all three render sites (`AssessmentReport.tsx`, `MemoFeedbackEditor.tsx` ×2) now use it.
- **Verified:** new test `src/components/memo/__tests__/sanitizeMemoHtml.test.tsx` renders the real `react-markdown` pipeline and proves both browser-confirmed payloads are neutralized while `<u>/<sup>/<sub>/<br>` and safe links survive (6/6 pass).
- **Ships with:** the next normal Azure App Service frontend build.

---

## Items still open (cannot be safely fixed inside this repo)

### OPEN A — Public n8n webhooks: enforce auth + rate limiting (MEDIUM)
`generate-report`, `submit-feedback`, `parse-memo` are public and trigger paid LLM calls + service-role writes. The frontend passes `auth_token` in the body, but enforcement lives in the n8n workflow (not in the repo). **Action (n8n UI):** make "Verify Auth" the first node in each workflow (validate the Supabase JWT and confirm it owns `session_id` before any LLM/DB node), add per-user rate limiting, and ideally restrict `n8n.atad2.tax` to the Azure egress range at the firewall/NSG. Strategic fix: migrate these to auth-gated edge functions (your "moving off n8n" direction).

### OPEN B — User JWT sent in n8n request bodies (LOW)
`AssessmentReport.tsx:565`, `MemoFeedbackEditor.tsx:100`, `DownloadMemoButton.tsx:152` put the live access token in the JSON body; n8n persists webhook payloads, so tokens land in execution history. **Action:** move the token to an `Authorization` header and disable/redact payload persistence in n8n. *(Frontend-only half was deliberately not changed unilaterally — it would break auth until the n8n side reads the header. Do both together.)*

### OPEN C — No security response headers (LOW, defense-in-depth)
No CSP/HSTS/X-Frame-Options/X-Content-Type-Options on the SPA. A CSP would have blunted the XSS token-exfil path. **Action (Azure App Service or Caddy):** add `Content-Security-Policy` (`script-src 'self'; connect-src 'self' https://api.atad2.tax https://n8n.atad2.tax; frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### OPEN D — ATAD2 decision logic in the browser bundle (LOW, but IP-relevant)
`src/lib/appendix/mootness.ts` (N/A-cascade dependency graph) and `src/lib/appendix/skeleton.ts` (`drivenByQuestionIds` question→rule routing) compile into `dist/assets/*.js` and are readable by anyone with the bundle. The **system prompts are not here** — this is the narrower checklist-cascade logic, most of which (legal basis / conditions) is already shown to users anyway. **Action (frontend refactor):** compute the mootness reclassification and question routing only in the `generate-appendix` edge function (Deno mirrors already exist) and ship only rendered rows to the browser. Left as a focused follow-up because it touches the appendix render pipeline and needs its own test pass — say the word and I'll do it.

### Housekeeping — `dist.zip` (not a vuln)
A stale pre-appendix build is git-tracked (contains no secrets/prompts). Recommend `git rm --cached dist.zip` and add `dist.zip`/`*.zip` to `.gitignore` so future builds don't embed bundled logic into history. Not done here (git mutation left to you).

---

## Verified secure / cleared (checked and no action needed)

- **`atad2_prompts` (prompt IP):** RLS enabled; only SELECT/INSERT/UPDATE policies, all gated by `has_role(auth.uid(),'admin')`; no later migration loosens them; `get_active_prompt_version` RPC returns only the integer version. Non-admins and anon get zero rows. Edge functions read via service role server-side.
- **Core RLS:** the original permissive `USING (true)` policies on `atad2_sessions`/`atad2_answers`/`atad2_questions` were later dropped and replaced with user-owned/admin policies. `has_role()` is `SECURITY DEFINER` with a fixed `search_path`; `user_roles` INSERT requires existing admin (no self-escalation).
- **`extract-structure` / `generate-appendix` / `prefill-documents` / `classify-document`:** verify JWT **and** session ownership (and `aud=authenticated`) before service-role work.
- **Prompt-injection via uploaded docs:** model output is forced through strict Zod schemas and never returned as free text, so a "print your system prompt" document cannot exfiltrate the prompt.
- **`parse-memo` edge function:** unauthenticated but **dead code** — the frontend calls the n8n webhook directly; the real gap is OPEN A, not this file.
- **`send-auth-email`:** properly verifies the Supabase auth-hook signature.
- **Secrets:** `.env` (anon key + URLs only) is gitignored; `seed_all_data.sql` holds only the question bank (no PII, no prompts); no service_role key / API key / password committed.

---

## Priority order

1. Deploy **FIX 1** (n8n-report) + activate n8n body signing — highest severity.
2. Deploy **FIX 2** (cleanup) + set `CLEANUP_SECRET` and the scheduler header.
3. Ship **FIX 3** (memo XSS) with the next frontend build.
4. **OPEN A** — n8n Verify Auth node + rate limiting.
5. **OPEN D** — move appendix logic server-side (IP).
6. **OPEN C** — security headers.
7. **OPEN B** — token to header + disable n8n payload persistence.
