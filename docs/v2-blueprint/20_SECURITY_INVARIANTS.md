# 20 · Security Invariants

The non-negotiable rules V2 must preserve. Each is `VERIFIED-CODE`/`VERIFIED-SQL` at commit
`b894245`. Violating any of these is a release blocker.

## Identity & tenancy
1. **RLS is the real boundary; the client guard is only "honest UI."** Never move an
   authorization decision into client JS. `access-control.js:1-5`.
2. **Every tenant query is anchored to `plotmap_current_dealer_id()`** plus a scope check
   plus an account-state check. No table is readable/writable cross-tenant. `§15`.
3. **Unresolvable dealer fails closed** as `'__unresolved__'`, never the demo tenant.
   `data-adapter.js:222-232`.
4. **Platform-admin authority is server-only** (`plotmap_is_platform_admin`), never a
   localStorage/client flag. `access-control.js:311`, edge fns.

## Keys & config
5. **The service-role key exists only inside Edge runtimes.** Browser config actively
   **rejects** service-role keys and only accepts public `https://*.supabase.co` pairs.
   `supabase-config.js:9-41`.
6. **The build secret-scans dist and fails on any secret** (`sb_secret_`, service-role JWT,
   connection string, private key, `.env`). `build-dist.js:112-138`.
7. **Runtime config is never cached** (`no-store` on `/config/runtime-env.js`). `vercel.json`.

## Devices
8. **Device token is opaque + local-only; server compares only hashes.**
   `device-access.js:1-24`.
9. **Dealer binding never comes from the URL.** `device-access.js:26-36`.
10. **The route gate is read-only** (`plotmap_device_is_approved` never inserts); pending
    devices are created only by the explicit activation flow. `device-access.js:72-93`.

## Private Client Links
11. **Only a SHA-256 hash of the token is stored; the raw token is returned once.**
    Verified never stored in plaintext. `link migration:359-374`, `verify:83-87`.
12. **The snapshot is frozen at creation and client-safe.** `sellerName`, `sellerPhone`,
    `commission`, `negotiationNotes` are never copied; price/exact-location gated by
    visibility. `link migration:318-331`, `verify:56-95`.
13. **Public snapshot RPC returns no media sources**; media sources are readable only by the
    `service_role` media RPC (`auth.role()='service_role'` check). `link migration:576-600`.
14. **Buyers never read storage directly**; buckets are private; media is 15-min signed URLs
    minted by the Edge broker; non-https photos are dropped. `§14`.
15. **Buyer token is stripped from browser history** on load. `client/app.js:6-8`.
16. **Client-link event writes are anon-RPC-only, rate-limited, idempotent, and reject
    secret-shaped metadata.** `link migration:602-686`.
17. **No direct anon/authenticated table grants on link tables** (grant hardening).
    `20260728000200`, `verify:140-145`.
18. **Cross-dealer management is impossible** (dealer B cannot list/revoke/extend dealer A's
    link). `verify:114-122`.

## Edge functions
19. **Strict CORS allowlist + `default-src 'none'` CSP + no-store + no request/secret
    logging** on all three functions. `§16`.
20. **Provisioning & deletion are platform-admin-gated, idempotent, and safely retryable**
    (fingerprint, tombstone, rollback). `§07`, `§18`.

## Deletion
21. **Permanent deletion is confirmation-guarded** (`confirm===dealer_id`) and reports
    partial cleanup as retryable so success is never falsely reported. `delete-dealer:162-245`.

## Content headers
22. **`/client/` is `noindex,nofollow,noarchive`, `no-referrer`, strict CSP.** `vercel.json`.

## Invariant → test map
Every invariant above is checked by a script or should be in V2 (`24`): grant/leak/isolation
by `verify-private-client-links.sql`; isolation by `verify-isolation.js`; secret-free dist by
`build-dist.js`; config rejection by `supabase-config` unit tests (add in V2).
