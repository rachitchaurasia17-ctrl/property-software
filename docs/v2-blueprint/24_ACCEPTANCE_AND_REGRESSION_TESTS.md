# 24 · Acceptance and Regression Tests

Concrete, executable checks. Machine mirror: `manifests/acceptance-tests.json`. Viewports for
all visual tests: **1440×900, 1366×768, 1024×768, 430×932, 390×844.**

## A. Ported SQL suites (run first, on the dev project)
- **`verify-private-client-links.sql`** (rollback-wrapped) — MUST pass all assertions:
  token 256-bit hex + never plaintext; no leak of
  seller/commission/notes/exact-location/price-when-hidden; anon gets no media; events
  idempotent; invalid token rejected; **dealer B cannot list/revoke/extend dealer A's link**;
  expired→`expired`, revoked→`revoked`; delete cascades events; no direct anon/auth table
  grants; `client-link-audio` not public. `VERIFIED-SQL`.
- **`verify-isolation.js`** — dealer isolation probes pass.
- New unit SQL: each `plotmap_*` helper resolves the correct dealer; `__unresolved__` writes
  are rejected by RLS.

## B. Auth & device
| Test | Expected |
|---|---|
| Sign in valid creds | session stored; profile fetched; role mirrored |
| Session within 60s of expiry | silent refresh; failed refresh → logged out |
| Partially-migrated profile columns | login still works (base-column fallback) |
| `next=https://evil.com` on login | never navigates off-origin |
| Unapproved device on protected route | read-only gate blocks; no device row inserted |
| Enter activation code | pending device created; approval opens route |
| Reason states | revoked/limit/trial/suspended each show correct block copy |

## C. CRM & data
| Test | Expected |
|---|---|
| Create property in prod-admin with no dealer resolved | stamped `__unresolved__`, RLS rejects |
| Presentation event write | append-only; never upsert |
| `app_open` ordering | recorded+saved before other events |
| Dashboard with empty events array | renders, no crash, no fabricated data |

## D. Private Client Links (browser, end-to-end)
| Test | Expected |
|---|---|
| Create link (1–4 plots, ≤8 photos, visibility, audio) | returns `/client/?token=<64hex>` once |
| Open link on phone | token stripped from history; snapshot renders; media via 15-min signed URLs |
| Internal fields | seller/commission/notes never visible; hidden price/exact location honored |
| CTA + audio | opened/audio_played/call/whatsapp/visit events recorded, idempotent |
| Extend / revoke | expiry updates; revoked link no longer opens (`revoked`) |
| Expiry | expired link no longer opens (`expired`) |
| Cross-dealer | dealer B cannot see/manage dealer A link |

## E. Maps & presentation
| Test | Expected |
|---|---|
| Load masterplan + sector map | correct assets, no crop/distortion |
| Toggle Original/Easy | both render at correct aspect ratio |
| Zoom + Fit Map | overlays/pins stay aligned |
| Photo rail | renders without clipping |

## F. Onboarding & deletion (staging)
| Test | Expected |
|---|---|
| Provision dealer | NDJSON saga → one-time credentials; idempotent retry safe |
| Duplicate email | `AUTH_EMAIL_ALREADY_EXISTS`, no partial dealer |
| Delete dealer (confirm mismatch) | 400, nothing deleted |
| Delete dealer (confirmed) | public rows purged, both buckets swept, Auth users removed; retryable on partial |

## G. Build & deploy
| Test | Expected |
|---|---|
| `node tools/build-dist.js` (V2 equivalent) | allowlist copy + `runtime-env.js` generated + secret scan clean |
| Inject a service-role key into a source file | build **fails** (secret scan + config rejection) |
| `git diff --check` | clean |
| `/config/runtime-env.js` header | `no-store` |
| `/client/` headers | strict CSP + `noindex` + `no-referrer` |

## H. Technical health (all routes, all viewports)
No console errors affecting behavior; no failed required network requests; no horizontal
overflow; no clipped text/buttons/images; fonts load; role-based nav visibility correct.
