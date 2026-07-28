# 00 · READ THIS FIRST

> **Purpose of this package.** This `docs/v2-blueprint/` tree plus the sibling
> `migration-kit/` are the **permanent technical memory** of PlotMap V1. They exist
> so a future AI agent can build **PlotMap V2 without reopening, searching, or
> reinterpreting the legacy repository.** If you are that agent: read this file,
> then `27_FUTURE_AGENT_INSTRUCTIONS.md`, then the documents it points you to.
> **Do not inspect the legacy PlotMap repository.** Everything you need is here.

---

## Reference snapshot (verified against the working tree)

| Item | Verified value | How verified |
|---|---|---|
| Repository root | `C:\Users\rachi_l35wosr\OneDrive\Desktop\xyz` | working dir |
| Blueprint branch | `docs/plotmap-v2-blueprint` | `git checkout -b` in this session |
| Reference commit (HEAD) | `b894245` (`b89424538d5e1b287f85ebad74ccefd22f57ed87`) | `git rev-parse HEAD` |
| Reference commit subject | `fix(landing): align production landing page to approved Claude design specification` | `git log` |
| Default branch | `main` | `git branch` |
| Supabase project ref | `czmkfmkmgqlienmdihul` | hardcoded fallback in `config/supabase-config.js:5` |
| Supabase migrations on disk | 16 files under `supabase/migrations/` | `ls` |
| Edge Functions on disk | `provision-dealer`, `delete-dealer`, `resolve-client-link` | `supabase/functions/` |
| Map registry entries | 170 maps | `grep -c '"id":' app/plotmap/map-registry.js` |
| Admin HTML routes | 16 files under `admin/` | `ls admin/*.html` |
| Storage buckets (declared in SQL) | `property-photos`, `client-link-audio` | migration SQL |

**Pre-existing uncommitted change:** `.gitignore` was modified (unstaged) before this
session began. It was **left untouched**; only `docs/v2-blueprint/` and `migration-kit/`
are committed on this branch.

**Live-environment access:** the Supabase MCP connector in this session is
**unauthenticated**, so the live database, live RLS state, live grants, and deployed
Edge Function versions **could not be queried directly**. Every database fact in this
blueprint is verified from the **migration SQL and verification scripts on disk**, which
are the authoritative source-of-truth for schema and policy. Facts that require the live
environment to confirm are labelled `UNVERIFIED-LIVE` and listed in
`26_OPEN_GAPS_AND_UNCERTAINTIES.md`.

---

## Evidence labels used throughout

Every material claim in this package carries (explicitly or by section) one of:

| Label | Meaning |
|---|---|
| **`VERIFIED-CODE`** | Read directly from a file in the repo at commit `b894245`. Cited with `path:line`. |
| **`VERIFIED-SQL`** | Read from a migration or verification `.sql` file on disk. |
| **`APPROVED-PRODUCT`** | A product decision recorded in the attached Master Context Report or an in-repo handoff/rules doc. |
| **`HISTORICAL`** | Describes a past state / earlier approach (from git history or docs), not necessarily current. |
| **`REPORT-CLAIM`** | Asserted only by the attached Master Context Report; **not** independently confirmable here. |
| **`INFERENCE`** | A reasoned conclusion drawn from verified facts; labelled so it is not mistaken for direct evidence. |
| **`UNVERIFIED-LIVE`** | Requires the live Supabase/Vercel environment to confirm; not checkable in this session. |

The attached report is the authority for **product intent, approved/rejected decisions,
and design history.** The **repository is the authority for code, contracts, security,
and proven implementation.** Where they conflict, `19_PROBLEM_SOLUTION_HISTORY.md` and
each feature doc reconcile them explicitly.

---

## What was corrected against the report

The Master Context Report was written from chat memory and self-labelled most PlotMap
facts as "chat-stated / unverified." Auditing the real repo confirmed the architecture
but corrected several specifics. Highlights (full list in `26`):

- Report said Edge Function names "were never supplied." **Verified:** three functions —
  `provision-dealer`, `delete-dealer`, `resolve-client-link`.
- Report listed `admin/core/plotmap-ds.css`, `plotmap-shell.js`, `plotmap-client-links.js`,
  `app/plotmap/styles/violet-dusk-foundation.css` as paths to confirm. **All verified present.**
- Report placed `crm-ui.css` at repo root. **Verified:** it is `admin/crm-ui.css`.
- Report said client-link table/RPC/policy names were "unspecified." **Verified in full** —
  see `13_PRIVATE_CLIENT_LINKS_INTERNALS.md` and `15_SUPABASE_RLS_RPCS_AND_GRANTS.md`.
- Report's `plotmap_deal_followups_v1` localStorage key — **verified** at `admin/deals.html:65`.

---

## Reading order

1. `01_PRODUCT_AND_SYSTEM_OVERVIEW.md` — what PlotMap is and who uses it.
2. `02_ARCHITECTURE_AND_INITIALIZATION.md` — how the app boots, script order, globals.
3. `03_ROUTE_AND_ROLE_MATRIX.md` — every route, every role.
4. `05`–`18` — deep code documentation, one system per file.
5. `19`–`21` — problem history, security invariants, reuse/rewrite decisions.
6. `22`–`24` — the V2 architecture, build sequence, and acceptance tests.
7. `27_FUTURE_AGENT_INSTRUCTIONS.md` + `prompts/` — how to actually start building V2.

Machine-readable mirrors of the matrices live in `manifests/*.json`.

---

## Safety note (this package created nothing runtime)

This audit changed **no** runtime code, **no** Supabase object, **no** deployment. It only
added files under `docs/v2-blueprint/` and `migration-kit/` on a dedicated branch. See
`17_BUILD_RUNTIME_AND_DEPLOYMENT.md` for how the real system builds and deploys.
