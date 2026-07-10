# Developer Control & Trial Analytics

Updated: 2026-07-10. Covers the developer-only dealer control panel
(`/admin/developer.html`), passcode-based dealer login, and the trial usage
analytics foundation.

## Architecture in one paragraph

The frontend is static and ships only the Supabase **publishable** anon key.
Everything privileged therefore lives server-side: the developer panel reads
and writes exclusively through `plotmap_admin_*` SECURITY DEFINER RPCs that
raise `platform admin required` unless the signed-in profile is registered in
`public.platform_admins` (phase 4, live). Passcodes are verified inside
Postgres against bcrypt hashes in a deny-all table; the frontend never holds a
passcode beyond the login keystrokes. Analytics reuse the existing
`presentation_events` pipeline (local queue → `plotmap_record_presentation_event`
RPC) — there is **one** analytics system, not two.

## Dealer passcode login — how it works

1. Dealer opens `/`, clicks **Dealer Login → "Have a passcode? Sign in with
   passcode"**, and enters only the passcode.
2. The page calls the anon-executable RPC `plotmap_passcode_login(p_passcode)`.
   Server-side it: sleeps ~250 ms (brute-force damping), rejects passcodes
   under 8 chars, compares against bcrypt hashes (`crypt(pass, hash)`) in
   `public.dealer_passcodes` (RLS deny-all, no grants — reachable only through
   SECURITY DEFINER functions).
3. Outcomes:
   - **No match** → zero rows → "Invalid passcode." (no oracle for which
     dealers exist).
   - **Match but dealer suspended/expired** (`plotmap_dealer_is_active` =
     false) → `status='blocked'`, login email withheld → clean blocked
     message.
   - **Match + active** → returns `dealer_id` + `login_email`; the page then
     performs a **normal Supabase password sign-in** with
     `(login_email, passcode)` — the passcode doubles as that dealer's auth
     password. From here the session, profile, role and RLS scoping are
     identical to email login. Dealer sees only their own data.
4. Email + password sign-in still works unchanged (same form, default mode).

Why backend changes were required: a static frontend can never verify a
secret safely (any JS check is readable), and only a real Supabase Auth
session gets RLS-scoped write access. See the rationale header in
`supabase/migrations/20260710_developer_control_and_trial_analytics_draft.sql`.

## How the developer creates a dealer

One-time manual steps (until an Edge Function automates them):

1. Supabase Dashboard → Authentication → **Add user**: dealer login email,
   password = the passcode, auto-confirm ON.
2. SQL editor: `insert into public.profiles (id, email, role, dealer_id,
   status) values ('<auth-user-uuid>', '<login email>', 'owner',
   '<dealer-id>', 'active');`
3. `/admin/developer.html` → **Create dealer**: writes `dealer_settings`
   (account/trial via the live phase-4 RPC `plotmap_admin_set_dealer_account`),
   directory fields (owner name/phone/area via
   `plotmap_admin_upsert_dealer_directory`) and the passcode hash
   (`plotmap_admin_set_dealer_passcode`). Each step reports ✓/✗ honestly;
   steps needing the pending migration are skipped **loudly**, never faked.
4. Hand the dealer the passcode. Shown once in the panel; stored only as a
   bcrypt hash.

## How the developer resets a passcode

`/admin/developer.html` → dealer row → **Passcode…** → generate/enter a new
one → Save. Then update the dealer's auth-user password to the same value in
Supabase Dashboard → Authentication (a pure-SQL `auth.users` update is
possible but intentionally NOT shipped — flagged for review in the migration
notes).

## Suspend / activate / expire

Dealer row → **Suspend / Activate / Expire** → `plotmap_admin_set_dealer_account`.
Enforcement is server-side and immediate:

- `plotmap_dealer_is_active()` returns false → the client RPCs
  (`plotmap_client_properties/maps/overlays`) return nothing and
  `plotmap_record_presentation_event` rejects — the Client Presentation goes
  dark for that dealer.
- Phase-4 RLS write policies include `plotmap_dealer_can_write()` → all
  dealer writes are rejected.
- `PMAccess.guardPage` now also asks the server (`plotmap_dealer_is_active`)
  on admin page loads (cached 5 min per tab) and shows the blocked screen —
  so a suspended dealer is locked out even with stale/edited localStorage.
  Offline/unknown never blocks (offline grace still applies).

## Trial analytics — what is tracked

One pipeline: events go to the local queue and drain to
`presentation_events` via the `plotmap_record_presentation_event` RPC
(append-only for anon; **never upserted**). Admin-side events carry
`metadata.surface='admin'`.

Client Presentation events (existing, unchanged):
`presentation_opened`, `map_opened`, `area_viewed`, `sector_viewed`,
`property_selected`, `property_viewed`, `client_panel_opened`,
`sector_proof_clicked`, `original_proof_clicked`, `brochure_shared`, and now
an explicit `property_shared_whatsapp` on every WhatsApp share.

Dealer product events (new, in `admin/core/event-tracker.js`
`trackProductEvent`): `dealer_login` (once per browser session),
`dealer_dashboard_opened`, `team_workspace_opened`, `properties_page_opened`,
`map_studio_opened`, `clients_page_opened`, `insights_page_opened`,
`property_add_clicked`, `property_added`, `admin_page_opened` (generic).
Page opens fire automatically from `PMNav.render` (Map Studio fires directly —
it has no topbar).

**Intentionally NOT tracked:** session heartbeats (noisy; sessions/return
days are derived from distinct `session_id`s and event days), anything on
`/admin/developer.html` (developer usage must not pollute dealer analytics),
prices, seller/owner contacts, commissions, internal notes, client personal
data (the sanitizer in event-tracker.js strips blocked keys and price-like
strings before any event is stored).

If analytics fail (offline, suspended dealer, RPC error), events queue or
fail silently — the product never breaks or surfaces sync errors.

## Reviewing a trial after 7 days

Open `/admin/developer.html` → dealer row → **Summary**:
trial day count, last active, sessions, active days, logins, presentation
opens, property opens, map opens, WhatsApp shares, Map Studio opens,
dashboard opens, total events, a 30-day per-feature breakdown, and a
computed usage strength (Low / Medium / Strong from a weighted score:
sessions×2 + active_days×3 + presentation_opens×2 + whatsapp_shares×4 +
property_opens + map_opens; ≥60 Strong, ≥20 Medium). Use the notes box for
sales feedback (saved to provider-only `developer_notes`).

Reading it: **Strong** → call about the paid plan. **Medium** → call, ask
what's missing. **Low + never active** → didn't start; re-onboard or drop.

## Backend state / what must be applied

Live today (verified against the project by probing with the anon key):
phase 2 RPCs + anon lockdown, phase 4 account gating +
`plotmap_admin_list_dealer_accounts` / `plotmap_admin_set_dealer_account`.

Pending — apply `supabase/migrations/20260710_developer_control_and_trial_analytics_draft.sql`
(review first; it is additive-only) to enable:

- `dealer_passcodes` table + `plotmap_passcode_login` +
  `plotmap_admin_set_dealer_passcode` (passcode login),
- `owner_name/owner_phone/primary_area/developer_notes` columns +
  `plotmap_admin_upsert_dealer_directory` / `plotmap_admin_dealer_directory`,
- `plotmap_admin_set_dealer_trial` (trial start + notes),
- `plotmap_admin_dealer_usage` / `plotmap_admin_dealer_event_breakdown`
  (cross-dealer analytics aggregates).

Also register yourself once:
`insert into public.platform_admins (profile_id, status) select id, 'active'
from public.profiles where email = '<your admin email>';`

Until the migration is applied the developer panel shows a precise amber
banner and disables exactly those features — the dealer list and
suspend/activate/trial-end/payment-notes work today via phase 4.

## Current limitations

- Dealer auth-user + profile creation is manual (Dashboard + SQL); an Edge
  Function with the service key (server-side only) would automate it.
- Passcode reset does not auto-sync the auth password (manual Dashboard step).
- The developer page HTML shell is publicly fetchable (static host) — but it
  renders nothing without a platform-admin session; all data is server-gated.
- Admin/presentation sharing one browser shares `localStorage` (`plotmap_crm_v1`)
  — the presentation UI renders only client-safe fields, but the invariant
  "presentation device never *holds* internal data" requires not using the
  dealer admin on the client-facing device. Documented known issue.
- Bare `/app/plotmap/` visits (no `?dealer=`/share link) intentionally default
  to the `dealer-demo` POC tenant. Admin surfaces no longer ever fall back to
  dealer-demo in production (fail closed with `__unresolved__`).

## Pending future tasks (intentionally skipped now)

- Map readiness system
- Property-to-map linking
- Client-safe map/property share links
- Offline support (after maps are ready)
- Photo signed-URL broker (Storage photos stay hidden from clients until it
  exists; URL photos work; uploader stays hidden unless the provider sets
  `storage_enabled=true`)
- Team permission testing / full staff login model
