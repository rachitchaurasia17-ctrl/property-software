# Legacy Files

Updated: 2026-07-06. Policy: never delete blindly — archive to `archive/legacy/` with a note.

## Archived to `archive/legacy/`

| File | Was | Why |
| --- | --- | --- |
| `admin-maps.html` (was `admin/maps.html`) | Old "Maps & Pins" admin write surface | Superseded by Map Studio; live route now redirects |
| `temp-map-studio-backup.html` | Pre-redesign Map Studio backup | Contained retired Follow-ups/Site Visits nav |
| `temp-bounds.js`, `temp-center.js`, `temp-debug.js`, `temp-render.js` | One-off map debug scripts | Session scratch, not part of the product |
| `temp-debug.svg`, `temp.svg` | Scratch SVG output | Same |
| `_audit.js`, `_audit2.js`, `_audit.json`, `_audit2.json`, `_audit_prev.json` | Ad-hoc audit scripts/output | Superseded by `tools/audit-plotmap.js` |

`archive/` is not listed in `vercel.json` builds, so nothing in it deploys.

## Replaced in place (old content gone from active files)

| File | Old content | New content |
| --- | --- | --- |
| `admin/owner.html` | CRM dashboard: fake `Math.random()` momentum chart, pipeline, staff activity, business signals | Real dashboard from Client Presentation events |
| `admin/clients.html` | CRM client list with stages/LTV | Client Movement: presentation session timelines |
| `admin/team.html` | CRM "My clients" table + quick-add client form | Presentation activity summary + quick actions |
| `admin/deals.html` | CRM deal/commission recorder | Clean placeholder |
| `admin/finance.html`, `admin/reports.html`, `admin/access.html` | "Section inactive" stubs that still loaded the full data stack | Pure redirects, load no data |
| `index.html` | Three-card gateway incl. Team Login card | Two cards: Open Client Presentation + Dealer Login |

## Kept deliberately (do not remove)

- `maps/`, `normal maps/`, all root map source assets (PNG/SVG/ZIP/PDF) — real map data
- `app/plotmap/map-registry.js` and datasets — the map registry
- `supabase_setup.sql`, `supabase_security_patch.sql` — security files
- `admin/map-studio.html` — current Map Studio design
- `admin/crm-data.js` demo seed — **localhost-only** (guarded by `isLocalDev()`), never seeds in production
- `admin/core/finance-engine.js`, `command-engine.js`, `report-engine.js` — no longer loaded by any active page; kept on disk one release in case a rollback is needed (candidates for archiving next pass)
- Handoff/docs markdown (`HANDOFF.md`, `AUDIT.md`, `DELTA.md`, etc.) — historical documentation; some references to retired routes remain in these docs only

## Known localStorage keys (legacy role keys are display-only)

`plotmap_admin_role`, `plotmap_user_id`, `plotmap_dealer_id` are written after a real
Supabase login for display/compat. They are **not** trusted for access: every admin page
calls `PMAccess.guardPage`, which requires a valid Supabase session + `profiles` row.
