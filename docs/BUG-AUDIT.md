# PlotMap Bug Audit — 2026-07-19

Branch: `developer-intelligence-and-performance`.
Environment caveat: Supabase was unreachable from the test machine this
session (DNS), so network-dependent flows (login, device activation
round-trips, RPC latency) are audited at code level and marked accordingly.
Every locally reproducible flow below was exercised in a real browser.

| ID | Severity | Route | Status |
|---|---|---|---|
| BUG-001 | **Blocker** | deployment / Client Presentation highlights | **FIXED** |
| BUG-002 | **High** | /app/plotmap/ | **FIXED + verified** |
| BUG-003 | Medium | /app/plotmap/ | **FIXED + verified** |
| BUG-004 | Medium | /admin/developer.html | **FIXED** (code-verified) |
| BUG-005 | Medium | /app/plotmap/ | **FIXED + verified** |
| BUG-006 | Medium | tools/verify-isolation.js | OPEN (documented) |
| BUG-007 | Low | deployment | **FIXED** |
| BUG-008 | Blocker | /admin/developer.html | FIXED earlier on this branch (`a7b18ca`) |

---

### BUG-001 — new city overlay SVGs missing from deployment (Blocker)
- **Repro:** deploy the branch; open a city with highlights; overlay SVG
  requests to `/public/plotmap-assets/{chandigarh,mohali,new-chandigarh,zirakpur-*}-overlays.svg` 404.
- **Root cause:** `vercel.json` `builds` listed only four hand-picked files
  from `public/plotmap-assets/`; everything else in that folder was never
  deployed. `datasets/overlays.js` references five SVGs there.
- **Fix:** `builds` now includes `public/plotmap-assets/**`;
  `.vercelignore` excludes the dev-only subfolders instead.
- **Files:** `vercel.json`, `.vercelignore`.
- **Verify:** post-deploy 200 sweep of the five SVG URLs (needs a deploy —
  could not be run this session).

### BUG-002 — browser Back exits the presentation entirely (High)
- **Repro:** open `/app/plotmap/`, open any city, press browser Back.
- **Expected:** return to the city gallery (a buyer holding the tablet stays
  inside the presentation).
- **Actual:** the browser left the page completely (previous document).
- **Root cause:** entering a city map mutated in-page state without pushing a
  history entry, so Back navigated the document, not the view.
- **Fix:** one history entry is pushed on gallery→map transitions
  (`enterPlanHistory()`); `popstate` restores the gallery. Second Back leaves
  the app normally. Deep-linked (`?property=`) entries get the same behavior.
- **Files:** `app/plotmap/app.js`.
- **Verified:** browser test — Back now lands on the gallery of the same page.

### BUG-003 — failed map asset left a permanently blank layer (Medium)
- **Repro:** make a masterplan image fail (404/offline mid-load); the layer
  stayed empty with no feedback and no recovery.
- **Root cause:** no error handling on the base-map `<img>`.
- **Fix:** failure state + visible "Map could not load — tap to retry" chip
  that rebuilds the map; `asset_load_failure` analytics event emitted.
- **Files:** `app/plotmap/app.js`, `app/plotmap/styles.css`.
- **Verified:** browser test — forced 404 → chip appeared → tap → map restored.

### BUG-004 — Developer Control boot issued duplicate admin RPCs (Medium)
- **Repro:** boot `/admin/developer.html` as platform admin; the directory,
  devices and activation-request RPCs each fired twice (~9 calls total).
- **Root cause:** the access-gate probe and the availability probes discarded
  their responses; the loaders then re-fetched the same data.
- **Fix:** gate probe response reused as the first dealer list; duplicate
  device/request probes removed (their loaders already 404-detect); the two
  remaining write-probes run in parallel. ~6 calls on boot.
- **Files:** `admin/developer.html`.
- **Verify:** live request count needs a deployed platform-admin session
  (Supabase unreachable this session); logic code-verified.

### BUG-005 — multi-MB base maps decoded synchronously, blank while loading (Medium)
- **Root cause:** no `decoding="async"`/priority hints; no loading state.
- **Fix:** `decoding="async"` + `fetchpriority="high"` on base-map images;
  animated loading wash on the fixed-dimension layer (no layout shift).
- **Verified:** browser — `map-loading` class appears and clears on load;
  Original↔3D ×16 switches show no heap growth (4 MB → 4 MB).

### BUG-006 — tools/verify-isolation.js calls revoked RPCs (Medium, OPEN)
- The device-lock pass revoked the legacy public client RPCs
  (`plotmap_client_properties/maps/overlays`); the isolation verifier still
  calls them and will report failures. Not fixed here (tool-only, no runtime
  impact); update alongside the next security-tooling pass.

### BUG-007 — ~200 MB dev-only images uploaded on every deploy (Low)
- `public/plotmap-assets/processed/` (165 MB), annotated/easy-map reference
  PNGs and the unused 16 MB `aerotropolis-original.png` have no runtime
  consumers (grep-verified). Excluded via `.vercelignore`.

### BUG-008 — Developer Control rendered blank in production (Blocker, fixed earlier)
- Stylesheet `html{visibility:hidden}` vs inline `''` reset. Fixed in
  `a7b18ca` (this branch's base); PRs #1/#2 carry it to the other branches.

---

## Flows audited without findings (this session)

- Root landing with network down → resolves to visible doors (no blank).
- Original↔3D repeated switching → no heap growth, no stale overlays seen.
- City switch → stale-image behavior: replaced `<img>` elements abort their
  downloads in Chromium; dimensions stable throughout (fixed px sizing).
- Client Presentation console: no errors of its own.
- Developer Control failsafe: total boot failure → safe error card (verified
  in the hotfix pass; regression-checked here).

## Not audited this session (needs live network / real devices)

Device activation round-trip, approved-device silent reopen, dealer passcode
login, suspension/revocation server responses, expired-session refresh on
deployed host, WhatsApp share on a phone, slow-network behavior on real
broadband. These are listed as the post-deploy checklist in
`docs/PERFORMANCE-BASELINE.md`.
