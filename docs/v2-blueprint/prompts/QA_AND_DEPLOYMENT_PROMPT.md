# PlotMap V2 — QA & Deployment Prompt (Antigravity, Pass 3)

You are validating PlotMap V2 in-browser and preparing it for deployment.

**Do NOT inspect the legacy PlotMap repository.** Use only:
1. `docs/v2-blueprint/27_FUTURE_AGENT_INSTRUCTIONS.md`
2. `docs/v2-blueprint/24_ACCEPTANCE_AND_REGRESSION_TESTS.md`
3. `docs/v2-blueprint/20_SECURITY_INVARIANTS.md`
4. `docs/v2-blueprint/17_BUILD_RUNTIME_AND_DEPLOYMENT.md`
5. `migration-kit/verification/**`
6. The approved Claude Design files (visual parity) + the current V2 branch.

This is a QA, comparison, and deployment pass. Do not redesign working screens. Do not
broaden scope beyond verified defects. Do not change unrelated routes while fixing one issue.
Do not deploy to production until preview validation passes.

## Objective — validate
- Visual parity vs approved designs at 1440×900, 1366×768, 1024×768, 430×932, 390×844.
- Route accessibility by role (`03`).
- Onboarding + device activation end-to-end (create dealer → activation code → login →
  device approve → revoke → reactivate).
- Private Client Links end-to-end (create → audio → open on phone → CTA tracking → extend →
  revoke → revoked stops opening; expired stops opening; cross-dealer impossible).
- Client-safe media behaviour (seller/commission/notes never visible; signed media only).
- Maps + presentation (Original/Easy, zoom, Fit Map, no crop/distortion, photo rail).
- Technical health (no console errors, no failed required requests, no horizontal overflow,
  fonts load, no route regressions).

## Required security checks (must all pass)
Run `migration-kit/verification/verify-private-client-links.sql` and `verify-isolation.js`
against the environment; confirm no service-role key in any client bundle; confirm `/client/`
CSP + `noindex`; confirm `/config/runtime-env.js` is `no-store`.

## Deployment rules
- Run the V2 build; run syntax checks; run `git diff --check`.
- Confirm no secrets entered source or build artifacts (secret scan).
- Deploy **preview** first; verify; then production only after all required checks pass.

## Deliverables
1. Branch / commit
2. Preview deployment id + URL
3. Production deployment id + URL (if deployed)
4. Viewports tested
5. Functional checks passed
6. Bugs fixed (verified defects only)
7. `verify-*` results
8. Remaining blockers
9. Before/after screenshots where relevant
