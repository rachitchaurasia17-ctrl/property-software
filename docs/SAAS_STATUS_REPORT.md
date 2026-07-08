# PlotMap — SaaS Status Report

_Last updated: 2026-07-09 · "Golden SaaS Experience Layer" pass._

A practical snapshot of what is production-ready, what is intentionally disabled,
and how to demo PlotMap today. This is additive documentation — it changes no
behavior.

---

## 1. Completed phases

- **Phase 1 — Launch safety.** Client Presentation is client-safe: no
  price / sold / seller / contact / internal / admin data ever renders in the
  buyer-facing app. Analytics + open-redirect hardening in place.
- **Phase 2 — Multi-dealer isolation.** Dealer-scoped data via `getScopedCRM()`;
  share links open only the public presentation.
- **Phase 3 — Team roles + RLS.** Owner / team roles, permission scopes, and
  `PMAccess.guardPage` on every admin route. RLS remains the real authority.
- **Phase 4 — Account gating (app-side).** Manual billing record + non-blocking
  account banner. Enforcement is Supabase RLS (not the frontend).
- **Phase 5 — Property photos.** Photo-URL workflow live; device upload is a
  gated scaffold (see disabled parts).
- **Golden experience layer (this pass).** Owner dashboard, Team Workspace,
  Properties, Client Presentation, and Sector Maps polished into a calm,
  daily-use SaaS. No backend/security/migration changes.

## 2. Production-ready parts

- **Client Presentation** (`/app/plotmap/`): landing that fits without scrolling,
  compact `PlotMap` brand, photo gallery, premium 3D highlights on the golden
  map, property browse + detail, in-page map modals (masterplan / area context /
  sector), and WhatsApp sharing.
- **Owner Dashboard** (`admin/owner.html`): daily command center — greeting,
  "Needs your attention today", business snapshot, property readiness, recent
  client activity, quick actions. Account & business settings collapse into an
  owner-only drawer; a small account-status chip stays in the header.
- **Team Workspace** (`admin/team.html`): Add Client, Add Property, Open Map
  Studio, My Clients, Recent Activity. No Schedule Visit, no "movement" wording.
- **Properties** (`admin/properties.html`): clean cards with honest readiness
  hints (Ready to show / Needs photo / Not on map yet / Needs sector proof),
  grouped add/edit form, prominent client-visible toggle, client-safe warning.
- **Sector Maps**: 4-column premium cards with honest badges
  (Verified / Proof map / Draft), city chips, and search.

## 3. Intentionally disabled parts

- **Storage device upload** stays hidden unless `dealerSettings.storageEnabled === true`.
  With storage off, photo **links** work fully — the uploader simply does not appear
  (it does not look broken). Turning it on needs the Supabase bucket + RLS + a
  **signed-URL broker** (pending — see below).
- **Account suspension/expiry** is recorded in the app but only truly enforced by
  Supabase RLS. The frontend banner is informational and never hard-locks.
- **Share-link revocation** is queued until the SaaS-foundation migration is live;
  a disabled link still opens the safe public presentation until then.

## 4. Current golden demo path

1. `/app/plotmap/` → the **New Chandigarh** tile is marked **★ Recommended**
   (it has real published highlights). Open it.
2. The masterplan shows glowing roads + raised 3D blocks. Try the **A/B/C/D**
   group highlights and click a road/block.
3. **Properties** → open a property → **View on Masterplan / View on Sector Map /
   Show Area Context** open in-page (no navigation) → **Send via WhatsApp**.
4. **Sector Maps** → premium proof-map cards.

## 5. Remaining work

- **Storage signed-URL broker** (pending): a small server endpoint to mint
  time-limited upload/download URLs so device photo upload can be enabled per
  dealer without exposing keys or enabling Storage globally.
- **Overlay coverage for other maps** (content, not code): only the golden map
  (New Chandigarh) has published overlay geometry today. Every other city renders
  as a clean **proof map**. To add highlights, mark roads/blocks/sectors in
  **Map Studio** — no fake geometry is ever generated automatically.
- **Follow-ups surface**: client follow-up counts feed the owner "attention" list;
  a dedicated follow-up view can follow later.

## 6. How to demo today

- Use **New Chandigarh** (the golden map) for the "wow" — it's the only map with
  live highlights, and it's clearly recommended on the landing.
- Other cities are honest **proof maps** — great for "here's the official layout".
- Everything shown to a client is client-safe by design.

## 7. Safety posture (unchanged this pass)

No Supabase SQL applied, no migrations run, no RLS/auth changes, no service-role
keys, no map assets changed, no fake overlay geometry, Map Studio drawing engine
untouched, `storageEnabled` not globally enabled.
