/* PlotMap coordinate capture. Active only with ?overlayCapture=1. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get('overlayCapture') === '1';
  let mode = 'road';
  let context = {};
  let roadPoints = [];
  let rectStart = null;
  let panel = null;
  let output = null;
  let bound = false;

  function ensurePanel() {
    if (!enabled || panel) return;
    panel = document.createElement('div');
    panel.className = 'overlay-capture-panel';
    panel.innerHTML = `
      <div class="capture-title">Overlay Capture</div>
      <div class="capture-modes">
        <button type="button" data-capture-mode="road">Road</button>
        <button type="button" data-capture-mode="rect">Rect</button>
        <button type="button" data-capture-mode="reset">Reset</button>
      </div>
      <pre class="capture-output">Click the map to capture coordinates.</pre>
    `;
    output = panel.querySelector('.capture-output');
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-capture-mode]');
      if (!button) return;
      event.stopPropagation();
      const next = button.getAttribute('data-capture-mode');
      if (next === 'reset') {
        roadPoints = [];
        rectStart = null;
      } else {
        mode = next;
      }
      write(`Mode: ${mode}`);
      updateButtons();
    });
    document.body.appendChild(panel);
    updateButtons();
  }

  function updateButtons() {
    if (!panel) return;
    panel.querySelectorAll('[data-capture-mode]').forEach(button => {
      button.classList.toggle('is-active', button.getAttribute('data-capture-mode') === mode);
    });
  }

  function viewBox() {
    const overlay = window.PlotMapOverlayEngine && window.PlotMapOverlayEngine.getOverlay(context.mapId, context.mode);
    const raw = overlay && overlay.viewBox ? overlay.viewBox.split(/\s+/).map(Number) : null;
    if (raw && raw.length === 4 && raw.every(Number.isFinite)) return raw;
    const layer = context.container || document.getElementById('maplayer');
    return [0, 0, (layer && layer.offsetWidth) || 1, (layer && layer.offsetHeight) || 1];
  }

  function currentLayer() {
    return context.container || document.getElementById('maplayer');
  }

  function pointFromEvent(event) {
    const layer = currentLayer();
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const vb = viewBox();
    return {
      percentX: +(px * 100).toFixed(3),
      percentY: +(py * 100).toFixed(3),
      svgX: +(vb[0] + px * vb[2]).toFixed(3),
      svgY: +(vb[1] + py * vb[3]).toFixed(3)
    };
  }

  function roadPath() {
    return roadPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.svgX} ${point.svgY}`).join(' ');
  }

  function rectOutput(a, b) {
    const x = Math.min(a.percentX, b.percentX);
    const y = Math.min(a.percentY, b.percentY);
    const w = Math.abs(a.percentX - b.percentX);
    const h = Math.abs(a.percentY - b.percentY);
    return `{ x: ${+x.toFixed(3)}, y: ${+y.toFixed(3)}, w: ${+w.toFixed(3)}, h: ${+h.toFixed(3)} }`;
  }

  function write(text, data) {
    const body = data ? `${text}\n${data}` : text;
    if (output) output.textContent = body;
    console.log('[PlotMap overlay capture]', body);
  }

  function handleClick(event) {
    if (!enabled || !panel) return;
    if (panel.contains(event.target)) return;
    const layer = currentLayer();
    if (!layer || !layer.contains(event.target)) return;
    const point = pointFromEvent(event);
    if (!point) return;

    const base = `percent: ${point.percentX}, ${point.percentY}\nsvg: ${point.svgX}, ${point.svgY}`;
    if (mode === 'road') {
      roadPoints.push(point);
      write(base, roadPath());
    } else {
      if (!rectStart) {
        rectStart = point;
        write(base, 'Rect start captured.');
      } else {
        const done = rectOutput(rectStart, point);
        rectStart = null;
        write(base, done);
      }
    }
  }

  function bind() {
    if (bound || !enabled) return;
    bound = true;
    document.addEventListener('click', handleClick, true);
  }

  function refresh(nextContext) {
    if (!enabled) return;
    context = Object.assign({}, context, nextContext || {});
    ensurePanel();
    bind();
  }

  window.PlotMapOverlayCapture = { refresh };
})();
