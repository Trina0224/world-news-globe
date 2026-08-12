// Make Washington, D.C. discoverable on the full US map without distorting its real polygon.
(function installDCEnhancement() {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function ensureDCInRegionList() {
    try {
      if (!US_STATES.includes('District of Columbia')) {
        const insertAt = Math.max(0, US_STATES.indexOf('Delaware') + 1);
        US_STATES.splice(insertAt, 0, 'District of Columbia');
      }
      if (typeof US_REGION_SLUGS === 'object') {
        US_REGION_SLUGS['District of Columbia'] = 'district-of-columbia';
      }
      if (typeof isUS === 'function' && isUS() && ui?.regionSelect) {
        const exists = [...ui.regionSelect.options].some(o => o.value === 'District of Columbia');
        if (!exists && typeof updateRegionControls === 'function') updateRegionControls(false);
      }
    } catch (_) {}
  }

  function decorateDC() {
    const group = document.querySelector('#usOverlayMap .us-state[data-name="District of Columbia"]');
    if (!group || group.querySelector('.us-dc-marker')) return;
    const path = group.querySelector('path');
    if (!path) return;

    let box;
    try { box = path.getBBox(); } catch (_) { return; }
    if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Larger invisible hit target. The actual DC polygon remains unchanged underneath.
    const hit = document.createElementNS(SVG_NS, 'circle');
    hit.setAttribute('class', 'us-dc-marker us-dc-hit');
    hit.setAttribute('cx', String(cx));
    hit.setAttribute('cy', String(cy));
    hit.setAttribute('r', '12');
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'transparent');
    hit.style.pointerEvents = 'all';
    hit.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof chooseUSState === 'function') chooseUSState('District of Columbia');
    });

    // Small visible ring so DC can actually be found at the nationwide zoom level.
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'us-dc-marker us-dc-dot');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '4.5');
    dot.setAttribute('fill', 'rgba(111,211,255,0.95)');
    dot.setAttribute('stroke', 'rgba(255,255,255,1)');
    dot.setAttribute('stroke-width', '1.5');
    dot.setAttribute('vector-effect', 'non-scaling-stroke');
    dot.style.pointerEvents = 'none';

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'us-dc-marker us-dc-label');
    label.setAttribute('x', String(cx + 7));
    label.setAttribute('y', String(cy - 6));
    label.setAttribute('fill', 'rgba(244,247,251,0.95)');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'Inter, -apple-system, BlinkMacSystemFont, sans-serif');
    label.setAttribute('paint-order', 'stroke');
    label.setAttribute('stroke', 'rgba(5,7,11,0.9)');
    label.setAttribute('stroke-width', '2');
    label.setAttribute('vector-effect', 'non-scaling-stroke');
    label.style.pointerEvents = 'none';
    label.textContent = 'DC';

    group.append(hit, dot, label);
  }

  ensureDCInRegionList();
  const timer = setInterval(() => {
    ensureDCInRegionList();
    decorateDC();
    if (document.querySelector('#usOverlayMap .us-dc-marker')) clearInterval(timer);
  }, 150);

  // Also retry when entering the US overlay later in the session.
  setInterval(() => {
    if (document.getElementById('usOverlay')?.classList.contains('hidden')) return;
    ensureDCInRegionList();
    decorateDC();
  }, 1000);
})();
