# Launch Checklist

Last updated: 2026-07-06.

## Before every deploy

- [ ] `node tools/audit-plotmap.js` passes (client leak audit)
- [ ] `node --check` on every changed JS file passes
- [ ] Bump `?v=` cache-busters in `app/plotmap/index.html` for changed client assets
- [ ] `/` shows only two cards: **Open Client Presentation** + **Dealer Login**
- [ ] `/app/plotmap/` loads without login; no price/sold/internal data anywhere
- [ ] Admin routes redirect to `/` when signed out
- [ ] Nav shows only: Dashboard, Client Presentation, Map Studio, Properties, Area Intelligence, Deals, Client Movement, Property Insights (no Finance/Reports/Access)
- [ ] Property add → edit → archive works; archive is soft (record kept)
- [ ] Map Studio opens; publish flow works for owner
- [ ] Sync badge visible in admin topbar; no console errors on any route

## One-time (pending)

- [ ] Apply `supabase/migrations/20260706_saas_foundation_scaffold.sql` (see SUPABASE_SETUP.md for exact steps)
- [ ] Create Supabase auth users + profile rows for each real team member (role + permissions)
- [ ] Create `property-photos` storage bucket with per-dealer folder policies (SUPABASE_SETUP.md)
- [ ] Verify share-link disable actually blocks resolution after migration (open a disabled link → "no longer active" notice)
- [ ] Set the real trial/plan values in owner dashboard → Plan & billing readiness

## Never

- Rerun `supabase_setup.sql`
- Put a service-role key anywhere in the frontend
- Re-add Finance / Reports / Access pages or nav entries
- Count admin browsing as client analytics
- Upsert `presentation_events` (append-only inserts)
