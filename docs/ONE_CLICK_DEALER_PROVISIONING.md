# One-click dealer provisioning

Status: staging and protected branch Preview verified. Production remains
blocked until a separate production rollout is explicitly approved.

## Existing systems reused

- `plotmap_is_platform_admin()` and `platform_admins` authorize the caller.
- `dealer_settings` remains the dealer/account source of truth.
- `profiles` remains the Auth user to dealer/role relationship.
- `plotmap_admin_set_dealer_passcode()` remains the bcrypt passcode writer.
- `dealer_access_codes` and `dealer_devices` remain the device onboarding
  system. Existing `dealer_activation_requests` remain available for legacy
  pending records only.
- `audit_logs` receives only attempt IDs and sanitized result codes.

No parallel dealer, profile, passcode, activation, device, or login system is
introduced.

## Architecture

The browser sends the completed Create Dealer form to the authenticated
`provision-dealer` Supabase Edge Function. The request includes the caller's
normal access token and a browser-generated idempotency key.

The Edge Function:

1. Validates the caller token with Supabase Auth.
2. verifies `plotmap_is_platform_admin()` using that caller token.
3. validates and normalizes the request again server-side.
4. claims an idempotent provisioning attempt through a protected RPC.
5. creates the Auth user with the service-role key held only by Supabase.
6. asks protected RPCs to bind the Auth UUID and atomically finalize the
   dealer, active owner profile, passcode hash, and one-time activation code.
7. streams safe stage names and a one-time result to the requesting browser.

The service-role key, database password, Auth admin token, access token, and
refresh token are never returned to the browser. CORS is defense in depth;
the JWT and database authorization checks are the security boundary.

## Idempotency and compensation

`dealer_provisioning_attempts` is RLS-enabled and deny-all. It stores hashes
of the idempotency key and retry passcode, never plaintext credentials.

- Per-actor, dealer, and email advisory locks serialize attempt creation.
- A five-minute orchestration lease lets only one Edge invocation proceed.
- A simultaneous retry receives `PROVISIONING_IN_PROGRESS` and performs no
  compensation against the active invocation.
- An expired lease can be reclaimed for an interrupted request.
- A recoverable failure can be retried with the same idempotency key and
  passcode, up to ten attempts.
- An existing unrelated Auth user is never adopted or deleted.
- If this invocation creates an Auth user and database finalization fails,
  it deletes only that newly created Auth user.
- If deletion fails, the attempt retains the Auth UUID as recoverable. A
  retry accepts only a user marked with the same attempt and dealer metadata.
- Dealer/profile/passcode/activation writes finalize in one database
  transaction. A failed finalization cannot leave them partially committed.

Completed attempts clear the retry passcode hash. Replaying a completed
request returns no passcode or activation code.

## Activation and device approval

New access codes are exactly eight digits, generated from cryptographic random
bytes with rejection sampling, bcrypt-hashed, dealer-scoped, single-use, and
limited to a maximum 30-day expiry.

`20260723_auto_approve_device_activation.sql` adds the public
`plotmap_activate_device` RPC. The dealer comes only from the hashed code row,
not browser input. The RPC locks the code row and dealer settings row, checks
account status and the approved-device limit, creates an approved device, and
consumes the code in one transaction. It stores only bcrypt hashes.

The consumed code records the approved device ID. If the transaction commits
but its response is lost, the same code and device token can recover the
approved result. The same code with another device token returns
`already_used`. A limit rejection does not consume the code, allowing it to be
used after an old device is revoked or the limit is raised.

New browser redemptions cannot call `plotmap_submit_activation_request`.
Existing pending rows, lookup status, approve/reject controls, and history stay
available for legacy requests.

The migration retires browser access to the old unscoped activation-code RPC.
This means the database/function/frontend production rollout must happen in a
short controlled window; applying the migration while leaving the old
Developer Control frontend live would make its legacy code form unusable.

## One-time credential display

The successful response contains the initial passcode and activation code once.
Developer Control holds them only in a JavaScript variable and visible text
nodes. It does not put them in URLs, browser storage, analytics, console output,
or DOM data attributes. Navigating away from Create Dealer clears the variable
and visible values. `pagehide` also clears them so browser back/forward cache
cannot restore a one-time success screen. The backend has no credential
recovery endpoint.

## Staging apply order

The private staging environment must be Git-ignored and must resolve to a
project ref different from production. The existing Phase 1-4, 20260710, and
Dealer 360 migrations must already be present.

1. Run a transaction-wrapped dry run of
   `supabase/migrations/20260722_one_click_dealer_provisioning.sql` against the
   linked staging database and roll it back.
2. Resolve every SQL error before proceeding.
3. Apply that one migration to staging through the controlled single-file
   query process. Do not use `supabase db push`.
4. Set `PLOTMAP_ALLOWED_ORIGINS` on the staging Edge Function to the exact
   staging Preview origin(s). Supabase supplies `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` inside the function.
5. Deploy only `supabase/functions/provision-dealer` to the staging project.
6. Dry-run and then apply only
   `supabase/migrations/20260723_auto_approve_device_activation.sql` with
   `tools/run-auto-device-activation-staging-migration.js`. Do not use
   `supabase db push`.
7. Run `node tools/verify-dealer-provisioning.js`.
8. Run `node tools/verify-dealer-provisioning-staging.js`.
9. Deploy the feature branch to Vercel Preview with its existing staging
   public runtime configuration.
10. Complete browser QA with separate platform-admin and dealer profiles.

## Staging preflight

Before applying, check:

```sql
select lower(email), count(*)
from public.profiles
where email is not null
group by lower(email)
having count(*) > 1;

select count(*) as legacy_pending_without_dealer
from public.dealer_activation_requests
where status = 'pending' and dealer_id is null;

select count(*) as legacy_active_codes_without_dealer
from public.dealer_access_codes
where dealer_id is null
  and status = 'active'
  and (expires_at is null or expires_at > timezone('utc'::text, now()));

select count(*) as active_platform_admins
from public.platform_admins
where status = 'active';
```

Expected: no duplicate profile email, no legacy unscoped pending request, no
live unscoped activation code, and at least one active platform admin.

## Required Edge Function configuration

- `PLOTMAP_ALLOWED_ORIGINS`: comma-separated exact Preview origins.
- `SUPABASE_URL`: Supabase-provided hosted function environment value.
- `SUPABASE_ANON_KEY`: Supabase-provided hosted function environment value.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase-provided hosted function environment
  value. It must never be placed in Vercel or frontend runtime configuration.

## Staging verification evidence

Verified on 22 July 2026 against the guarded non-production staging project:

- Atomic auto-activation migration dry run rolled back successfully in
  11.543 seconds; the same migration then applied to staging in 5.439 seconds.
- Static provisioning/security verifier: 59/59.
- Live provisioning and auto-activation matrix: 62/62. It covers immediate
  first-device approval and login, idempotent same-device retry, simultaneous
  different-device redemption, expiry, suspension, expired trial, device
  limits, second devices, revocation/replacement, dealer scoping, hash-only
  storage, Dealer 360 visibility, and legacy pending-request approval.
- Dealer 360 static verifier: 28/28; live staging verifier: 22/22 after its
  tracked server-time rate fixture was refreshed.

- Final transaction-wrapped migration dry run rolled back successfully in
  7.580 seconds.
- Final staging-only migration update applied successfully in 7.979 seconds.
- `20260722_one_click_provisioning_post_checks.sql` passed.
- Static provisioning/security verifier: 47/47.
- Live one-click provisioning matrix: 45/45.
- Dealer 360 static verifier: 28/28.
- Dealer 360 live staging verifier: 22/22 after refreshing its documented
  server-time rate fixture.
- Device-aware isolation verifier passed direct-table denial, same-dealer
  client reads, and cross-dealer event rejection.
- Runtime configuration verifier: 6/6. A Preview-mode build contained the
  complete staging public pair, no production project ref, and no secret key.
- The Vercel Preview serves that same staging runtime pair with `no-store`
  caching. Deployed Developer Control, CSS, and Client Presentation assets
  match the staging build; Vercel adds only its normal Preview toolbar script.
- The Preview origin receives a `204` Edge preflight with an exact origin
  response. An untrusted origin receives `403`.
- Local Developer Control, all main sections, all seven Dealer 360 tabs, and
  Client Presentation loaded without console warnings or errors.
- Tablet landscape had no horizontal overflow. Client Presentation contained
  no price, sold, add/edit, dealer/team login, admin, or unverified labels.

The live audit exposed and fixed one staging-only SQL defect before release:
the activation request function's output column named `status` conflicted with
an unqualified activation-code update. The update now uses an explicit table
alias, and the complete device lifecycle passes.

## Remaining production cautions

- The public activation-code redemption path keeps bcrypt, expiry, single-use,
  account-gating, and device-limit protections. It does not add an IP-based
  gateway rate limit in this phase. Keep the pilot origin controlled and add
  gateway/WAF throttling before broad public distribution.
- Provisioning returns credentials once. If the database commits but the
  browser loses the final response, replay intentionally returns no credentials;
  use the existing passcode reset and dealer-scoped replacement-code flows.
- The migration retires the old unscoped activation-code RPC. Use the short
  controlled rollout order below so the old admin form is not left live after
  the database lockdown.

## Production rollout and rollback

Production remains blocked until all staging evidence is green.

Approved rollout order:

1. Create/verify a current database backup.
2. Run the duplicate-email and legacy-pending preflight queries.
3. Deploy the Edge Function to production but do not expose the new UI yet.
4. Apply `20260722_one_click_dealer_provisioning.sql`, followed by
   `20260723_auto_approve_device_activation.sql`, in the production SQL editor
   during a short admin maintenance window.
5. Deploy the verified frontend immediately afterward.
6. Run platform-admin, provisioning, login, activation, approval, device-limit,
   Dealer 360, and Client Presentation smoke tests.

Rollback is frontend-first: restore the previous Vercel deployment. Because
the migration revokes the old unscoped activation RPC, database rollback must
restore the previous activation function definitions and grants from
`20260710_developer_control_and_trial_analytics_draft.sql`. Do not delete
provisioned dealer data as a rollback mechanism. Leave the additive attempt
table and dealer-scoping columns in place until a separately reviewed cleanup.
