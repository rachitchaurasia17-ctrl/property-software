# Onboarding / Login fixes + Developer Control consolidation — handover

Branch: `fix/onboarding-login-simplify` (off production `main` @ `5b65570`).
Nothing here is applied to production. Frontend changes are verified on a
Preview; DB/edge/destructive pieces are reviewed drafts for you (or Codex)
to apply. Codex's live backend/security systems are unchanged.

## What shipped in the frontend (safe, reversible, verified)

1. **Login bug fix — `admin/core/device-access.js`.** The post-login and
   admin-guard device checks called `plotmap_device_is_approved` with the
   dealer's JWT; a stale/expired JWT made PostgREST return 401 *before* the
   function ran, so an approved device was misreported as unapproved
   ("activated but access revoked"). The check now **retries with the anon
   key on 401/403** — that RPC is anon-granted and a pure hash check, so the
   retry yields the correct answer. This is the most likely cause of your
   symptom.

2. **Reason-aware block messaging — `admin/access-expired.html`,
   `admin/core/access-control.js`, `admin/core/device-access.js`.** The one
   generic "Access expired or blocked" is replaced by reason-specific copy:
   *Account not active* (suspended / trial ended → contact provider),
   *Device not activated* (→ enter your code on this device), *Device access
   revoked* (→ get a new code). No DB change; reasons come from existing
   signals; the admin hot-path stays side-effect-free.

3. **Developer Control consolidation — `admin/developer.html`,
   `admin/core/dev360.js`.**
   - "Activation Requests" (which actually hosted the live code generator
     under a "Legacy" heading) → renamed **Device Codes**, reframed as
     "generate a second/replacement device code," with a link to Create
     Dealer for a new dealer's first code. The legacy pending-request list is
     now hidden entirely unless legacy rows exist.
   - **One obvious path:** Dealer 360 → Devices has a **Generate device
     code** button that jumps to Device Codes with the dealer preselected.
   - Code expiry unified to `datetime-local`, **default +24h, single-use**
     (single-use was already enforced server-side by `plotmap_activate_device`).

Verified with the faithful authenticated render harness: Developer Control
boots clean, both dealers render, Dealer 360 tabs work, the Generate-code
flow preselects the dealer, and the reason-aware pages show the right text.

## Delete dealer — DRAFTS ONLY (destructive; NOT applied/deployed)

- `supabase/migrations/20260724_delete_dealer_draft.sql` — platform-admin
  `plotmap_admin_delete_dealer(p_dealer_id, p_confirm)` RPC: confirmation-
  guarded (must echo the dealer id), single transaction, purges every
  dealer-scoped table in FK-safe order, writes a durable
  `dealer_deletion_log`, and returns the owner Auth user ids to remove.
- `supabase/functions/delete-dealer/index.ts` — inverse of `provision-dealer`:
  validates JWT + platform admin, calls the RPC, then deletes the returned
  Auth user(s) via GoTrue (service role only).
- Developer Control → Dealer 360 → Account has a **Danger zone → Delete
  dealer permanently…** action requiring a typed confirmation. Until both
  drafts are deployed it degrades to "Delete is not enabled on this server
  yet" — it can never partially delete from the browser (verified).

## Production rollout steps you still need to perform

Frontend (this branch): review → merge to `main` → Vercel builds production.
Nothing else is required for items 1–3 to take effect.

Delete-dealer (only when you want it live):
1. Review `20260724_delete_dealer_draft.sql`. Apply on **staging** first,
   confirm a test dealer purges and anon is refused.
2. Deploy the `delete-dealer` edge function on staging with `--verify-jwt`
   and `PLOTMAP_ALLOWED_ORIGINS` = the origin; test end-to-end.
3. Apply the migration to production, deploy the function to production.
   The Danger-zone button then works.

## Not changed (by design)

Codex's provisioning / activation / RLS / device-lock RPCs and the
`provision-dealer` function are untouched. "Account Controls" was left as-is
(its actions also live in Dealer 360 → Account and the All Dealers rows); it
can be folded into Dealer 360 in a later pass if you want one fewer section.

## To confirm the login bug is fully resolved (needs a real login — I can't)

On the Preview, log in as a dealer whose device you just activated, with
DevTools → Network open. Confirm the `plotmap_device_is_approved` call
succeeds (or, if the first authenticated attempt 401s, that a second anon
attempt returns `true` and you're let in). If you still see a block, capture
that request's status + response and the device row in Dealer 360 → Devices.
