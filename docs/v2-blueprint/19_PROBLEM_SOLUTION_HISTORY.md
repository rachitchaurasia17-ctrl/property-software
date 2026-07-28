# 19 · Problem → Cause → Solution History

Each entry: **symptom → affected feature → root cause → rejected/unsuccessful approaches →
final fix → files → consequence → regression test.** Evidence label per entry. Machine
mirror: `manifests/problems-and-fixes.json`.

---

### P1 · Legacy broad table grants masked by RLS `VERIFIED-SQL`
- **Symptom:** anon/authenticated had direct table privileges on `share_links` /
  `client_link_events` that RLS happened to mask — a latent privilege-escalation surface.
- **Root cause:** production carried legacy broad grants from earlier migrations.
- **Final fix:** `20260728000200_private_client_links_grant_hardening.sql` revokes all from
  anon/authenticated, then re-grants only the DML dealer-scoped RLS needs; anon gets nothing.
- **Consequence:** anon can never touch these tables directly; only the allowlisted RPCs.
- **Regression test:** `verify-private-client-links.sql:140-145` asserts the grants are gone.

### P2 · `runtime-env.js` 404 in production `VERIFIED-CODE` (from `.vercelignore` comment)
- **Symptom:** the generated runtime config 404'd on the deployed site.
- **Root cause (two):** `tools/` was excluded from the Vercel upload (so the generator never
  ran), and a stale committed `runtime-env.js` could survive.
- **Final fix:** `.vercelignore` explicitly keeps `tools/`; `build-dist.js` excludes any
  committed `config/runtime-env.js` and regenerates it into dist every build; `vercel.json`
  serves it `no-store`.
- **Regression test:** build succeeds and `dist/config/runtime-env.js` exists; `no-store`
  header present.

### P3 · Direct-anonymous table-access / mis-scoped write risk `VERIFIED-CODE`
- **Symptom:** a production-admin write with an unresolved dealer could silently land in the
  demo tenant.
- **Final fix:** the data adapter stamps `'__unresolved__'` (not `dealer-demo`) in production
  admin when no dealer resolves — fails closed; RLS rejects it server-side too.
- **Files:** `admin/core/data-adapter.js:222-232`.
- **Regression test:** unit-test the stamping precedence; server RLS rejects `__unresolved__`.

### P4 · Media-path exposure risk on client links `VERIFIED-SQL`/`VERIFIED-CODE`
- **Symptom:** raw storage paths / seller data could leak to buyers.
- **Final fix:** the public snapshot RPC returns **only public photo ids** + client-safe
  fields; real sources live in `metadata.client_media`, readable only by the service-role
  media RPC; the Edge broker signs 15-min URLs and drops non-https photos.
- **Files:** link migration `create/resolve` RPCs, `resolve-client-link/index.ts`.
- **Regression test:** `verify-private-client-links.sql:89-98` (no leak; anon gets no media).

### P5 · Migration-history drafts superseded by enforced versions `VERIFIED-SQL`/`INFERENCE`
- **Symptom:** duplicate/overlapping helper definitions across `_draft` and enforced files
  (`plotmap_dealer_is_active` in 3 files; team-role helpers in draft + enforcement).
- **Cause:** iterative migration authoring; drafts left in place.
- **Consequence:** a naive replay could apply stale drafts. **When porting, prefer the
  enforced/latest definition of each object.**
- **Regression test:** after porting, `plotmap_*` function bodies match the latest file;
  run all `verify-*` scripts.

### P6 · Open-redirect on login `VERIFIED-CODE` / `HISTORICAL` (report Phase-1 note)
- **Symptom:** login `next` param could redirect off-origin.
- **Final fix:** `buildLoginRedirect` always returns same-origin `/` with `next`/`reason` as
  query params.
- **Files:** `admin/core/auth.js:238-244`.
- **Regression test:** feeding an absolute external `next` never navigates off-origin.

### P7 · Presentation-events double-write / clobber `VERIFIED-CODE`
- **Symptom:** `app_open` could be clobbered by a later event's read-modify-write on
  localStorage; upserting `presentation_events` would corrupt the append-only log.
- **Final fix:** `app_open` records+saves first (`maybeMarkAppOpen`); sync path treats
  `presentation_events` as **append-only (INSERT, never upsert)**.
- **Files:** `event-tracker.js:145-147`, `supabase-sync.js:235-238`.
- **Regression test:** never upsert `presentation_events`; `app_open` precedes other events.

---

## Report-claimed issues (label `REPORT-CLAIM` / `HISTORICAL` — verify in V2 planning)

These come from the attached Master Context Report and in-repo handoffs; not all were
independently confirmable here, but each is a real risk class to guard against in V2:

| # | Issue | Guard in V2 |
|---|---|---|
| R1 | Conflicting old & new CSS systems (`admin/crm-ui.css` vs violet-dusk) | one design system; prohibit `crm-ui.css` (`21`) |
| R2 | Duplicate shell / navigation patterns | one shell, one nav source |
| R3 | Dashboard empty-array crash | defensive derivation + empty-input tests (`10`,`24`) |
| R4 | Fabricated dashboard data / demo activity | derive-only; no fake data |
| R5 | Map cropping & distortion | per-rendering dimensions; aspect-ratio test (`11`,`12`) |
| R6 | Wrong Vercel project linking / prod-staging confusion | explicit project + env checks (`17`) |
| R7 | Unauthenticated Supabase CLI | authenticate before migrate/deploy |
| R8 | Oversized AI prompts / repeated model failures | this blueprint exists to prevent re-reading legacy |
| R9 | Incomplete one-go migrations | staged V2 build sequence (`23`) |
| R10 | Frontend redesign mixed with backend-security work | separate passes (`22`,`23`) |
| R11 | Temporary test-data cleanup | no fixtures in dist; cleanup verified |

## Conflicts between report and repository
- Report said several file paths/names were "unspecified/unverified." The repo **confirms**
  them (Edge fn names, client-link tables/RPCs, `crm-ui.css` location, `plotmap_deal_followups_v1`).
  Where the report was vaguer than the code, **the code wins** for implementation facts.
- Report's production status oscillated ("65–70%" vs "production ready"); treat as
  **serial snapshots**, not current truth. The **reference commit `b894245`** is the only
  verified state. See `26`.
