# 26 · Open Gaps and Uncertainties

Honest list of what this audit could **not** confirm, and decisions V2 still needs.

## Could not verify in this session (`UNVERIFIED-LIVE`)
1. **Live Supabase state.** The Supabase MCP connector was unauthenticated, so live tables,
   live RLS, live grants, deployed Edge-function versions, and applied-migration order in the
   real project were **not** queried. All DB facts here come from the migration SQL on disk,
   which is the contract to port. **Action:** once V2's Supabase is provisioned, run
   `list_migrations`, `list_tables`, `get_advisors`, and the `verify-*` scripts to confirm.
2. **Production deployment reality.** Vercel project name (`property-software`), production
   URL, and "what is live" are `REPORT-CLAIM` only. Not inspectable here.
3. **Deployed Edge-function env values** (allowed origins, service-role wiring). Only the
   source is verified, not the deployed config.

## Report vs repository conflicts (resolved stance)
| Topic | Report | Repo | Stance |
|---|---|---|---|
| Production % complete | "65–70%" then "production ready" | commit `b894245` exists | Treat as serial snapshots; only `b894245` is verified |
| Edge fn names | "never supplied" | 3 functions verified | Repo wins |
| `crm-ui.css` location | root | `admin/crm-ui.css` | Repo wins |
| Client-link tables/RPCs | "unspecified" | fully verified (`13`,`15`) | Repo wins |
| `plotmap_deal_followups_v1` | claimed | verified `deals.html:65` | Confirmed |

## Not fully read at line level (contract captured, internals summarized)
- `app/plotmap/app.js` (2213 lines) and `overlay-engine.js` — the map render math. Contract
  and public behaviour documented (`11`,`12`); port the files wholesale rather than
  re-deriving. **Action:** treat as REUSE; do not rewrite.
- `admin/core/saas-foundation.js` (665), `dev360.js` (680), full `access-control.js` (600) —
  key APIs and role model captured; some helper internals summarized.
- Device RPC SQL bodies (`plotmap_device_*`, `plotmap_submit_activation_request`) — call
  contracts verified from the client; exact SQL signatures to confirm in the provisioning /
  auto-approve / onboarding migrations when porting.

## Product/design decisions V2 still needs
1. **Approved design source of truth per route.** The report references an approved Claude
   design (landing) and pending redesigns for several routes. V2 needs a **design → route
   inventory** (desktop/tablet/mobile + empty/loading/error states) before Pass 1. This
   blueprint documents behaviour, not final pixels for every screen.
2. **Demand as a standalone surface** vs a CRM view — confirm the intended UX.
3. **Auxiliary pages** (`maps/editor/finance/reports/access`) — confirm which survive into V2.
4. **Framework choice** for the dealer app (blueprint recommends Vite+TS framework-light;
   final call is the team's — `22`).
5. **crm_records typed split** vs keep polymorphic — trade-off in `08`/`22`; decide before
   Pass 2.
6. **Multi-city map coverage / highlight-data drift** — project memory notes highlight data
   covered mainly New Chandigarh at one point; confirm current map/overlay coverage.

## Risk register (top)
| Risk | Mitigation |
|---|---|
| Porting a stale `_draft` migration | prefer enforced version; run `verify-*` (`19` P5) |
| Losing a security invariant during rewrite | `20` is the checklist; `verify-*` gate each pass |
| Map regression during re-house | REUSE engine wholesale; aspect-ratio tests (`24 E`) |
| Assuming report's "production ready" is current | re-verify live before trusting (`gap 1-2`) |
| Re-introducing CDN/global coupling | explicit module graph; self-host SDK (`22`) |
