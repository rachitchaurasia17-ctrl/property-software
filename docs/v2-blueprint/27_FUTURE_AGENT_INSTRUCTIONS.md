# 27 · Future Agent Instructions (V2 bootstrap)

> **You are building PlotMap V2. Do NOT inspect the legacy PlotMap repository.**
> Everything you need is in this `docs/v2-blueprint/` package and the sibling
> `migration-kit/`. If something is missing, it is listed in
> `26_OPEN_GAPS_AND_UNCERTAINTIES.md` as a decision to make — not a reason to reopen V1.

## Read these first (in order)
1. `00_READ_THIS_FIRST.md` — evidence labels + reference commit `b894245`.
2. This file (`27`).
3. `22_V2_ARCHITECTURE.md` + `23_V2_BUILD_SEQUENCE.md` — the plan.
4. `20_SECURITY_INVARIANTS.md` — the rules you may never break.
5. Your pass-specific deep docs (below).

## Use these migration-kit folders
- `migration-kit/supabase/migrations/` — port **in order**, prefer enforced over draft.
- `migration-kit/edge-functions/` — `resolve-client-link`, `provision-dealer`, `delete-dealer`.
- `migration-kit/auth/`, `migration-kit/device-access/`, `migration-kit/client-links/` —
  proven client modules to adapt.
- `migration-kit/storage/`, `migration-kit/data-contracts/` — bucket + data contracts.
- `migration-kit/verification/` — the SQL/JS acceptance tests. Run them; do not trust the
  environment until they pass.
Each folder has a `MANIFEST.md` with per-file porting steps.

## Product principles
- Multi-tenant dealer SaaS; tenant = `dealer_id`. RLS is the real boundary; the client is
  "honest UI" only.
- Local-first CRM (`crm_records` + `entity_type`), background sync, append-only
  `presentation_events`.
- Client-safe sharing via frozen snapshots; **never** leak seller/commission/notes.
- Derive analytics from real events; **never** fabricate data.

## Architecture (target)
Vite + TypeScript, framework-light, explicit ES-module graph. `apps/{dealer,developer,
presentation,client}` + `packages/{ui,auth,device-access,data,maps,client-links}` +
`supabase/{migrations,functions,verification}`. **One** design system, shell, nav,
modal/drawer, data layer, auth layer, responsive system. Map engine + buyer page stay
framework-free. Self-host assets; **drop the CDN Supabase SDK.**

## Routes (V2 must implement)
`/` (landing+activation), `/admin/owner|deals|properties|clients|team|area-intelligence|
property-insights|map-studio.html` equivalents, `/admin/developer.html`, `/app/plotmap/`
(presentation), `/client/?token=` (buyer). Roles + scopes in `03`.

## Security invariants (never break — full list `20`)
RLS-anchored tenancy; `__unresolved__` fail-closed; platform-admin server-only; service-role
key Edge-only; browser config rejects secrets; build secret-scans dist; device token
opaque+local, server compares hashes, dealer binding never from URL, read-only route gate;
client-link token hashed (raw once), frozen client-safe snapshot, no media in public snapshot
RPC, private buckets + 15-min signed URLs, token stripped from history, events anon-RPC-only
+ idempotent + rate-limited, no direct table grants, cross-dealer impossible; strict `/client/`
CSP + noindex.

## Map rules
Registry is generated (never hand-edit). Each map has Original + Easy renderings with their
own dimensions — preserve aspect ratio (no crop/distortion). Port the engine wholesale.

## Client Link rules
1–4 plots, ≤8 photos each, price/location visibility gates, ≤2-min audio, expiry {3,7,14,30}.
Snapshot frozen at creation. Buyer never reads storage directly.

## Prohibited code (never copy into V2)
`admin/crm-ui.css`, duplicate shells/nav, legacy sage/emerald styles, page-specific global
patches, fabricated data, `dist/`, secrets/env files, CDN Supabase SDK dependency, demo seed
as prod data. Full list `21`.

## Implementation order
Pass 0 bootstrap → Pass 1 full design (Antigravity) → Pass 2 backend/security port (Codex) →
Pass 3 integration QA + deploy (Antigravity). Details `23`.

## Definition of done
All `24` acceptance tests green on preview then production; all `20` invariants hold; all
`verify-*` scripts pass on the new Supabase project; onboarding, client-link, and map flows
proven in-browser; no service-role key client-side; `git diff --check` clean; deployment
evidence captured.

## Ready-to-run prompts
- `prompts/FRONTEND_IMPLEMENTATION_PROMPT.md` (Antigravity, Pass 1)
- `prompts/BACKEND_PORT_PROMPT.md` (Codex, Pass 2)
- `prompts/QA_AND_DEPLOYMENT_PROMPT.md` (Antigravity, Pass 3)

Start with `prompts/FRONTEND_IMPLEMENTATION_PROMPT.md` once Pass 0 bootstrap is done.
