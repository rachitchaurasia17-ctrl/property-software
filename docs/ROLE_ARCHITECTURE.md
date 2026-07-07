# Role Architecture (Phase 1.5)

PlotMap has **three separate product surfaces**. They are deliberately kept
apart so a client never sees business data, staff never see owner
intelligence, and the owner's command center stays uncluttered by daily work
tools.

> **Security note:** Nav filtering and route guards in the browser are **UX,
> not security**. The real boundary is Supabase Auth + role/scope checks +
> Row Level Security (RLS). Hiding a link never grants or removes access on
> its own. Multi-dealer data isolation is Phase 2 and must be enforced in RLS
> before production trust.

---

## 1. Client Presentation

- **Route:** `/app/plotmap/` (and `/` → the "Client Presentation" card).
- **Audience:** buyers / clients. **Public, read-only, client-safe.**
- **Auth:** none. No password.
- **Must NEVER show:** price, sold status, seller contact, commission,
  finance, internal notes, staff data, owner-only data, admin controls,
  draft maps, hidden maps, archived maps.
- Only **published + client-visible + not-deleted** rows may ever reach this
  surface. Enforced today by the dataset build + the client-safe audit
  (`tools/audit-plotmap.js`); must also be enforced by RLS (Phase 2).

## 2. Dealer Login

- **Entry:** `/` → "Dealer Login" card → real Supabase email/password.
- **Audience:** owner / dealer. **Password/auth protected.**
- **Purpose:** the **business-intelligence command center**. It protects
  business insights so staff/team users cannot see them.
- **Dealer nav shows ONLY:**
  - Dashboard (`/admin/owner.html`)
  - Area Intelligence (`/admin/area-intelligence.html`)
  - Client Movement (`/admin/clients.html`)
  - Property Insights (`/admin/property-insights.html`)
  - *(optional convenience)* Client Presentation (`/app/plotmap/`)
- **Dealer nav must NOT show** Properties or Map Studio as primary
  intelligence nav items, and must not mix in Team Workspace work tools.
  The owner can still reach work tools through **Team Workspace** (owner rank
  passes every team guard) or by direct URL — nav is UX, access is unchanged.

## 3. Team Workspace

- **Entry:** `/` → "Team Workspace" card.
- **Audience:** staff. A **passwordless-feeling** but **not public**
  workspace for daily work.
- **Team nav shows ONLY:**
  - Workspace (`/admin/team.html`)
  - Properties (`/admin/properties.html`) — scope `properties.manage`
  - Map Studio (`/admin/map-studio.html`) — scope `mapstudio.manage`
- **Daily work:** add property, update property, open Map Studio, mark maps,
  schedule / follow-up tasks where already present.
- **Team must NOT see:** Dashboard (owner), Area Intelligence, Client
  Movement, Property Insights, billing, owner settings, business
  intelligence, or any other dealer's data.
- Visual direction follows the "Welcome, {name}" workspace screen from the
  UI/UX redesign handoff (greeting → quick actions → recent activity → Map
  Studio card).

### Team access behavior (how "passwordless-feeling" works today)

Implemented approach — **real session + device-remember** (safe, no faked
security):

1. **First time** on this device, the Team Workspace card opens a real
   Supabase sign-in (email + password), flavored as "Team Workspace".
2. After a successful sign-in, the Supabase **refresh token is persisted**
   in `localStorage` (`plotmap_supabase_session_v1`). On later visits
   `PMAuth.getCurrentProfile()` silently refreshes the session, so the card
   sends the user **straight into `/admin/team.html` without re-asking for
   Gmail**. That is the "device remembers you" experience.
3. It is **not globally public.** Opening a plain admin URL with no session
   is bounced to login by `PMAccess.guardPage`. There is **no service-role
   key in the frontend**, no `using(true)`/`with check(true)`, and RLS is
   untouched.

> **⚠️ Needs Codex / RLS security review before production trust.**
> A true "team access code / first-time setup code" model (staff opening the
> workspace with a short device code instead of a Google account, backed by a
> per-dealer team-access token table with its own RLS) is **not** built. The
> current behavior is a real Supabase session remembered on the device — a
> UX veneer over existing auth, not a new security primitive. Do not describe
> Team Workspace as independently secured until Supabase/RLS backing is
> designed and audited.

---

## Map Studio boundary (do not regress)

The **current** Map Studio (`/admin/map-studio.html`, `overlay-store.js`, the
overlay engine, publishing, A/B/C/D groups, highlight system, map canvas and
drawing flow) is the production implementation. The Map Studio shown in the
UI/UX redesign handoff is **old/different** and must **not** replace it.
Phase 1.5 only changed which nav links render — it did **not** touch Map
Studio behavior, and Map Studio remains a Team Workspace work tool.

## Forbidden client-data leakage rules (recap)

Client Presentation must never expose: price · sold · seller contact ·
commission · finance · internal notes · staff data · owner-only data · admin
controls · draft / hidden / archived maps. The client-safe audit blocks
currency/price/validation wording in the client bundle
(`tools/audit-plotmap.js`).

## Where this is implemented

| Concern | File |
| --- | --- |
| Root role split (3 cards + entry UX) | `index.html` |
| Dealer vs Team nav definitions | `admin/core/nav.js` (`PMNav`) |
| Route guards, role ranks, permission scopes | `admin/core/access-control.js` (`PMAccess`) |
| Supabase auth + session persistence | `admin/core/auth.js` (`PMAuth`) |
| Team Workspace shell | `admin/team.html` |
| Route inventory | `ACTIVE_ROUTES.md` |
