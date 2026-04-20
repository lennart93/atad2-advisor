# Password Reset — Design

## Goal

Add a functional "Forgot password" flow to the ATAD2 Advisor. Users can request a reset link by email, click the link, set a new password, and end up signed in automatically.

## Decisions (from brainstorming)

- **SMTP**: Replace Resend with IONOS (info@atad2.tax) in Supabase Auth config. All auth emails (signup OTP + password reset) will then originate from the atad2.tax domain.
- **UX**: Supabase native recovery link flow — no 6-digit OTP variant.
- **Post-reset**: Auto-signed-in; redirect to home.
- **Routes**: Two dedicated pages — `/forgot-password` and `/reset-password`.
- **Language**: All email templates and UI copy in English.

## Server-side changes

### Supabase Auth SMTP (on VM at ~/supabase/docker/.env)

Replace current Resend config with:

```
SMTP_ADMIN_EMAIL=info@atad2.tax
SMTP_HOST=smtp.ionos.de
SMTP_PORT=587
SMTP_USER=info@atad2.tax
SMTP_PASS=<from IONOS>
SMTP_SENDER_NAME=ATAD2 Advisor
```

Then restart the auth service: `docker compose restart auth` in `~/supabase/docker/`.

### Auth redirect allow-list

Supabase Studio (via db.atad2.tax) → Auth → URL Configuration:
- **Site URL**: `https://atad2.tax`
- **Additional redirect URLs**:
  - `https://atad2.tax/reset-password`
  - `https://app-atad2-prod.azurewebsites.net/reset-password`

### Email template

Supabase Studio → Auth → Email Templates → "Reset Password". English copy with `{{ .ConfirmationURL }}` link. Plain, short, no marketing.

## Frontend changes

### New file: src/pages/ForgotPassword.tsx

- Single email input (local-part + locked `@svalneratlas.com` suffix, same pattern as Auth.tsx sign-in)
- Submit button calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://atad2.tax/reset-password' })`
- Always shows generic success state (prevents account enumeration): "If an account exists for this email, we've sent a reset link."
- Rate-limit error → toast "Too many attempts, try again in a minute."
- "Back to sign in" link.

### New file: src/pages/ResetPassword.tsx

- On mount, checks for an active recovery session (Supabase JS client auto-parses the URL hash)
- If no session → shows "This reset link is invalid or expired" + link back to `/forgot-password`
- Otherwise: password input + confirm input, show/hide toggle, 8-char min, must match
- Submit calls `supabase.auth.updateUser({ password })` → Supabase keeps the session active → redirect to `/`
- Error → toast, form remains editable.

### Modified: src/pages/Auth.tsx

Add below the password field on the sign-in tab:

```tsx
<div className="text-right">
  <Link to="/forgot-password" className="text-sm text-primary hover:underline">
    Forgot password?
  </Link>
</div>
```

### Modified: src/App.tsx

Add two public routes (no auth guard):
- `/forgot-password` → `ForgotPassword`
- `/reset-password` → `ResetPassword`

## Data flow (happy path)

1. User on `/auth` sign-in → clicks "Forgot password?" → navigates to `/forgot-password`
2. Types email local-part, submits → `resetPasswordForEmail` fires
3. Supabase generates recovery token and sends email via IONOS SMTP
4. UI shows generic success message
5. User clicks link in email → lands on `/reset-password#access_token=...&type=recovery`
6. Supabase JS client picks up the hash, establishes recovery session
7. `ResetPassword.tsx` detects session, shows password form
8. User submits new password → `updateUser({ password })` → auto-signed-in → redirect to `/`

## Edge cases

| Case | Behavior |
|---|---|
| Unknown email | Generic success (no enumeration leak) |
| Link expired (>1h) | "Invalid or expired link" + link to `/forgot-password` |
| Already signed in and clicks reset link | Recovery session overrides existing session — acceptable |
| Too many reset requests | Supabase returns rate-limit error → toast "Too many attempts, try again in a minute." |
| Password mismatch | Inline error, form stays editable |
| Password too short | Inline error (matches signup rule of 8 chars) |

## Out of scope (YAGNI)

- Password strength meter
- Password history / prevent reuse
- 2FA challenge during reset
- Custom recovery email domain routing (IONOS is enough)

## Testing

Manual verification:
1. Sign-in page has working "Forgot password?" link
2. `/forgot-password` shows success state for valid + invalid email alike
3. Reset email arrives from `info@atad2.tax`, link works
4. `/reset-password` with invalid/missing hash shows error state
5. Successful password change → user ends up signed in on `/`
6. Old password no longer works after reset

No automated tests added — the project has no test setup for auth flows.
