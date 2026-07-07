# Migration B — RPC Frontend Verification Checklist (Phase 2)

_Prepared by Claude · 2026-07-07 · gate before applying Migration B_

**Migration B = `supabase/migrations/20260707b_multi_dealer_anon_lockdown.sql`.**
It **revokes** the old direct anon paths (`client_safe_properties`,
`prebuilt_maps`, `map_overlays` SELECT; `presentation_events` INSERT) and drops
their public policies. It is **breaking if applied before the RPC frontend is
live**. Migration A (`20260707a_multi_dealer_rpc_setup.sql`) is applied and adds
the dealer-scoped RPCs; the frontend already calls them.

> ⚠️ **DO NOT apply Migration B until every item below passes on the deployed
> production frontend.** After lockdown, Client Presentation can ONLY read/write
> through the RPCs — any surface still using the old direct paths will break.

## RPCs the frontend must be using (Migration A)

| RPC | Frontend caller |
| --- | --- |
| `plotmap_client_maps(p_dealer_id)` | `app/plotmap/app.js` (base maps) |
| `plotmap_client_properties(p_dealer_id)` | `admin/core/supabase-sync.js` (client property pull) |
| `plotmap_client_overlays(p_dealer_id)` | `admin/core/supabase-sync.js` (overlay pull) |
| `plotmap_record_presentation_event(...)` | `admin/core/supabase-sync.js` (event queue drain) |
| `plotmap_resolve_share_link(slug)` | `app/plotmap/app.js` (share link → dealer_id) |

## Pre-lockdown verification (run on deployed prod, `b14be09` or later)

- [ ] **Root has 3 cards** — `/` shows Client Presentation, Dealer Login, Team Workspace.
- [ ] **Client Presentation loads** — `/app/plotmap/` opens with no blank/error state.
- [ ] **Maps load via RPC** — network shows `POST /rest/v1/rpc/plotmap_client_maps` returning the dealer's maps; base map renders.
- [ ] **Properties load via RPC** — `POST /rest/v1/rpc/plotmap_client_properties` returns rows; property list/pins render.
- [ ] **Overlays load via RPC** — `POST /rest/v1/rpc/plotmap_client_overlays` returns rows; highlights render.
- [ ] **Event queue writes via RPC** — interacting fires `POST /rest/v1/rpc/plotmap_record_presentation_event` (202/200), and the event appears in the dealer's Client Movement.
- [ ] **Share link resolves via RPC** — opening `?share=<slug>` calls `plotmap_resolve_share_link` and scopes to the right dealer.
- [ ] **No direct-table anon calls remain** — network shows **no** anon `GET /rest/v1/client_safe_properties`, `/prebuilt_maps`, `/map_overlays`, or `POST /rest/v1/presentation_events` (i.e. nothing that Migration B will revoke).
- [ ] **No console errors** on Client Presentation across area → sector → property → share.
- [ ] **No forbidden client data** — no price, sold, seller/owner contact, commission, finance, internal notes, or draft/hidden/archived maps visible. (`node tools/audit-plotmap.js` also passes.)
- [ ] **Two-dealer spot check** — a second dealer's `?dealer=` / share link shows only that dealer's data.

## After all boxes pass

1. Codex reviews Migration B one more time.
2. Apply Migration B on a **Supabase branch/staging** first.
3. Re-run this checklist on staging (esp. the "no direct-table anon calls" and
   two-dealer items — they must still pass with the anon paths revoked).
4. Only then apply to production, and re-verify Client Presentation immediately.

## Rollback note

If Client Presentation breaks after Migration B, re-granting the revoked anon
SELECT/INSERT and recreating the dropped public policies restores the old path
(Migration A RPCs remain). Codex owns the exact rollback SQL.
