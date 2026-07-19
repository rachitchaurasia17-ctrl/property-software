# PlotMap Performance Baseline — 2026-07-19

Branch: `developer-intelligence-and-performance`.

## Measurement environment — read this first

- Local static server (`tools/server.js`, localhost) on a Windows laptop,
  Chromium-based browser pane, 1280×720 viewport.
- **Supabase was unreachable from this machine during the session** (DNS
  failure for `*.supabase.co`; GitHub/Vercel resolved fine). Every number that
  depends on live RPC latency is therefore *code-verified request-count*
  data, not wall-clock latency. This is stated per-item below.
- Localhost numbers measure parse/boot/decode cost, not broadband transfer.
  Production transfer cost is derived from measured file sizes instead.
- Throttled-network and tablet matrices could not be run this session —
  listed under "Not measured".

## Measured — page boot (localhost, fresh profile per route)

| Route | DOMContentLoaded | load | Requests | Transfer |
|---|---|---|---|---|
| `/` (landing) | 50 ms | 87 ms | 3 | 17 KB |
| `/app/plotmap/` (gallery) | 156 ms | 159 ms | 26 | 712 KB |
| `/admin/owner.html` | 113 ms | 118 ms | 24 | 390 KB |

- `/app/plotmap/` largest assets: `map-registry.js` 166 KB, `app.js` 144 KB,
  `styles.css` 114 KB, `overlays.js` 64 KB, `supabase-js` 52 KB. (Vercel
  gzip/brotli reduces these ~65–75% on the wire.)
- Landing → gallery loads **zero map images** until a city is opened
  (verified: 0 image requests at gallery). Thumbnails are `loading="lazy"`.
- City open → base map usable: **289 ms localhost** (disk). On broadband this
  is dominated by the masterplan PNG (2.2–3.1 MB per city, sizes below).
- Original ↔ 3D switching ×16: JS heap **4 MB → 4 MB** (no measurable growth;
  layer innerHTML replacement releases prior decode).
- Client Presentation console: no errors of its own (Supabase-dependent sync
  queues silently by design when the network is down).

## Measured — asset weight on disk (production transfer ceiling)

| Bucket | Size | Notes |
|---|---|---|
| `maps/` | 213 MB | per-sector + masterplan PNGs; only the opened city's images are fetched |
| `normal maps/` | 85 MB | 3D/sector variants; largest: wave estate 12.7 MB, jlpl 11.8 MB |
| `public/plotmap-assets/` | 224 MB | of which **165 MB `processed/` + ~26 MB reference PNGs are dev-only and never fetched at runtime** |
| Typical city masterplan | 2.2–3.1 MB | the first-load critical asset per city |

## Measured — deployment configuration defects (production, HTTP-probed)

1. **`vercel.json` `builds` omitted `public/plotmap-assets/**`** except four
   hand-listed files. The new multi-city overlay SVGs
   (`chandigarh/mohali/new-chandigarh/zirakpur-*.svg`, referenced by
   `datasets/overlays.js`) would **404 on deploy** → highlights broken on the
   branch deployment. (Prod probe: the one *listed* SVG returns 200; the new
   ones are only on this branch, so the gap bites at merge time.)
2. **No `Cache-Control` headers anywhere** → Vercel default
   (`max-age=0, must-revalidate`) forces revalidation of multi-MB map PNGs on
   every repeat visit.
3. **~200 MB of dev-only intermediates** (`processed/`, annotated/reference
   PNGs, 16 MB unused `aerotropolis-original.png`) uploaded with every deploy.

## Measured — Developer Control boot RPC count

Boot previously issued the same RPCs multiple times
(directory ×2, devices ×2, activation-requests ×2 + usage + 2 probes ≈ **9
calls**). Code-verified; live latency not measurable this session.

## Improvements applied in this pass (before → after)

| Change | Before | After | Verification |
|---|---|---|---|
| `vercel.json` builds cover `public/plotmap-assets/**` | new city SVGs 404 on deploy | served | config; verify post-deploy |
| Cache headers on `/maps`, `/normal maps`, `/plotmap-assets` | `max-age=0` revalidate every visit | `max-age=86400, stale-while-revalidate=604800` | config; verify response headers post-deploy |
| `.vercelignore` excludes dev-only images | ~200 MB uploaded per deploy | excluded | grep-verified nothing runtime-references them |
| Base-map `decoding="async"` + `fetchpriority="high"` | sync decode of 2–3 MB PNG on main thread; default priority | async decode, LCP-priority fetch | code + browser (map became usable, class cleared) |
| Base-map loading wash + failure retry chip | blank frame while loading; blank forever on asset failure | animated wash; visible retry that rebuilds the map | browser-verified (`map-loading` class observed, then cleared) |
| Developer Control boot RPC dedupe | ~9 RPCs | 6 (probe reused as data; duplicate device/request probes removed; write-probes parallelized) | code-verified; live count needs deployed session |
| `tools/optimize-map-images.js` | — | WebP derivative generator with hard dimension-equality gate | dry-run tool; see rollout below |

## Deliberately NOT done (and why)

- **WebP/AVIF swap in the client**: the tool is shipped, but generating and
  *wiring* derivatives was not done blind. Map text fidelity must be compared
  visually at 100% per city before the client prefers WebP, and this session
  could not do that review properly. Rollout: `npm i sharp` →
  `node tools/optimize-map-images.js --write` → visual compare → wire
  `<picture>`/try-webp-first in `buildMap()` as a reviewed change.
- **`defer` on admin page scripts**: admin pages run inline
  `if (window.PMAccess) PMAccess.guardPage(...)` at parse time. With
  deferred scripts `PMAccess` is undefined when that runs — the guard would
  be silently skipped. Not worth a security regression for ~100 ms of parse.
- **Framework migration / bundling**: out of scope by instruction.
- **Service worker**: rejected for now — a stale app-shell cache on a static
  host with no build pipeline risks pinning users to broken releases.
  Documented as a later task with versioned-precache design.

## Not measured this session (honest gaps)

- Broadband/throttled wall-clock timings, tablet/1366×768 matrices.
- Live Supabase RPC latency and per-page RPC counts (DNS outage).
- Production response headers for the new caching rules (needs a deploy).
- Long-task profile under real network jitter.

Re-run checklist after deploy: response headers on a `/maps/*.png`, 404 sweep
of `plotmap-assets/*.svg`, repeat-visit transfer size, city-switch timing on
throttled Fast-3G, Developer Control boot request count.
