const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../app/plotmap/styles.css');
const jsPath = path.join(__dirname, '../app/plotmap/app.js');

let js = fs.readFileSync(jsPath, 'utf8');

// 1. origSVG rendering pins for blocks/zones
js = js.replace(/function origSVG\(\) \{[\s\S]*?return `<svg class="easy-svg orig-ov" viewBox="\$\{GEO\.viewBox\}" preserveAspectRatio="xMidYMid meet"><g id="oRoadCase">\$\{casing\}<\/g><g id="oRoads">\$\{lines\}<\/g><g id="oSpot"><\/g><g id="oHit">\$\{hits\}<\/g><\/svg>`;\n  \}/,
`function origSVG() {
    const roadOf = {}; keyRoads().forEach(r => { if (num(r.cyanIdx) && GEO.cyan[Number(r.cyanIdx)]) roadOf[Number(r.cyanIdx)] = r.id; });
    const casing = GEO.cyan.map((d, i) => \`<path d="\${d}" class="o-road-case" data-roadpath="\${roadOf[i] || ''}"/>\`).join('');
    const lines = GEO.cyan.map((d, i) => \`<path d="\${d}" class="o-road" data-roadpath="\${roadOf[i] || ''}"/>\`).join('');
    const hits = GEO.cyan.map((d, i) => roadOf[i] ? \`<path d="\${d}" class="o-hit" data-hit="line:\${roadOf[i]}"/>\` : '').join('');

    const pinsHTML = [];
    const addPin = (item, kind) => {
      let cx = 0, cy = 0;
      if (item.at) { cx = (item.at[0] / EW) * IW; cy = (item.at[1] / EH) * IH; }
      else if (item.w) { cx = ((item.x + item.w/2) / EW) * IW; cy = ((item.y + item.h/2) / EH) * IH; }
      else return;
      const c = catColor(item.cat);
      pinsHTML.push(\`<g class="o-pin" data-hit="\${kind}:\${item.id}" data-itempath="\${item.id}" style="transform:translate(\${cx}px,\${cy}px)">
        <circle cx="0" cy="0" r="32" fill="\${c}" stroke="#fff" stroke-width="10" class="pin-dot"/>
        <rect x="-140" y="50" width="280" height="70" rx="35" fill="\${hexA(c, .95)}" class="pin-lbl-bg"/>
        <text x="0" y="96" class="pin-lbl" fill="#fff" text-anchor="middle" font-size="32" font-weight="700">\${esc(item.name)}</text>
      </g>\`);
    };
    scopedBlocks().forEach(b => addPin(b, 'block'));
    scopedZones().forEach(z => addPin(z, 'zone'));
    scopedPins().forEach(p => addPin(p, 'pin'));

    return \`<svg class="easy-svg orig-ov" viewBox="\${GEO.viewBox}" preserveAspectRatio="xMidYMid meet"><g id="oRoadCase">\${casing}</g><g id="oRoads">\${lines}</g><g id="oPins">\${pinsHTML.join('')}</g><g id="oSpot"></g><g id="oHit">\${hits}</g></svg>\`;
  }`);

// 2. updateMapOverlays logic
js = js.replace(/\} else if \(kind === 'original'\) \{[\s\S]*?l\.classList\.toggle\('dimmed', !!\(sel || cat\)\);\n    \}/,
`} else if (kind === 'original') {
      l.querySelectorAll('.o-road, .o-road-case').forEach(p => { 
        const id = p.getAttribute('data-roadpath'); 
        const on = relate(id, 'line'); 
        p.classList.toggle('soft', !!cat && cat === 'roads' && on && !sel); 
        p.classList.toggle('hide', sel ? id !== sel : (cat ? !on : true)); 
        p.classList.toggle('show', on && !p.classList.contains('hide'));
      });
      l.querySelectorAll('.o-pin').forEach(g => {
        const id = g.getAttribute('data-itempath');
        const on = relate(id, itemKindOf(id));
        const inCat = !!cat && cat === itemCategory(id);
        g.classList.toggle('soft', inCat && on && !sel);
        g.classList.toggle('hide', sel ? id !== sel : (cat ? !on : true));
        g.classList.toggle('show', on && !g.classList.contains('hide'));
      });
      const sp = l.querySelector('#oSpot'); if (sp) { sp.innerHTML = '';
        if (sel && selKind === 'line') { const d = GEO.cyan[roadById(sel).cyanIdx]; sp.innerHTML = \`<path d="\${d}" filter="url(#eglow)" style="fill:none;stroke:#2BD0E6;stroke-width:44;opacity:.4;stroke-linecap:round"/><path d="\${d}" style="fill:none;stroke:#0B2552;stroke-width:28;stroke-linecap:round"/><path d="\${d}" style="fill:none;stroke:#fff;stroke-width:14;stroke-linecap:round"/><path d="\${d}" style="fill:none;stroke:#2BD0E6;stroke-width:8;stroke-linecap:round"/>\`; }
        else if (sel && selKind !== 'line') {
          const it = itemObj(sel);
          let cx = 0, cy = 0;
          if (it.at) { cx = (it.at[0] / EW) * IW; cy = (it.at[1] / EH) * IH; }
          else if (it.w) { cx = ((it.x + it.w/2) / EW) * IW; cy = ((it.y + it.h/2) / EH) * IH; }
          const c = catColor(it.cat);
          sp.innerHTML = \`<g style="transform:translate(\${cx}px,\${cy}px)"><circle cx="0" cy="0" r="58" fill="\${c}" opacity="0.3"/><circle cx="0" cy="0" r="42" fill="none" stroke="\${c}" stroke-width="12"/></g>\`;
        }
      }
      l.classList.toggle('dimmed', !!(sel || cat));
    }`);

// 3. Pan / Zoom bounding
js = js.replace(/function applyT\(anim\) \{ const l = layer\(\); if \(\!l\) return; l\.style\.transition = anim \? 'transform \.5s cubic-bezier\(\.33,0,\.2,1\)' : 'none'; l\.style\.transform = `translate\(\$\{tx\}px,\$\{ty\}px\) scale\(\$\{scale\}\)`; \}/,
`function applyT(anim) { 
    const vp = wrap(); if (!vp || !vp.clientWidth) return;
    const W = vp.clientWidth, H = vp.clientHeight;
    const minX = W - LW * scale, maxX = 0;
    const minY = H - LH * scale, maxY = 0;
    
    if (minX > maxX) { tx = (W - LW * scale) / 2; } else { tx = Math.max(minX, Math.min(maxX, tx)); }
    if (minY > maxY) { ty = (H - LH * scale) / 2; } else { ty = Math.max(minY, Math.min(maxY, ty)); }

    const l = layer(); if (!l) return; 
    l.style.transition = anim ? 'transform .5s cubic-bezier(.33,0,.2,1)' : 'none'; 
    l.style.transform = \`translate(\${tx}px,\${ty}px) scale(\${scale})\`; 
  }`);

js = js.replace(/function fit\(\) \{ const vp = wrap\(\); if \(\!vp \|\| \!vp\.clientWidth\) return; const W = vp\.clientWidth, H = vp\.clientHeight; const s = Math\.min\(W \/ LW, H \/ LH\) \* 0\.97; scale = s; tx = \(W - LW \* s\) \/ 2; ty = \(H - LH \* s\) \/ 2; applyT\(true\); \}/,
`function fit() { const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight; const s = Math.max(W / LW, H / LH); scale = s; tx = (W - LW * s) / 2; ty = (H - LH * s) / 2; applyT(true); }`);

js = js.replace(/function focusBox\(cx, cy, bw, bh, maxZoom\) \{[\s\S]*?applyT\(true\);\n  \}/,
`function focusBox(cx, cy, bw, bh, maxZoom) {
    const vp = wrap(); if (!vp || !vp.clientWidth) return; const W = vp.clientWidth, H = vp.clientHeight;
    const pad = 2.4; const sFit = Math.min(W / (bw * pad), H / (bh * pad));
    const minScale = Math.max(W / LW, H / LH);
    const s = Math.max(minScale, Math.min(sFit, maxZoom || 1.6));
    scale = s; tx = W / 2 - cx * s; ty = H / 2 - cy * s; applyT(true);
  }`);

js = js.replace(/function zoomAt\(cx, cy, f\) \{ const vp = wrap\(\); if \(\!vp\) return; const r = vp\.getBoundingClientRect\(\); const ox = cx - r\.left, oy = cy - r\.top; const ns = Math\.max\(0\.3, Math\.min\(scale \* f, 5\)\); const k = ns \/ scale; tx = ox - \(ox - tx\) \* k; ty = oy - \(oy - ty\) \* k; scale = ns; applyT\(false\); \}/,
`function zoomAt(cx, cy, f) { const vp = wrap(); if (!vp) return; const r = vp.getBoundingClientRect(); const ox = cx - r.left, oy = cy - r.top; const W = vp.clientWidth, H = vp.clientHeight; const minScale = Math.max(W / LW, H / LH); const ns = Math.max(minScale, Math.min(scale * f, 5)); const k = ns / scale; tx = ox - (ox - tx) * k; ty = oy - (oy - ty) * k; scale = ns; applyT(false); }`);

// 4. Select Item logic (stop pan/zoom displacement)
js = js.replace(/function selectItem\(id, kind\) \{[\s\S]*?render\(\); setTimeout\(\(\) => focusItem\(id\), 60\);\n  \}/,
`function selectItem(id, kind) {
    state.itemId = id; state.itemKind = (kind === 'road' ? 'line' : kind); state.itemOpen = false; state.catId = itemCategory(id); state.section = 'master';
    render();
  }`);

// 5. Simplify Right Panel (previewCardHTML & catItemsPanelHTML)
js = js.replace(/function previewCardHTML\(id\) \{[\s\S]*?return `<div class="preview-card">[\s\S]*?<\/div>`;\n  \}/,
`function previewCardHTML(id) {
    const kind = itemKindOf(id);
    if (kind === 'block') {
      const b = blockById(id), props = propsInBlock(id);
      return \`<div class="preview-card"><div class="pc-cat" style="color:\${catColor(b.cat)}">\${esc(b.area)} Block</div><div class="pc-name">\${esc(b.name)}</div>
        <div class="pc-rel"><span>\${props.length} available propert\${props.length === 1 ? 'y' : 'ies'}</span></div>
        <div class="pc-actions"><button class="pc-primary" data-viewprops="\${id}">View Properties</button><button class="pc-ghost" data-focus="\${id}">Focus Map</button></div></div>\`;
    }
    const it = itemObj(id); const cat = catById(itemCategory(id)) || { label: 'Value driver', color: '#16356A' };
    const hasPhotos = it.photos !== false;
    return \`<div class="preview-card">
      <div class="pc-top">
        <div>
          <div class="pc-cat" style="color:\${cat.color}">\${esc(cat.label)}</div>
          <div class="pc-name">\${esc(it.name)}</div>
        </div>
        \${hasPhotos ? \`<button class="gallery-icon-btn" data-photos="\${id}" title="View Photos">
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>
          </svg></button>\` : ''}
      </div>
      \${it.related && it.related.length ? \`<div class="pc-rel">\${it.related.map(r => \`<span>\${esc(r)}</span>\`).join('')}</div>\` : ''}
      <div class="pc-actions"><button class="pc-ghost wfull" data-focus="\${id}">Focus on Map</button></div>
    </div>\`;
  }`);

// Add event listener binding for data-focus
js = js.replace(/each\('\\[data-details\\]', b => b\.addEventListener\('click', \(\) => \{ state\.itemId = b\.getAttribute\('data-details'\); state\.itemOpen = true; render\(\); \}\)\);/,
`each('[data-details]', b => b.addEventListener('click', () => { state.itemId = b.getAttribute('data-details'); state.itemOpen = true; render(); }));
    each('[data-focus]', b => b.addEventListener('click', () => focusItem(b.getAttribute('data-focus'))));`);

// Apply styles for o-pin
let css = fs.readFileSync(cssPath, 'utf8');
css = css.replace(/\.orig-ov \.o-hit \{/,
`.orig-ov .o-pin { opacity:0; transition:opacity .3s, transform .3s cubic-bezier(.34,1.56,.64,1); pointer-events:none; }
.orig-ov .o-pin.soft { opacity:.4; transform:translateY(8px) scale(0.95) !important; }
.orig-ov .o-pin.show { opacity:1; }
.orig-ov .o-pin.hide { opacity:0; }
.orig-ov .o-pin .pin-lbl-bg { stroke:#fff; stroke-width:6; }
.orig-ov .o-hit {`);

fs.writeFileSync(jsPath, js);
fs.writeFileSync(cssPath, css);
console.log('Update script executed successfully.');
