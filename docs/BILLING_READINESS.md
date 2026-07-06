# Billing / Subscription Readiness

Last updated: 2026-07-06.

**No payment integration exists and none should be added yet.** This is the scaffold that makes PlotMap subscription-ready.

## Data model (dealer_settings)

| Field | Meaning | Default |
|---|---|---|
| `plan_code` / `planCode` | plan identifier | `founding` |
| `subscription_status` | `trial` / `active` / `past_due` / `expired` | `trial` |
| `account_status` | `active` / `suspended` (manual kill-switch) | `active` |
| `trial_start`, `trial_end` | trial window | trial_start = dealer creation |
| `seat_limit`, `seat_count` | legacy seat tracking | 5 / 1 |
| `max_maps` | plan limit | 10 |
| `max_properties` | plan limit | 500 |
| `max_team_members` | plan limit | 5 |

Frontend mirror: `PMFoundation.getPlanState()` → `{ planCode, subscriptionStatus, accountStatus, trialExpired, active, maxMaps, maxProperties, maxTeamMembers, … }`.

## Behavior

- **Expired/suspended:** `getPlanState().active` is false when `account_status !== 'active'` or the trial has lapsed. `checkPlanLimit()` then blocks add-flows with a clear message. Dealer-record level suspension (`dealer.status = 'suspended'|'expired'`) additionally hard-blocks admin pages via `PMAccess` (existing behavior).
- **Limits enforced today:** adding a property beyond `maxProperties` (properties page) and adding a team member beyond `maxTeamMembers` (team page + `saveTeamMember`). Map-count limiting is display-only for now.
- **Manual activation/deactivation:** owner dashboard → *Plan & billing readiness* card → subscription status, account status, trial end date. Changes are audit-logged via `dealer_settings_saved`.

## Placement rules

- Billing does **not** appear in the main nav. It lives inside the owner dashboard settings area only.
- The Finance page must not return; billing readiness is not Finance.
- When real payments arrive: map `subscription_status` from the payment provider webhooks into `dealer_settings` (server-side), never from the client.
