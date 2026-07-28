(function () {
  'use strict';

  const root = document.getElementById('client-root');
  const config = window.PMRuntimeConfig && window.PMRuntimeConfig.getSupabaseConfig();
  const token = new URLSearchParams(location.search).get('token') || '';
  const sessionId = randomId();
  history.replaceState(null, '', '/client/');

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID() + window.crypto.randomUUID();
    const bytes = new Uint8Array(32); window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  }

  function safeUrl(value) {
    try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.toString() : ''; } catch (_) { return ''; }
  }

  async function rpc(name, payload) {
    const response = await fetch(config.url + '/rest/v1/rpc/' + encodeURIComponent(name), {
      method:'POST',
      headers:{ apikey:config.key, Authorization:'Bearer ' + config.key, 'Content-Type':'application/json', 'Cache-Control':'no-store' },
      body:JSON.stringify(payload || {})
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function resolveLink() {
    if (!config || !/^[0-9a-f]{64}$/.test(token)) return { ok:false, reason:'invalid' };
    try {
      const response = await fetch(config.url + '/functions/v1/resolve-client-link', {
        method:'POST',
        headers:{ apikey:config.key, 'Content-Type':'application/json', 'Cache-Control':'no-store' },
        body:JSON.stringify({ token })
      });
      if (response.ok) return response.json();
      if (response.status !== 404 && response.status !== 503) return response.json().catch(() => ({ ok:false, reason:'unavailable' }));
    } catch (_) {}
    return await rpc('plotmap_resolve_client_link', { p_token:token }) || { ok:false, reason:'unavailable' };
  }

  function event(type, propertyId) {
    return rpc('plotmap_record_client_link_event', {
      p_token:token,
      p_event_type:type,
      p_session_id:sessionId,
      p_idempotency_key:randomId(),
      p_metadata:propertyId ? { propertyId } : {}
    }).catch(() => null);
  }

  function unavailable(reason) {
    const expired = reason === 'expired'; const revoked = reason === 'revoked';
    root.innerHTML = `<section class="state-card"><div class="brand-mark">PM</div><h1>${expired ? 'This link has expired' : revoked ? 'This link was closed' : 'This private link is unavailable'}</h1><p>${expired ? 'Ask your property dealer for a fresh link.' : 'Please contact the dealer who sent it to you.'}</p></section>`;
  }

  function propertyCard(property) {
    const photos = Array.isArray(property.photos) ? property.photos.map(photo => safeUrl(photo.url)).filter(Boolean) : [];
    const location = [property.area, property.sector, property.plotNumber ? 'Plot ' + property.plotNumber : ''].filter(Boolean).join(' · ');
    const facts = [property.propertyType, property.size, property.facing, property.roadWidth ? property.roadWidth + ' road' : ''].filter(Boolean);
    return `<article class="property">
      ${photos.length ? `<div class="photo-rail">${photos.map(url => `<img src="${esc(url)}" alt="${esc(property.title || 'Property photo')}" loading="lazy" decoding="async">`).join('')}</div>` : ''}
      <h2>${esc(property.title || 'Property')}</h2>
      ${location ? `<div class="location">${esc(location)}</div>` : ''}
      ${facts.length ? `<div class="facts">${facts.map(fact => `<span class="fact">${esc(fact)}</span>`).join('')}</div>` : ''}
      ${property.description ? `<div class="description">${esc(property.description)}</div>` : ''}
      ${property.price ? `<div class="price">₹${esc(Number(property.price).toLocaleString('en-IN'))}</div>` : ''}
    </article>`;
  }

  function render(link) {
    const brand = link.branding || {}; const properties = Array.isArray(link.properties) ? link.properties : [];
    const logo = safeUrl(brand.logoUrl); const phone = String(brand.phone || '').replace(/[^0-9+]/g, ''); const whatsapp = String(brand.whatsapp || '').replace(/[^0-9]/g, '');
    const customer = link.customer && link.customer.name ? ', ' + esc(link.customer.name) : '';
    root.innerHTML = `<header class="brand">${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="">` : '<div class="brand-mark">PM</div>'}<div><div class="brand-name">${esc(brand.brandName || 'PlotMap')}</div>${brand.tagline ? `<div class="brand-tag">${esc(brand.tagline)}</div>` : ''}</div></header>
      <section class="intro"><div class="eyebrow">Prepared privately for you</div><h1>Hello${customer}</h1><p>Here are the properties selected for your review.</p></section>
      ${link.audio && safeUrl(link.audio.url) ? `<audio class="audio" controls preload="metadata" src="${esc(safeUrl(link.audio.url))}"></audio>` : ''}
      <section>${properties.map(propertyCard).join('')}</section>
      <div class="actions">
        ${phone ? `<a class="btn btn-primary" data-event="call_clicked" href="tel:${esc(phone)}">Call dealer</a>` : ''}
        ${whatsapp ? `<a class="btn btn-secondary" data-event="whatsapp_clicked" href="https://wa.me/${esc(whatsapp)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
        <button class="btn btn-wide" data-event="visit_requested" type="button">Request a site visit</button>
      </div>`;
    event('opened');
    const audio = root.querySelector('audio'); if (audio) audio.addEventListener('play', () => event('audio_played'), { once:true });
    root.querySelectorAll('[data-event]').forEach(node => node.addEventListener('click', () => {
      event(node.getAttribute('data-event'));
      if (node.tagName === 'BUTTON') { node.textContent = 'Visit request noted'; node.disabled = true; }
    }));
  }

  resolveLink().then(result => {
    if (!result || result.ok !== true || !result.link) unavailable(result && result.reason);
    else render(result.link);
  }).catch(() => unavailable('unavailable'));
})();
