# Archived legacy files

Files moved here during the 2026-07 repo cleanup. Nothing in this folder is
deployed (it is not listed in `vercel.json` builds) or referenced by the
active app. Kept for reference instead of deleted.

| File | Why archived |
| --- | --- |
| `admin-maps.html` | Old "Maps & Pins" admin write surface, superseded by Map Studio (`/admin/map-studio.html`). The live route now redirects there. |
| `temp-map-studio-backup.html` | Backup of a pre-redesign Map Studio. Contains the retired Follow-ups/Site Visits nav; must never ship. |
| `temp-bounds.js`, `temp-center.js`, `temp-debug.js`, `temp-render.js` | One-off map debugging scripts from asset processing sessions. |
| `temp-debug.svg`, `temp.svg` | Scratch SVG output from those sessions. |
| `_audit.js`, `_audit2.js` | Ad-hoc audit scripts (superseded by `tools/audit-plotmap.js`). |
| `_audit.json`, `_audit2.json`, `_audit_prev.json` | Output of those ad-hoc audits. |

Map assets, the map registry, `maps/`, `normal maps/`, and Supabase security
files were intentionally NOT touched.
