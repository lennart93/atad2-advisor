# Security Audit — ATAD2 Advisor — 10 Jul 2026

In-depth static review of the whole codebase (RLS/DB, edge functions, frontend, secrets/CI/infra) plus **non-destructive live verification** against production. Authorized: owner's own app + infra. Builds on `SECURITY_AUDIT_2026-07-02.md`.

## TL;DR
The app is in **good shape**. Auth/authorization is uniform and correct (JWT + session-ownership on every user function, admin-gated tuner, fail-closed HMAC/shared-secret on machine endpoints). The previously-flagged Critical (world-open RLS) is **confirmed fixed on the live DB**. Remaining items are one Medium code hardening (now fixed in the working tree), missing HTTP security headers (infra), and n8n webhook authorization (needs the n8n side + the n8n API key, which was not yet provided).

## Live verification (non-destructive, prod)
| Check | Result | Meaning |
|---|---|---|
| anon-key read of `atad2_sessions` / `atad2_answers` / `atad2_reports` | HTTP 200 `[]` | RLS blocks anon — **F1/F3 fixed live** ✔ |
| anon-key read of `atad2_prompts` | HTTP 200 `[]` | Prompt IP protected ✔ |
| Supabase Studio `:3000` from internet | connection refused | **Not exposed** ✔ |
| Security headers on `app-atad2-prod` (frontend) | none | HSTS/CSP/X-Frame/X-Content-Type all **missing** ✗ |
| Security headers on `api.atad2.tax` (kong) | none; `Server: kong/2.8.1` | headers missing + version disclosure ✗ |
| `n8n.atad2.tax` | `X-Frame-Options: SAMEORIGIN` only | partial |

## Findings (severity, status)

### Fixed in this pass (working tree, NOT deployed)
- **[Medium] prefill-documents storage-path IDOR** — `storage_path` came from the request body and was downloaded with the service role (bypasses Storage RLS) without checking it belonged to the verified session. A caller could name another tenant's path and have its bytes paraphrased into their own suggestions. **Fix:** `pathBelongsToSession()` in `supabase/functions/prefill-documents/analyze.ts` now requires the path's session segment to equal the verified session (rejects `..` and malformed paths). Rejected fetches are logged and skipped. *Deploy: VM edge redeploy of `prefill-documents`.*
- **[Medium] atad2_sessions DELETE null-leak (F2)** — the DELETE policy still had `OR user_id IS NULL`; any authenticated user could delete null-owner rows. The 20260327 null-leak fix had skipped DELETE. **Fix:** migration `supabase/migrations/20260710180000_fix_sessions_delete_null_leak.sql` recreates it owner-scoped + a RAISE guard. *Deploy: apply on VM as `supabase_admin`.*
- **[Low] CI hardening** — `.github/workflows/deploy.yml`: added `permissions: contents: read` (was inheriting default token scope) and switched `npm install` → `npm ci` (reproducible builds). *Ships on next push to main.*
- **[Low] dist.zip tracked** — stale Feb-2026 build artifact `git rm --cached`'d and added to `.gitignore` (`dist.zip`/`dist.tar.gz`). No secret leak (only the public anon key), just hygiene.

### Confirmed safe (no action)
- **RLS design** — every `atad2_*` table has RLS on; no policy grants `to anon`/`public`; owner-scoped via `auth.uid()`. SECURITY DEFINER functions all set `search_path`. `user_roles` self-grant not possible. Prompt IP admin-only.
- **Edge functions** — JWT + `verifyJwtAndSessionOwnership` everywhere; `n8n-report` HMAC fail-closed + constant-time; `cleanup` shared-secret + returns counts only; `send-auth-email` verified via standardwebhooks, no open relay/injection; no SQL injection, no SSRF (only outbound fetch is a hardcoded n8n URL), no hardcoded secrets, LLM output never crosses a privilege boundary.
- **Frontend** — memo XSS sanitizer applied at all 3 render sites; DOCX `{{@appendicesXml}}` fully escaped via `esc()`/`escAttr()`; no service-role key in bundle; admin gating backed by RLS; storage upload path enforced by RLS (`foldername[1]=auth.uid()` + owned session); buckets private (signed URLs only).
- **Secrets** — no service-role/API/SMTP/private-key literal anywhere tracked or untracked. `.env` gitignored. Anon key public by design.

### Open — needs the VM (az run-command + PIM) or n8n, NOT fixable from repo alone
- **[Medium] n8n `submit-feedback` webhook is fully unauthenticated** — `src/components/MemoFeedbackEditor.tsx` POSTs memo+feedback with no token. Anyone with the URL can trigger LLM processing (cost/DoS) + submit arbitrary text. **Fix (n8n):** require bearer/HMAC + rate-limit.
- **[Medium] n8n `generate-report` IDOR-via-backend** — `AssessmentReport.tsx` POSTs `{session_id, auth_token}` with no signature; if the n8n flow trusts `session_id` without re-checking ownership against `auth_token`, a user could generate/overwrite another session's report (service-role write). **Fix (n8n):** resolve caller from `auth_token`, require `atad2_sessions.user_id == caller`; add HMAC; move JWT to Authorization header.
- **[Low-Med] Missing HTTP security headers** — add HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy on the frontend (Azure App Service) and at kong for the API. Hide/normalize the `Server: kong/2.8.1` version banner.
- **[Low] Wildcard CORS (I1)** — `Access-Control-Allow-Origin: *` on several edge functions (mitigated: all require a bearer token, no cookies). Normalize to `ALLOWED_ORIGIN=https://app-atad2-prod.azurewebsites.net`. NOT auto-changed to avoid breaking prod if the env var isn't set on the VM.
- **Config to verify on VM:** `N8N_SIGNING_SECRET`, `CLEANUP_SECRET`, `SEND_EMAIL_HOOK_SECRET` are actually set (functions fail-closed if not); Supabase Auth OTP rate-limits enabled; NSG keeps `:3000` admin-only (confirmed not internet-reachable today).
- **[Low] Housekeeping** — redundant `bun.lockb` (CI uses npm); add `npm audit` to CI; add a boot/CI check asserting `rowsecurity=true` for every `public.atad2_*` table and no `qual='true'` policy (anon key is long-lived + effectively public, so RLS is the whole blast-radius control); plan an anon-key/JWT-secret rotation path.

## Live-DB verification queries (run on VM to re-confirm drift)
```sql
SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'atad2_%' AND c.relrowsecurity=false;
SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND (qual='true' OR with_check='true' OR 'anon'=ANY(roles)) ORDER BY tablename;
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='atad2_sessions' AND cmd='DELETE';
```

---

## Live remediation log (11 Jul 2026, secskills round)

**Applied to production (verified):**
- **n8n IDOR fixed** — all three webhooks (`generate-report`, `submit-feedback`, `parse-memo`) had a `Verify Auth` node that validated the token but not session ownership. Added an ownership gate (queries `atad2_sessions` with the caller's own token so RLS decides) to all three via the n8n API. Verified live; smoke-tested fail-closed. Confirmed the actual IDOR: `generate-report` fetches session+answers via a service-role Supabase node filtered only on `session_id`, so any valid token + another user's `session_id` processed that dossier. Rollback backups saved.
- **`documents` table hardened** — RLS was already ON (so the broad anon grants were NOT exploitable), but revoked the dangerous `anon`/`authenticated` INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants (kept SELECT). It is the RAG knowledge base (3550 embeddings), not tenant data.
- **API security headers live** — added HSTS, X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy to `api.atad2.tax` in Caddy (`/root/caddy/Caddyfile`) + stripped the `Server: kong/2.8.1` banner. validate-before-reload, backup saved.
- **prefill-documents IDOR fix deployed** — patched `analyze.ts` (`pathBelongsToSession`) rsync'd to the VM edge container, restarted, md5 verified (host=container=local `0f72d961…`), folder intact, boots (401 on no-auth).

**Verified safe (no action needed):**
- JWT signing secrets (Supabase anon + n8n API token) are NOT default/weak — no forgeable service_role tokens.
- RLS on all `atad2_*` tables; anon reads return `[]`; F2 (sessions DELETE) already clean on live; F3 (reports INSERT) service_role-only; Studio `:3000` not directly reachable.

**Frontend headers (in working tree, needs deploy):** added `public/serve.json` with the same headers. The live frontend `atad2.tax` is served by Azure (not the VM Caddy), so this ships only on the next frontend deploy and must be verified post-deploy (if pm2 serve does not honor serve.json, set headers at the Azure gateway that currently adds `ACAO: *`).

**Still open (needs your decision / not auto-changed):**
- **`db.atad2.tax` exposes Supabase Studio to the internet** behind HTTP basic-auth (bcrypt cost 14). Recommend restricting to an admin IP / VPN in the Caddy block. Not changed automatically (could lock you out).
- **n8n Caddy block reflects any `Origin` with `Allow-Credentials: true`** — CORS misconfig, low impact (bearer tokens, not cookies).
- **`N8N_SIGNING_SECRET` and `CLEANUP_SECRET` are UNSET** on the edge container — both functions fail closed (safe), but `cleanup-expired-sessions` is effectively not running and `n8n-report` is unused (reports are written directly by the n8n workflow's service-role node).
- **Git:** security fixes are in the working tree, not committed (deploy.yml + .gitignore already had unrelated uncommitted design-branch changes, so a clean scoped commit needs your sequencing). `dist.zip` un-tracked.
