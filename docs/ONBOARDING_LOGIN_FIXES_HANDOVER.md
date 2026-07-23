# Onboarding / Login / Devices / Deletion — implementation + runbook

Branch: `fix/onboarding-login-simplify` (off production `main` @ `5b65570`).
Claude handoff: `5904aac`. Preview: `https://xyz-ix568e169-rachitchaurasia17-4865s-projects.vercel.app`
(preview target, staging Supabase, secret scan clean).

Codex's live systems (provisioning, `provision-dealer`, `plotmap_activate_device`,
device limits/revocation, passcode hashing, Dealer 360, platform-admin auth,
RLS) are unchanged.

## Why the Supabase + production steps are NOT done here

Two of the stop conditions you listed are actually true in this session:
- The **Supabase CLI is authenticated but linked to the PRODUCTION project**
  (`czmkfmkmgqlienmdihul` / "PROPERTY"; staging `rhmimpcirjbksjmhludg` is
  `linked: false`). A `migration up` / `db push` from here would hit
  **production before staging** — refused.
- The Supabase **MCP connector needs an OAuth authorization** that can't be
  completed in a non-interactive session.
- I also cannot type real credentials, so the authenticated test matrix
  (create dealer / activate / sign in) can't be run by me.

So: all **code** is complete + verified; the **DB apply, edge-function
deploy, authenticated tests, and production promotion are yours to run** with
the exact steps below.

## What is complete in code (verified via the render harness + static checks)

1. **Login bug — device gate is now anon-direct.** `device-access.js`
   calls `plotmap_device_is_approved` (anon-granted, pure bcrypt-hash check)
   **without** a dealer JWT, so a stale JWT can't 401 before the function
   runs. `rpc()` also keeps a 401→anon retry as a safeguard. No account /
   token / limit / revocation checks weakened.
2. **Five reason-aware states** (exact spec copy), across
   `access-expired.html` + `access-control.js` + `device-access.js`:
   Device not activated · Device access revoked · Trial expired · Account
   suspended · Device limit reached. Account-inactive without a server split
   shows a combined message and never mislabels an active trial as expired.
   The additive rollout migration adds a token-bound, read-only reason RPC so
   the dealer's own block screen can distinguish trial expiry from suspension
   without exposing account state to arbitrary anonymous callers or creating
   a legacy pending-device row.
3. **Developer Control consolidated** to 6 nav items — Platform Overview,
   All Dealers, Dealer 360, Device Codes, Dealer Devices, Create Dealer.
   Standalone "Account Controls" removed; every per-dealer action lives in
   **Dealer 360 → Account** (trial, passcode reset, suspend/reactivate,
   permanent delete). Fixed a latent Codex bug (`account-preview` had no id →
   threw when leaving Create Dealer after provisioning).
4. **Device codes unified:** "Activation Requests" → **Device Codes**
   (`datetime-local`, +24h default, single-use), legacy pending list hidden
   unless legacy rows exist; **Dealer 360 → Devices → Generate device code**
   jumps there with the dealer preselected.
5. **Delete-dealer — finalized for staging verification (NOT applied/deployed):**
   `supabase/migrations/20260724000100_onboarding_access_and_dealer_deletion.sql` (advisory lock,
   idempotent already-deleted path, excludes caller / platform admins /
   users shared with another dealer from Auth deletion, id-or-brand
   confirmation, secret-free tombstone with an operation id) +
   `supabase/functions/delete-dealer/index.ts` (surfaces `already_deleted`,
   retries Auth cleanup from the tombstone). UI in Dealer 360 → Account →
   Danger zone requires typed confirmation and degrades to "not enabled yet"
   until deployed.

## STAGING runbook (do this first)

1. Point the CLI at staging: `supabase link --project-ref rhmimpcirjbksjmhludg`.
   **Verify** `supabase projects list` shows staging `linked: true` before
   any apply.
2. Apply only the reviewed additive migration (controlled, NOT `db push`):
   `20260724000100_onboarding_access_and_dealer_deletion.sql`.
3. Deploy the edge function to staging with JWT verification and the origin
   allow-list:
   `supabase functions deploy delete-dealer --project-ref rhmimpcirjbksjmhludg`
   then set `PLOTMAP_ALLOWED_ORIGINS` to the staging preview origin and
   confirm `SUPABASE_SERVICE_ROLE_KEY` is set as a function secret (never in
   the browser).
4. Run the test matrix on the preview above (onboarding, activation/login,
   account states, replacement devices, deletion, regression). The delete
   path: create a throwaway staging dealer → delete via Dealer 360 → confirm
   purge + tombstone + unrelated dealer untouched + platform admin untouched
   + repeat-delete idempotent + cross-dealer confirmation rejected.

## PRODUCTION runbook (only after staging passes)

1. Snapshot: create a scoped restorable backup of the production DB; verify
   the round-trip/checksum. Preserve the current production Vercel deployment
   id for rollback.
2. `supabase link --project-ref czmkfmkmgqlienmdihul` (verify linked:true).
3. Read-only preflight (functions absent, RLS on, platform admin exists).
4. Deploy `delete-dealer` to production with `PLOTMAP_ALLOWED_ORIGINS =
   https://property-software.vercel.app` and the service-role secret.
5. Apply `20260724000100_onboarding_access_and_dealer_deletion.sql` (additive) to production.
6. Post-checks (function exists + admin-gated; tombstone table deny-all;
   ingestion still gated).
7. Merge `fix/onboarding-login-simplify` → `main`; push. Vercel builds
   **property-software** (production). Confirm Ready, runtime-env.js uses the
   **production** project, no staging value in the build.
8. Production smoke test (Developer Control, Create Dealer, first-code
   activation, immediate login, refresh stays approved, used-code rejected,
   revoke → "Device access revoked", replacement code, device limit, delete a
   throwaway prod dealer, isolation, Client Presentation, Map Studio,
   Properties). Remove all temporary test fixtures. Preserve backup +
   rollback deployment.

## Confirm the login fix on the preview (needs a real login — I can't)

Log in as a dealer whose device you just activated, DevTools→Network open;
confirm the `plotmap_device_is_approved` call is **anon** (no dealer JWT) and
returns `true`. If a block still appears, capture that request + the device
row in Dealer 360 → Devices.
