# ATAD2 Advisor — Security Audit Report

**Date:** April 4, 2026
**Auditor:** Automated security review (Claude Code)
**Scope:** Supabase configuration, RLS policies, edge functions, authentication, n8n webhook integrations, frontend security
**Environment:** Self-hosted Supabase on Azure VM + Azure App Service frontend

---

## Executive Summary

The ATAD2 Advisor application has a solid security baseline with properly enforced Row Level Security, input validation, XSS protection, and audit logging. The primary remaining weakness is the **n8n webhook authentication architecture**, which is partially implemented but not yet fully operational due to infrastructure constraints.

---

## Current Security Posture

### What is in good shape

| Area | How it works |
|------|-------------|
| **Row Level Security** | All tables enforce strict user ownership via `auth.uid() = user_id`. Answers are protected through session join. Admin access uses a `has_role()` SECURITY DEFINER function with `search_path` restriction. |
| **Authentication** | Supabase Auth with email/password, restricted to `@svalneratlas.com` domain. Email verification is required before access. OTP-based verification flow. |
| **Admin role separation** | RBAC via `user_roles` table. Admin checks use RPC call to `has_role()`. Self-admin-removal prevention ensures the last admin cannot be removed. |
| **XSS protection** | `MemoDiffViewer` sanitizes HTML through DOMPurify with a strict whitelist (`span`, `br`, `strong` only). `textDiff.ts` escapes all HTML entities before rendering. |
| **CORS on edge functions** | All edge functions use `ALLOWED_ORIGIN` environment variable (defaults to `https://app-atad2-prod.azurewebsites.net`) instead of wildcard `*`. |
| **Environment variables** | Supabase URL, anon key, and n8n webhook base URL are read from `import.meta.env` with runtime validation. GitHub Secrets are used in the deploy workflow. No hardcoded keys in source code. |
| **Input validation** | Whitelist-based validation on taxpayer names, entity names, session IDs, and question IDs. Edge functions validate request types and sanitize string fields. |
| **Session cleanup** | Automated function removes sessions with downloads older than 24 hours, and sessions without downloads older than 30 days. Cascade deletes reports and answers. |
| **Audit logging** | Triggers on `user_roles` and `atad2_sessions` tables log all INSERT, UPDATE, DELETE operations with old/new values. Audit logs are admin-only. |
| **Signed URLs** | Template downloads use Supabase Storage signed URLs with 60-second expiration. |
| **Deploy pipeline** | GitHub Actions deploys to Azure App Service using GitHub Secrets. No hardcoded overrides or sed replacements in the workflow. |

---

## Open Weaknesses

### 1. n8n Webhooks Are Publicly Accessible (HIGH — To Be Discussed with Intility)

**What it is:**
The n8n webhooks (`generate-report`, `parse-memo`, `submit-feedback`, `lovable-feedback`) are publicly reachable at `https://n8n.atad2.tax/webhook/*`. Anyone who knows these URLs can trigger requests.

**Why it matters:**
- Triggers expensive Claude Opus API calls at the application owner's cost
- Can write data to the database via n8n's Supabase node (which uses service role credentials, bypassing RLS)
- No rate limiting — potential for abuse or denial of service

**Current state of the attempted fix:**
A JWT-based authentication mechanism has been partially implemented:
- The Azure-deployed frontend (`app-atad2-prod.azurewebsites.net`) sends the user's Supabase `access_token` in the request body as `auth_token`
- "Verify Auth" Code nodes have been added to all 4 n8n workflows that validate the token against Supabase's `/auth/v1/user` endpoint
- The environment variables `N8N_SIGNING_SECRET` and `ALLOWED_ORIGIN` are configured on the VM

**Why it is not yet fully operational:**
1. **Dual frontend deployment:** The app is served from both `atad2.tax` (Caddy on VM) and `app-atad2-prod.azurewebsites.net` (Azure App Service). Only Azure receives automatic updates via GitHub Actions. The VM frontend does not include `auth_token` in requests because it has not been rebuilt.
2. **n8n caches workflow definitions in memory.** Workflow changes made via the SQLite database are not reliably picked up. The "Verify Auth" node code must be confirmed/saved through the n8n UI for each workflow.

**What needs to be discussed with Intility:**
1. **Unified frontend deployment:** Should `atad2.tax` redirect to Azure App Service, or should the VM build be automated via a post-deploy hook from GitHub Actions?
2. **Network-level protection:** Can the n8n webhook endpoints be restricted at the firewall/NSG level so only the Azure App Service IP range can reach them? This would be the strongest solution regardless of application-level auth.
3. **Caddy configuration review:** Caddy currently serves a frontend, proxies API and n8n traffic, and handles CORS. Cross-origin requests lose the `Authorization` header (which is why the token is sent in the body instead). This configuration needs review.
4. **SSH access:** Port 22 on the VM is blocked. Maintenance is currently done via `az vm run-command`, which is slow and has output limitations.

---

### 2. n8n-report Edge Function Has Optional Signature Verification (MEDIUM)

**What it is:**
The `n8n-report` Supabase edge function accepts report submissions and implements HMAC-SHA256 signature verification. However, the verification is in **graceful mode**: if the signing secret is set but no signature header is received, the request is allowed through with a console warning.

**Why it matters:**
Any party that can reach the edge function can submit fake reports without a valid signature.

**Current state:**
`N8N_SIGNING_SECRET` is configured on the VM. However, the n8n ATAD2 workflow writes reports directly to Supabase via its built-in Supabase node — it does not call this edge function. The edge function exists as a secondary/unused API endpoint.

**Recommendation:**
If the edge function is not actively used by any workflow, remove it to reduce attack surface. If it is needed, make signature verification mandatory.

---

### 3. Missing Security Headers (LOW-MEDIUM)

**What it is:**
The application does not set standard browser security headers:
- **Content-Security-Policy (CSP):** Would restrict which scripts and resources can execute
- **Strict-Transport-Security (HSTS):** Would force browsers to always use HTTPS
- **X-Frame-Options:** Would prevent the app from being embedded in an iframe (clickjacking protection)
- **X-Content-Type-Options:** Would prevent browsers from guessing file types

**Why it matters:**
These headers are defense-in-depth measures. The risk is low given the app is restricted to `@svalneratlas.com` users, but they are considered best practice and straightforward to add at the Caddy or Azure App Service level.

---

### 4. No Rate Limiting on Edge Functions (MEDIUM)

**What it is:**
None of the four Supabase edge functions (`n8n-report`, `cleanup-expired-sessions`, `parse-memo`, `send-auth-email`) implement rate limiting.

**Why it matters:**
Without rate limiting, an attacker who knows the endpoint URLs could make rapid repeated requests, potentially causing resource exhaustion or excessive costs.

**Recommendation:**
Implement rate limiting at the Caddy reverse proxy level (simplest) or within the edge functions using an in-memory counter with TTL.

---

### 5. ReactMarkdown with rehypeRaw Allows Raw HTML (MEDIUM — ACCEPTED)

**What it is:**
`AssessmentReport.tsx` and `MemoFeedbackEditor.tsx` use ReactMarkdown with the `rehypeRaw` plugin, which allows raw HTML tags within markdown content to be rendered in the browser.

**Why it matters:**
If markdown content were to come from an untrusted source, this could enable XSS. Currently, the memo content is generated by the AI agent (Claude Opus via n8n), which is a trusted source.

**Assessment:**
Accepted risk given the trusted content source. If user-generated markdown is ever introduced, `rehypeRaw` should be replaced with a sanitizing plugin.

---

## Architecture Diagram (Security Perspective)

```
User (browser)
  |
  |-- HTTPS --> app-atad2-prod.azurewebsites.net  (Azure App Service - frontend)
  |                   |
  |                   |-- HTTPS --> api.atad2.tax  (Caddy -> Supabase Kong -> PostgREST)
  |                   |                               RLS enforced on all queries
  |                   |
  |                   |-- HTTPS --> n8n.atad2.tax  (Caddy -> n8n)
  |                                   [!] Publicly accessible webhooks
  |                                   [!] auth_token sent in body (partial)
  |                                   [!] Verify Auth node (needs UI confirmation)
  |
  |-- HTTPS --> atad2.tax  (Caddy -> static files on VM)
                    |
                    |-- Same API/n8n calls, but WITHOUT auth_token
                        (VM frontend not updated)
```

---

## Recommended Priority Actions

### Immediate
1. Resolve the dual frontend deployment — unify `atad2.tax` and Azure App Service
2. Evaluate network-level firewall rules for n8n webhook endpoints
3. Review Caddy reverse proxy configuration and SSH access

### Short-term
4. Confirm all n8n "Verify Auth" nodes contain the correct code via the n8n UI
5. Add security headers (CSP, HSTS, X-Frame-Options) at proxy level

### Medium-term
6. Implement rate limiting on edge functions or at proxy level
7. Remove the `n8n-report` edge function if it is not used by any active workflow
8. Create `.env.example` template for developer onboarding

---

*This report reflects the current state of the ATAD2 Advisor security posture as of April 4, 2026.*
