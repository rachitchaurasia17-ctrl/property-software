# 21 · Reuse / Adapt / Rewrite / Prohibit

Every significant system, classified into exactly one bucket. Machine mirror:
`manifests/reuse-classifications.json`. Definitions:

- **REUSE** — move with minimal path/config change; logic untouched.
- **ADAPT** — keep business/security logic; change module boundaries/integration.
- **REWRITE** — rebuild from the documented contract in a clean V2 module.
- **PROHIBIT** — must never enter V2.

## REUSE (unchanged / env-rewire only)

| System | Files | Why |
|---|---|---|
| Supabase migrations (enforced set) | `supabase/migrations/*` (prefer enforced over draft) | proven schema + RLS + grants |
| Client-link backend RPCs | `20260728000100/000200` | crown-jewel security, fully verified |
| Storage buckets + policies | phase5 + link migration | private buckets, path validators |
| Edge functions | `resolve-client-link`, `provision-dealer`, `delete-dealer` | hard, idempotent, service-role-scoped |
| Isolation / client-link verification | `tools/verify-isolation.js`, `tools/verify-private-client-links.sql` | the acceptance tests themselves |
| Build discipline | `tools/build-dist.js`, `tools/generate-runtime-env.js` (concepts) | allowlist + secret-scan |
| Map registry + assets + datasets + overlay engine | `app/plotmap/map-registry.js`, `datasets/*`, `overlay-engine.js`, `overlay-capture.js`, `/maps`, `/normal maps`, `/public/plotmap-assets` | domain-hard pixel math; 170 maps |

## ADAPT (keep logic, re-house)

| System | Files | Adaptation |
|---|---|---|
| Auth / session | `admin/core/auth.js` | typed module + explicit `dealerId` accessor |
| Device access | `admin/core/device-access.js` | block screen into component system |
| Data adapter / sync | `data-adapter.js`, `sync-queue.js`, `supabase-sync.js` | typed data layer; keep `crm_records` + `__unresolved__` |
| SaaS foundation | `saas-foundation.js` | `PMFoundation` → account/settings module |
| Client-links dealer client | `plotmap-client-links.js` | into V2 `client-links` package |
| Client Presentation engine | `app/plotmap/app.js` | keep engine, new chrome; drop CDN SDK |
| Developer Control backend usage | `admin/developer.html` (RPC calls) | keep RPC contracts, new UI |
| Config resolution | `config/supabase-config.js` | keep validation logic; new project keys |

## REWRITE (from contract, clean)

| System | Reason |
|---|---|
| All dealer page UIs (`owner/properties/deals/clients/team/area-intelligence/property-insights/map-studio.html`) | legacy markup = primary agent-confusion source |
| App shell + navigation (`plotmap-shell.js` markup) | need ONE shell/nav source (keep the NAV data model) |
| Client buyer page visuals (`client/index.html`, `client/styles.css`) | rebuild in V2 system (keep `client/app.js` logic contract) |
| Design system (`plotmap-ds.css`, `violet-dusk-foundation.css`) | rebuild as modular tokens/components |
| Dashboard/analytics UI | rebuild around ported derivation logic |

## PROHIBIT (never copy into V2)

| Item | Where | Why |
|---|---|---|
| `admin/crm-ui.css` | admin/ | legacy design system; explicit conflict source |
| Duplicate shell systems | any old shell markup | one shell only |
| Duplicate navigation definitions | scattered nav | one nav source |
| Legacy sage/emerald styles | old CSS | rejected design |
| Global handler pollution / page-specific patches | inline `<script>` in old pages | fragile implicit coupling |
| Fabricated dashboard data / demo activity | any mock generator | derive-only rule |
| Generated `dist/` | `dist/` | build output, not source |
| Secrets / env files | `.env*`, `.vercel/` | never in source or dist |
| Auxiliary legacy pages (unless a V2 need is confirmed) | `maps.html`, `editor.html`, `finance.html`, `reports.html`, `access.html` | superseded/aux |
| CDN `@supabase/supabase-js@2` runtime dependency | `app/plotmap/index.html` | external, CSP/offline risk — self-host or drop |
| Demo seed as production data | `admin/crm-data.js` `CRM_DEMO`, `dealer-demo` defaults | dev-only |

## Rule
**Do not mark an old frontend page "reuse" merely because it currently works.** Working
legacy UI is still the confusion source the V2 exists to remove. Only backend/security/map
logic earns REUSE.
