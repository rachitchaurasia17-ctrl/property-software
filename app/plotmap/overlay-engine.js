/* PlotMap overlay engine: mounts SVG/CSS overlays above untouched map images. */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function publicItems(items) {
    return Array.isArray(items) ? items.filter(item => item && item.public === true) : [];
  }

  function overlayFor(mapId, mode) {
    const overlays = window.PLOTMAP_OVERLAYS || {};
    const overlay = mapId ? overlays[mapId] : null;
    if (!overlay) return null;
    if (Array.isArray(overlay.modes) && overlay.modes.length && !overlay.modes.includes(mode)) return null;
    return overlay;
  }

  function createSvg(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    return node;
  }

  function labelOf(item, fallback) {
    return String((item && (item.label || item.name || item.id)) || fallback || 'Map item');
  }

  function groupClass(group) {
    return group ? ` overlay-group-${String(group).toLowerCase()}` : '';
  }

  function appendRoad(svg, road, onPick) {
    const g = createSvg('g', { class: `plotmap-road${groupClass(road.group)}`, 'data-overlay-id': road.id });
    ['road-shadow', 'road-body', 'road-core', 'road-hit'].forEach(cls => {
      const path = createSvg('path', { d: road.d, class: cls });
      if (cls === 'road-hit') {
        path.setAttribute('tabindex', '0');
        path.setAttribute('role', 'button');
        path.setAttribute('aria-label', labelOf(road, 'Road'));
        path.addEventListener('click', event => {
          event.stopPropagation();
          onPick(road, event);
        });
      }
      g.appendChild(path);
    });
    svg.appendChild(g);
  }

  function appendShape(svg, shape, onPick) {
    (Array.isArray(shape.paths) ? shape.paths : []).forEach((d, index) => {
      const path = createSvg('path', {
        d,
        class: `plotmap-shape plotmap-shape-${shape.type || 'area'}${groupClass(shape.group)}`,
        'data-overlay-id': shape.id,
        'data-overlay-part': index
      });
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', labelOf(shape, 'Map area'));
      path.addEventListener('click', event => {
        event.stopPropagation();
        onPick(shape, event);
      });
      svg.appendChild(path);
    });
  }

  function percent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : '0%';
  }

  function targetCenter(targets, item) {
    if (!item || !item.targetId || !targets[item.targetId]) return null;
    const target = targets[item.targetId];
    return {
      x: Number(target.x) + Number(target.w || 0) / 2,
      y: Number(target.y)
    };
  }

  function appendBox(layer, item, cls, onPick) {
    const box = document.createElement('button');
    box.type = 'button';
    box.className = cls;
    box.style.left = percent(item.x);
    box.style.top = percent(item.y);
    box.style.width = percent(item.w);
    box.style.height = percent(item.h);
    box.title = labelOf(item);
    box.setAttribute('aria-label', labelOf(item));
    box.dataset.overlayId = item.id || '';
    box.addEventListener('click', event => {
      event.stopPropagation();
      onPick(item, event);
    });
    const shine = document.createElement('span');
    shine.className = 'overlay-box-shine';
    box.appendChild(shine);
    layer.appendChild(box);
  }

  function appendPin(layer, pin, targets, onPick) {
    const center = targetCenter(targets, pin);
    const x = Number.isFinite(Number(pin.x)) ? Number(pin.x) : center && center.x;
    const y = Number.isFinite(Number(pin.y)) ? Number(pin.y) : center && center.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-pin';
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.title = labelOf(pin, 'Pin');
    button.setAttribute('aria-label', labelOf(pin, 'Pin'));
    button.dataset.overlayId = pin.id || '';
    button.addEventListener('click', event => {
      event.stopPropagation();
      onPick(pin, event);
    });
    const centerDot = document.createElement('span');
    button.appendChild(centerDot);
    layer.appendChild(button);
  }

  function showInfo(root, item, event) {
    root.querySelectorAll('.overlay-info-card').forEach(card => card.remove());
    const card = document.createElement('div');
    card.className = 'overlay-info-card';
    const title = document.createElement('b');
    title.textContent = labelOf(item);
    const meta = document.createElement('span');
    meta.textContent = item.type || item.group || 'Map overlay';
    card.append(title, meta);
    const rect = root.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.width - 190, event.clientX - rect.left + 14));
    const top = Math.max(12, Math.min(rect.height - 78, event.clientY - rect.top - 18));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    root.appendChild(card);
    window.clearTimeout(root._overlayInfoTimer);
    root._overlayInfoTimer = window.setTimeout(() => card.remove(), 3600);
  }

  function mount(options) {
    const container = options && options.container;
    if (!container) return null;
    container.querySelectorAll(':scope > .plotmap-overlay-root').forEach(node => node.remove());

    const overlay = overlayFor(options.mapId, options.mode);
    if (!overlay) return null;

    const root = document.createElement('div');
    root.className = 'plotmap-overlay-root plotmap-map-stage';
    root.dataset.overlayMap = options.mapId || '';
    root.style.width = `${options.width || container.clientWidth || 0}px`;
    root.style.height = `${options.height || container.clientHeight || 0}px`;

    const svg = createSvg('svg', {
      class: 'plotmap-road-layer',
      viewBox: overlay.viewBox || `0 0 ${options.width || 1} ${options.height || 1}`,
      preserveAspectRatio: 'none',
      'aria-hidden': 'true'
    });

    const defs = createSvg('defs');
    defs.innerHTML = '<filter id="plotmapRoadGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    svg.appendChild(defs);

    const selectionLayer = document.createElement('div');
    selectionLayer.className = 'plotmap-selection-layer';

    const onPick = (item, event) => showInfo(root, item, event);

    publicItems(overlay.shapes).forEach(shape => appendShape(svg, shape, onPick));
    publicItems(overlay.roads).forEach(road => appendRoad(svg, road, onPick));

    const targets = {};
    publicItems(overlay.selectedPlots).forEach(item => {
      targets[item.id] = item;
      appendBox(selectionLayer, item, 'selected-house', onPick);
    });
    publicItems(overlay.selectedLandmarks).forEach(item => {
      targets[item.id] = item;
      appendBox(selectionLayer, item, item.type === 'school' ? 'selected-school' : 'selected-school selected-landmark', onPick);
    });
    publicItems(overlay.pins).forEach(pin => appendPin(selectionLayer, pin, targets, onPick));

    root.append(svg, selectionLayer);
    root.addEventListener('click', () => root.querySelectorAll('.overlay-info-card').forEach(card => card.remove()));
    container.appendChild(root);
    return root;
  }

  window.PlotMapOverlayEngine = {
    mount,
    getOverlay: overlayFor,
    clear(container) {
      if (container) container.querySelectorAll(':scope > .plotmap-overlay-root').forEach(node => node.remove());
    }
  };
})();
