/* =============================================================================
   PlotMap — Private Client Links  ·  FRONTEND CONTRACT (window.PMClientLinks)
   -----------------------------------------------------------------------------
   Private Client Links is the approved NEW feature: a dealer sends one customer
   a private, mobile-first page showing a small, client-safe snapshot of selected
   plots (chosen photos only, controlled price + location visibility, optional
   dealer audio, dealer branding), with expiry, revocation and genuine open/reply
   tracking. It EXTENDS the existing share_links infrastructure — it is NOT a
   second sharing system.

   THIS PHASE ships the frontend contract + UI states ONLY. The secure backend
   (share_links columns/metadata, a client-safe resolver RPC, RLS, an events
   table, the audio storage bucket + policies + signed delivery, and the Edge
   Function) is NOT built here. Until it is, create()/list()/revoke() report
   { ok:false, pending:true } so the dealer UI shows an honest "not enabled yet"
   state and NEVER fabricates a working link or a success.

   ── BACKEND CONTRACT the later phase must implement (kept here so the UI and
      the server agree exactly) ──────────────────────────────────────────────

   create(payload) → POST authenticated RPC `plotmap_create_client_link`
     payload (dealer-scoped, owner/team-authorized server-side):
       { clientId:            string,             // existing customer id
         propertyIds:         string[<=4],        // existing plot ids, max 4
         photoSelections:     { [propertyId]: string[] },  // chosen client-safe photo refs
         priceVisibility:     'hidden' | 'shown', // DEFAULT 'hidden'
         locationVisibility:  'area' | 'exact' | 'hidden',  // DEFAULT 'area'
         audio:               null | { objectPath, seconds }, // dealer voice note
         expiresInDays:       3 | 7 | 14 | 30 | null,
         branding:            { brandName, logoUrl, phone, whatsapp } }
     returns { ok:true, id, slug, url } | { ok:false, reason }
     server: mint an UNGUESSABLE slug (>=128-bit), write a share_links row with
     target_type='client_link', a frozen client-safe SNAPSHOT in metadata (so
     later inventory edits never leak), expires_at, status='active'.

   resolve(slug) → anon RPC `plotmap_resolve_client_link(slug)` (security definer)
     returns ONLY client-safe fields, honoring the visibility flags; NEVER seller
     contact, commission, source, internal price, negotiation/staff notes,
     internal ids, full inventory, or exact location when locationVisibility!='exact'.
     Rejects expired / revoked / unknown slugs.

   list(propertyId?) → authenticated `plotmap_list_client_links` (dealer-scoped)
   revoke(id)        → authenticated `plotmap_revoke_client_link` (immediate)
   events            → append-only `client_link_events` (opens, audio played,
                       call, whatsapp, visit) surfaced back to the dealer.
   audio             → private per-dealer bucket, MIME + size validation, signed
                       delivery only, cleaned on dealer deletion.
   ========================================================================== */
(function (global) {
  'use strict';

  // Enabled only when the secure backend + a runtime flag are live. The build's
  // runtime-env may set window.PM_CLIENT_LINKS_ENABLED = true once deployed.
  function isEnabled() {
    return global.PM_CLIENT_LINKS_ENABLED === true;
  }

  var PENDING = Object.freeze({
    ok: false,
    pending: true,
    reason: 'backend_not_enabled',
    message: 'Private Client Links is being finished — the secure link, photos and audio go live once its backend is enabled. Nothing is sent yet.'
  });

  // Validate a create payload against the contract BEFORE it ever reaches a
  // server, so the UI can surface field errors immediately.
  function validate(payload) {
    var errors = [];
    payload = payload || {};
    if (!payload.clientId) errors.push('Choose a customer for this link.');
    if (!Array.isArray(payload.propertyIds) || payload.propertyIds.length < 1) errors.push('Add at least one plot.');
    if (Array.isArray(payload.propertyIds) && payload.propertyIds.length > 4) errors.push('A client link can hold at most 4 plots.');
    if (payload.priceVisibility && ['hidden', 'shown'].indexOf(payload.priceVisibility) < 0) errors.push('Invalid price visibility.');
    if (payload.locationVisibility && ['area', 'exact', 'hidden'].indexOf(payload.locationVisibility) < 0) errors.push('Invalid location visibility.');
    return { ok: errors.length === 0, errors: errors };
  }

  function withDefaults(payload) {
    payload = payload || {};
    return {
      clientId: payload.clientId || null,
      propertyIds: (payload.propertyIds || []).slice(0, 4),
      photoSelections: payload.photoSelections || {},
      priceVisibility: payload.priceVisibility || 'hidden',       // safe default
      locationVisibility: payload.locationVisibility || 'area',   // safe default
      audio: payload.audio || null,
      expiresInDays: payload.expiresInDays == null ? 7 : payload.expiresInDays,
      branding: payload.branding || null
    };
  }

  // create — real call when enabled; honest pending state otherwise.
  function create(payload) {
    var full = withDefaults(payload);
    var v = validate(full);
    if (!v.ok) return Promise.resolve({ ok: false, reason: 'invalid', errors: v.errors });
    if (!isEnabled()) return Promise.resolve(PENDING);
    // When enabled, call the authenticated RPC (contract above). Implemented in
    // the backend phase; guarded here so the stub never pretends to succeed.
    if (typeof global.__pmCreateClientLink === 'function') {
      return Promise.resolve(global.__pmCreateClientLink(full));
    }
    return Promise.resolve(PENDING);
  }

  function list(propertyId) {
    if (!isEnabled()) return Promise.resolve({ ok: false, pending: true, links: [] });
    if (typeof global.__pmListClientLinks === 'function') return Promise.resolve(global.__pmListClientLinks(propertyId));
    return Promise.resolve({ ok: false, pending: true, links: [] });
  }

  function revoke(id) {
    if (!isEnabled()) return Promise.resolve(PENDING);
    if (typeof global.__pmRevokeClientLink === 'function') return Promise.resolve(global.__pmRevokeClientLink(id));
    return Promise.resolve(PENDING);
  }

  global.PMClientLinks = {
    isEnabled: isEnabled,
    validate: validate,
    withDefaults: withDefaults,
    create: create,
    list: list,
    revoke: revoke,
    PENDING: PENDING
  };
})(typeof window !== 'undefined' ? window : this);
