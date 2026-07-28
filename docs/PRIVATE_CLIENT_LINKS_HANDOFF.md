# Private Client Links backend handoff

Migrations, in order:

1. `20260728000100_private_client_links.sql`
2. `20260728000200_private_client_links_grant_hardening.sql`

The second migration removes legacy broad `share_links` grants found by the
live verifier. Anonymous users retain no direct table privilege, while signed-in
users retain only SELECT/INSERT/UPDATE/DELETE behind dealer-scoped RLS.

The feature extends `share_links`. A 256-bit bearer token is returned once and
only its SHA-256 hash is stored. The create RPC builds a frozen allowlisted
snapshot from dealer-owned CRM rows. The anonymous resolver returns that safe
snapshot only; private object paths are available solely to the Edge resolver,
which exchanges them for 15-minute signed URLs.

Dealer management RPCs are scoped by the signed-in profile, dealer, role and
Phase 4 account gate. Private-link rows cannot be forged through direct
`share_links` writes. Public engagement events are allowlisted, size-limited,
hashed, rate-limited and idempotent. Event rows are append-only to browsers.

Storage bucket `client-link-audio` is private. Dealer uploads use
`dealers/<dealer_id>/client-links/<random-file>` and are checked by RLS. The
dealer-deletion Edge Function cleans both property photos and client-link audio.

Verification: run `tools/verify-private-client-links.sql` through the linked
database query command. It creates isolated fixtures inside a transaction and
always rolls them back.

Frontend route: `/client/?token=<one-time-returned-token>`. The route removes the
token from browser history immediately, sends it only in POST bodies, and never
stores it in localStorage or sessionStorage.
