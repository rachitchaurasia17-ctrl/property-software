# 06 · Device Activation (code-level)

Source: `admin/core/device-access.js` (208 lines) — global `PMDeviceAccess`. All
`VERIFIED-CODE`. Reusable extract: `migration-kit/device-access/device-access.js`.

## Design summary

A dealer's **browser** must be an *approved device* before protected routes open. The
browser stores only an **opaque per-browser token**; Supabase stores and compares only
`crypt()`/hash forms of it through `SECURITY DEFINER` RPCs. The route gate is **read-only**
so merely loading a page (or opening a shared link) can never register a device — pending
requests are created only by the explicit activation flow.

## Key security invariants (do not weaken in V2)

1. **Token is opaque and local-only.** 32 random bytes → 64 hex chars in
   `localStorage['plotmap_device_token_v1']`, generated with `crypto.getRandomValues`.
   The server never receives the raw token except to hash-compare it. `device-access.js:10-24`.
2. **Dealer binding never comes from the URL.** `resolveDealerId` reads
   `localStorage['plotmap_dealer_id']` (written at activation or from the signed-in
   profile) — **never** `?dealerId`. A shared link alone must grant no access and must not
   silently steer a device. `device-access.js:26-36`.
3. **The gate is read-only.** `isApproved()` calls `plotmap_device_is_approved`, which
   **never inserts** a row. Pending devices are created only via
   `plotmap_submit_activation_request` (the explicit activation flow). `device-access.js:72-93`.
4. **Anon-direct approval.** Approval always runs with the public key, so a *stale dealer
   JWT* can never block the server-side token-hash check. `device-access.js:82-87`.

## Public API (`window.PMDeviceAccess`)

| Symbol | Purpose | RPC called | Side effects |
|---|---|---|---|
| `getToken()` | get/create opaque device token | — | writes `plotmap_device_token_v1` |
| `resolveDealerId(fallback)` | tenant id from localStorage only | — | none |
| `isApproved(dealerId?,opts?)` | **read-only** route gate check | `plotmap_device_is_approved` | none (never inserts) |
| `getStatus(dealerId?,opts?)` | detailed status (legacy) | `plotmap_device_status` | **may insert** a pending row — admin/dev use only |
| `getAccessReason(dealerId?)` | precise block reason, read-only | `plotmap_device_access_reason` | none |
| `requireApproved(dealerId?,opts?)` | gate + render block screen | above | renders block DOM on failure |
| `renderBlocked(reasonOrMessage)` | paint the block screen | — | replaces `document.body` |

## Status / reason vocabulary

`isApproved` returns `{ ok, dealerId, statusText }` where `statusText ∈ { approved,
unapproved, no_dealer, migration_required, error }`. `requireApproved` then enriches an
`unapproved` result via `getAccessReason` and maps it to a **reason key** for the block
copy. `VERIFIED-CODE` `device-access.js:140-205`.

Reason keys → block copy (`blockCopy`, the single source of block text, shared with
`access-expired.html`): `device_revoked`, `device_limit_reached`, `trial_expired`,
`account_suspended`, `account_blocked`, `migration_required`,
`device_not_approved`/`device_not_activated`, and a literal-message default.

## RPC contracts (server side — see `15`)

| RPC | Grantee | Returns | Registers device? |
|---|---|---|---|
| `plotmap_device_is_approved(p_dealer_id, p_device_token)` | anon | boolean | **No** |
| `plotmap_device_access_reason(p_dealer_id, p_device_token)` | anon | text reason | **No** |
| `plotmap_device_status(p_dealer_id, p_device_token, p_device_label, p_browser_info)` | anon/auth | row incl. status | **Yes (may insert pending)** |
| `plotmap_submit_activation_request(...)` | anon | pending request | **Yes** |

> The exact SQL bodies of these device RPCs live in migrations
> `20260722_one_click_dealer_provisioning.sql`,
> `20260723_auto_approve_device_activation.sql`, and
> `20260724000100_onboarding_access_and_dealer_deletion.sql`. `VERIFIED-SQL` (files present;
> confirm the specific signatures there when porting). Device limit / replacement / revoke
> logic is administered from Developer Control (`07`).

## Activation flow (Mermaid)

```mermaid
flowchart TD
  A[Open protected route or landing] --> B[getToken() → local device token]
  B --> C{isApproved(dealerId)?}
  C -- approved --> D[Route opens]
  C -- unapproved --> E[getAccessReason → reason key]
  E --> F[renderBlocked(reason): Enter activation code / Back to PlotMap]
  F --> G[User enters activation code]
  G --> H[plotmap_submit_activation_request → pending device]
  H --> I[Platform admin / auto-approve grants device]
  I --> C
```

## Failure & migration tolerance
Any device RPC returning HTTP 404 is treated as `migration_required` (backend not fully
configured) rather than a hard error, and the block screen says "PlotMap not configured."
`VERIFIED-CODE` `device-access.js:52, 88-92`.

## Cross-file dependencies
- Reads `plotmap_dealer_id` (written by `auth.js`). 
- Used by the admin `guardPage` (`access-control.js`) and the Client Presentation page
  (`app/plotmap/index.html`).

## V2 decision
**ADAPT (preserve security exactly).** Keep opaque-local-token + server-hash-only, the
read-only gate vs explicit-activation split, the never-from-URL dealer binding, and the
reason vocabulary. Re-house block-screen HTML into the V2 component system instead of
raw `document.body.innerHTML`.
