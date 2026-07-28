# PlotMap V2 — Frontend Implementation Prompt (Antigravity, Pass 1)

You are implementing the full PlotMap V2 frontend in a clean new repository.

**Do NOT inspect the legacy PlotMap repository.** Use only:
1. `docs/v2-blueprint/27_FUTURE_AGENT_INSTRUCTIONS.md`
2. `docs/v2-blueprint/03_ROUTE_AND_ROLE_MATRIX.md`
3. `docs/v2-blueprint/22_V2_ARCHITECTURE.md`
4. `docs/v2-blueprint/13_PRIVATE_CLIENT_LINKS_INTERNALS.md` (buyer page contract)
5. `docs/v2-blueprint/12_CLIENT_PRESENTATION_INTERNALS.md`
6. `docs/v2-blueprint/20_SECURITY_INVARIANTS.md`
7. The approved Claude Design files mapped per route (design source of truth).

This is a **frontend-only** pass.
- Do not port backend logic by guessing; call a mocked data-adapter boundary.
- Do not invent routes, roles, or states absent from the blueprint.
- Do not copy legacy dealer HTML or `admin/crm-ui.css`.
- Do not create duplicate shell or navigation systems.
- Do not add fake metrics, listings, or marketing copy.

## Objective
Build the entire approved PlotMap V2 visual frontend in **one continuous pass** using **one**
design-token source, **one** component library, **one** app shell, **one** navigation
definition, **one** modal/drawer system, **one** responsive system.

Cover: landing/device activation; dealer owner app (Home, My Plots, My Deals, My Customers,
Demand, Team Workspace, Area Intelligence, Property Insights, Map Studio chrome); Developer
Control; presentation chrome; the `/client/?token=` buyer page; and all loading / empty /
error / modal / drawer / responsive states.

## Requirements
- Follow approved designs exactly; where a design exists it overrides any prior appearance.
- Preserve route contracts and role visibility rules (`03`).
- Build all shared components before assembling pages.
- Use a strict data-adapter boundary so real backend attaches later without redesign.
- Keep the map engine and buyer page framework-free (they receive ported logic in Pass 2).
- Respect security-relevant UI: `/client/` shows only client-safe fields; never render
  seller/commission/notes.

## Viewports to validate
1440×900, 1366×768, 1024×768, 430×932, 390×844. No horizontal overflow; no clipped UI; fonts
load; no console errors.

## Deliverables
1. Branch + commit(s)
2. Routes implemented
3. Shared components created
4. Design states covered (loading/empty/error/modal/drawer/responsive)
5. Remaining blockers caused ONLY by missing source-of-truth inputs
6. Screenshots (desktop/tablet/mobile)
7. Exact files changed

Do not deploy production in this pass unless explicitly instructed.
