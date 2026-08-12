// Hybrid Japan mode: keep the 3D globe alive underneath a fixed 2D SVG viewport.
const JAPAN_OVERLAY_MAP = 'data/maps/japan-prefectures.geojson';
const japanOverlay = {
  active: false,
  lastCountry: null,
  loaded: false,
  features: [],
  zoom: 1,
  panX: 0,
  panY: 0,
  pointers: new Map(),
  dragStart: null,
  pinchStart: null,
  contentGroup: null,
  suppressClickUntil: 0
};

const overlayEl = document.getElementById('japanOverlay');
const overlaySvg = document.getElementById('japanOverlayMap');
const mapFrame = document.querySelector('.japan-map-frame');
const backWorldBtn = document.getElementById('backWorldBtn');
const overlayTitle = document.getElementById('japanOverlayTitle');
const zoomInBtn = document.getElementById('japanZoomIn');
const zoomOutBtn = document.getElementById('japanZoomOut');
const zoomResetBtn = document.getElementById('japanZoomReset');

const JP_FILL = 'rgba(55, 96, 122, 0.82)';
const JP_STROKE = 'rgba(222, 238, 248, 0.92)';
const JP_SELECTED = 'rgba(111, 211, 255, 0.95)';
const JP_SELECTED_STROKE = 'rgba(255,255,255,1)';
const MAP_SIZE = 900;
const MAP_CENTER = MAP_SIZE / 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 15;

function overlayText() {
  if (state.lang === 'en') return { title: 'Japan · 47 Prefectures', back: '← World', status: 'Pinch to zoom · drag to move' };
  if (state.lang === 'ja') return { title: '日本 · 47都道府県', back: '← 世界へ', status: 'ピンチで拡大 · ドラッグで移動' };
  return { title: '日本 · 47 都道府縣', back: '← 返回世界', status: '雙指放大 · 拖曳移動' };
}

function updateOverlayText() {
  const s = overlayText();
  overlayTitle.textContent = s.title;
  backWorldBtn.textContent = s.back;
  if (japanOverlay.active) ui.globeHint.textContent = s.status;
}

function geometryRings(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

function paintPrefecture(group, selected) {
  group.classList.toggle('selected', selected);
  group.querySelectorAll('path').forEach(path => {
    path.setAttribute('fill', selected ? JP_SELECTED : JP_FILL);
    path.setAttribute('stroke', selected ? JP_SELECTED_STROKE : JP_STROKE);
    path.setAttribute('stroke-width', selected ? '2' : '1.15');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
  });
}

function clampZoom(v) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v));
}

function clampPan() {
  const z = japanOverlay.zoom;
  const limit = MAP_CENTER * (z - 1);
  japanOverlay.panX = Math.max(-limit, Math.min(limit, japanOverlay.panX));
  japanOverlay.panY = Math.max(-limit, Math.min(limit, japanOverlay.panY));
}

function applyMapTransform() {
  if (!japanOverlay.contentGroup) return;
  clampPan();
  japanOverlay.contentGroup.setAttribute(
    'transform',
    `translate(${japanOverlay.panX} ${japanOverlay.panY}) translate(${MAP_CENTER} ${MAP_CENTER}) scale(${japanOverlay.zoom}) translate(${-MAP_CENTER} ${-MAP_CENTER})`
  );
}

function setMapZoom(nextZoom, anchorX = MAP_CENTER, anchorY = MAP_CENTER) {
  const oldZoom = japanOverlay.zoom;
  const newZoom = clampZoom(nextZoom);
  if (Math.abs(newZoom - oldZoom) < 0.0001) return;

  const ratio = newZoom / oldZoom;
  japanOverlay.panX = anchorX - MAP_CENTER - (anchorX - MAP_CENTER - japanOverlay.panX) * ratio;
  japanOverlay.panY = anchorY - MAP_CENTER - (anchorY - MAP_CENTER - japanOverlay.panY) * ratio;
  japanOverlay.zoom = newZoom;
  applyMapTransform();
}

function resetMapView() {
  japanOverlay.zoom = 1;
  japanOverlay.panX = 0;
  japanOverlay.panY = 0;
  japanOverlay.pointers.clear();
  japanOverlay.dragStart = null;
  japanOverlay.pinchStart = null;
  document.body.classList.remove('jp-map-gesture-active');
  applyMapTransform();
}

function clientToSvg(clientX, clientY) {
  const rect = mapFrame.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * MAP_SIZE,
    y: ((clientY - rect.top) / Math.max(1, rect.height)) * MAP_SIZE
  };
}

function renderJapanOverlay(features) {
  const pts = [];
  for (const f of features) for (const ring of geometryRings(f.geometry)) for (const p of ring) pts.push(p);
  if (!pts.length) return;

  const lons = pts.map(p => p[0]);
  const lats = pts.map(p => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const W = MAP_SIZE, H = MAP_SIZE, pad = 54;
  const scale = Math.min((W - pad * 2) / (maxLon - minLon), (H - pad * 2) / (maxLat - minLat));
  const x0 = (W - (maxLon - minLon) * scale) / 2;
  const y0 = (H - (maxLat - minLat) * scale) / 2;
  const project = p => [x0 + (p[0] - minLon) * scale, H - (y0 + (p[1] - minLat) * scale)];

  overlaySvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  overlaySvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  overlaySvg.innerHTML = '';

  const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  japanOverlay.contentGroup = root;
  overlaySvg.appendChild(root);

  for (const f of features) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('jp-pref');
    group.dataset.value = f.properties.value;
    group.dataset.label = f.properties.label;
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', f.properties.label);

    for (const ring of geometryRings(f.geometry)) {
      if (ring.length < 3) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = ring.map((p, i) => {
        const [x, y] = project(p);
        return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(' ') + ' Z';
      path.setAttribute('d', d);
      path.style.pointerEvents = 'all';
      group.appendChild(path);
    }

    paintPrefecture(group, false);
    group.addEventListener('click', e => {
      if (performance.now() < japanOverlay.suppressClickUntil) return;
      e.stopPropagation();
      choosePrefecture(f.properties.value);
    });
    group.addEventListener('pointerenter', () => {
      if (group.dataset.value !== state.region) {
        group.querySelectorAll('path').forEach(path => path.setAttribute('fill', 'rgba(85,156,190,0.92)'));
      }
      ui.globeStatus.textContent = f.properties.label;
    });
    group.addEventListener('pointerleave', () => {
      paintPrefecture(group, group.dataset.value === state.region);
      ui.globeStatus.textContent = 'Japan · 47 prefectures';
    });
    root.appendChild(group);
  }

  resetMapView();
  syncOverlaySelection();
}

async function ensureJapanOverlay() {
  if (japanOverlay.loaded) return true;
  try {
    const r = await fetch(`${JAPAN_OVERLAY_MAP}?v=5`, { cache: 'force-cache' });
    if (!r.ok) throw new Error(`Japan map ${r.status}`);
    const data = await r.json();
    japanOverlay.features = Array.isArray(data.features) ? data.features : [];
    if (japanOverlay.features.length !== 47) throw new Error(`Expected 47 prefectures, got ${japanOverlay.features.length}`);
    renderJapanOverlay(japanOverlay.features);
    japanOverlay.loaded = true;
    return true;
  } catch (e) {
    console.error('Japan overlay failed', e);
    ui.globeStatus.textContent = 'Japan map unavailable';
    return false;
  }
}

function syncOverlaySelection() {
  overlaySvg.querySelectorAll('.jp-pref').forEach(el => {
    paintPrefecture(el, el.dataset.value === state.region);
  });
}

function choosePrefecture(value) {
  state.region = value || '';
  updateRegionControls(false);
  ui.regionSelect.value = state.region;
  ui.locationType.textContent = t('prefecture');
  const pair = JP_PREFECTURES.find(([, v]) => v === state.region);
  if (pair) ui.locationName.textContent = pair[0];
  syncOverlaySelection();
  if (typeof fetchNews === 'function') setTimeout(fetchNews, 0);
}

async function enterJapanOverlay() {
  if (japanOverlay.active) return;
  if (!(await ensureJapanOverlay())) return;
  japanOverlay.active = true;
  overlayEl.classList.remove('hidden');
  resetMapView();
  state.region = '';
  updateRegionControls(true);
  ui.regionSelect.value = '';
  syncOverlaySelection();
  updateOverlayText();
  ui.globeStatus.textContent = 'Japan · 47 prefectures';
}

function exitJapanOverlay() {
  if (!japanOverlay.active) return;
  japanOverlay.active = false;
  overlayEl.classList.add('hidden');
  document.body.classList.remove('jp-map-gesture-active');
  state.region = '';
  state.country = null;
  refreshPolygonColors();
  updateLabels();
  ui.regionControls.classList.add('hidden');
  setNewsState(t('intro'));
  requestAnimationFrame(() => {
    resizeGlobe();
    try { state.globe?.renderer?.().render?.(state.globe.scene(), state.globe.camera()); } catch (_) {}
  });
  ui.globeStatus.textContent = `${state.countries.length} countries`;
}

zoomInBtn?.addEventListener('click', () => setMapZoom(japanOverlay.zoom * 1.6));
zoomOutBtn?.addEventListener('click', () => setMapZoom(japanOverlay.zoom / 1.6));
zoomResetBtn?.addEventListener('click', resetMapView);
backWorldBtn.addEventListener('click', exitJapanOverlay);

mapFrame.addEventListener('wheel', e => {
  if (!japanOverlay.active) return;
  e.preventDefault();
  e.stopPropagation();
  const p = clientToSvg(e.clientX, e.clientY);
  setMapZoom(japanOverlay.zoom * (e.deltaY < 0 ? 1.2 : 0.84), p.x, p.y);
}, { passive: false });

function beginGestureLock() {
  document.body.classList.add('jp-map-gesture-active');
}
function endGestureLockIfIdle() {
  if (japanOverlay.pointers.size === 0) document.body.classList.remove('jp-map-gesture-active');
}

mapFrame.addEventListener('pointerdown', e => {
  if (!japanOverlay.active) return;
  e.preventDefault();
  e.stopPropagation();
  beginGestureLock();
  mapFrame.setPointerCapture?.(e.pointerId);
  japanOverlay.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (japanOverlay.pointers.size === 1) {
    japanOverlay.dragStart = {
      x: e.clientX,
      y: e.clientY,
      panX: japanOverlay.panX,
      panY: japanOverlay.panY,
      moved: false
    };
    japanOverlay.pinchStart = null;
  } else if (japanOverlay.pointers.size === 2) {
    const pts = [...japanOverlay.pointers.values()];
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const mid = clientToSvg((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    japanOverlay.pinchStart = {
      distance: Math.max(1, Math.hypot(dx, dy)),
      zoom: japanOverlay.zoom,
      panX: japanOverlay.panX,
      panY: japanOverlay.panY,
      mid
    };
    japanOverlay.dragStart = null;
  }
});

mapFrame.addEventListener('pointermove', e => {
  if (!japanOverlay.pointers.has(e.pointerId)) return;
  e.preventDefault();
  e.stopPropagation();
  japanOverlay.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (japanOverlay.pointers.size >= 2 && japanOverlay.pinchStart) {
    const pts = [...japanOverlay.pointers.values()].slice(0, 2);
    const distance = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
    const nextZoom = japanOverlay.pinchStart.zoom * (distance / japanOverlay.pinchStart.distance);

    // Recalculate from the gesture's original pan so zoom stays anchored under the fingers.
    japanOverlay.zoom = japanOverlay.pinchStart.zoom;
    japanOverlay.panX = japanOverlay.pinchStart.panX;
    japanOverlay.panY = japanOverlay.pinchStart.panY;
    setMapZoom(nextZoom, japanOverlay.pinchStart.mid.x, japanOverlay.pinchStart.mid.y);
    japanOverlay.suppressClickUntil = performance.now() + 350;
    return;
  }

  if (japanOverlay.pointers.size === 1 && japanOverlay.dragStart) {
    const rect = mapFrame.getBoundingClientRect();
    const dx = (e.clientX - japanOverlay.dragStart.x) * MAP_SIZE / Math.max(1, rect.width);
    const dy = (e.clientY - japanOverlay.dragStart.y) * MAP_SIZE / Math.max(1, rect.height);
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      japanOverlay.dragStart.moved = true;
      japanOverlay.suppressClickUntil = performance.now() + 300;
    }
    japanOverlay.panX = japanOverlay.dragStart.panX + dx;
    japanOverlay.panY = japanOverlay.dragStart.panY + dy;
    applyMapTransform();
  }
});

function releasePointer(e) {
  if (japanOverlay.pointers.has(e.pointerId)) {
    japanOverlay.pointers.delete(e.pointerId);
    try { mapFrame.releasePointerCapture?.(e.pointerId); } catch (_) {}
  }

  if (japanOverlay.pointers.size >= 2) {
    const pts = [...japanOverlay.pointers.values()].slice(0, 2);
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const mid = clientToSvg((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
    japanOverlay.pinchStart = {
      distance: Math.max(1, Math.hypot(dx, dy)),
      zoom: japanOverlay.zoom,
      panX: japanOverlay.panX,
      panY: japanOverlay.panY,
      mid
    };
    japanOverlay.dragStart = null;
  } else if (japanOverlay.pointers.size === 1) {
    const p = [...japanOverlay.pointers.values()][0];
    japanOverlay.pinchStart = null;
    japanOverlay.dragStart = {
      x: p.x,
      y: p.y,
      panX: japanOverlay.panX,
      panY: japanOverlay.panY,
      moved: true
    };
  } else {
    japanOverlay.pinchStart = null;
    japanOverlay.dragStart = null;
  }

  endGestureLockIfIdle();
}

mapFrame.addEventListener('pointerup', releasePointer);
mapFrame.addEventListener('pointercancel', releasePointer);
mapFrame.addEventListener('lostpointercapture', releasePointer);

// iOS Safari can emit proprietary gesture events even when pointer events are handled.
['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
  mapFrame.addEventListener(type, e => {
    if (!japanOverlay.active) return;
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
});

// Extra containment for older iOS Safari: never let a touchmove inside the frame scroll/zoom the page.
mapFrame.addEventListener('touchmove', e => {
  if (!japanOverlay.active) return;
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

ui.regionSelect.addEventListener('change', () => {
  if (japanOverlay.active) setTimeout(syncOverlaySelection, 0);
});
ui.languageButtons.forEach(button => {
  button.addEventListener('click', () => setTimeout(updateOverlayText, 0));
});

setInterval(() => {
  if (state.country !== japanOverlay.lastCountry) {
    japanOverlay.lastCountry = state.country;
    if (isJapan()) enterJapanOverlay();
    else if (japanOverlay.active) exitJapanOverlay();
  }
}, 80);
