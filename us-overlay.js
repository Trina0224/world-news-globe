// US drill-down: fixed 2D viewport with pan/zoom, while the 3D globe stays alive underneath.
const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json';

const US_FIPS = {
  '01':'Alabama','02':'Alaska','04':'Arizona','05':'Arkansas','06':'California','08':'Colorado','09':'Connecticut','10':'Delaware',
  '12':'Florida','13':'Georgia','15':'Hawaii','16':'Idaho','17':'Illinois','18':'Indiana','19':'Iowa','20':'Kansas','21':'Kentucky',
  '22':'Louisiana','23':'Maine','24':'Maryland','25':'Massachusetts','26':'Michigan','27':'Minnesota','28':'Mississippi','29':'Missouri',
  '30':'Montana','31':'Nebraska','32':'Nevada','33':'New Hampshire','34':'New Jersey','35':'New Mexico','36':'New York','37':'North Carolina',
  '38':'North Dakota','39':'Ohio','40':'Oklahoma','41':'Oregon','42':'Pennsylvania','44':'Rhode Island','45':'South Carolina','46':'South Dakota',
  '47':'Tennessee','48':'Texas','49':'Utah','50':'Vermont','51':'Virginia','53':'Washington','54':'West Virginia','55':'Wisconsin','56':'Wyoming'
};

const usOverlayState = {
  active:false, loaded:false, lastCountry:null, features:[],
  zoom:1, panX:0, panY:0, pointers:new Map(), dragStart:null, pinchStart:null, contentGroup:null
};
const usOverlayEl = document.getElementById('usOverlay');
const usOverlaySvg = document.getElementById('usOverlayMap');
const usMapFrame = usOverlayEl?.querySelector('.us-map-frame');
const usBackWorldBtn = document.getElementById('usBackWorldBtn');
const usOverlayTitle = document.getElementById('usOverlayTitle');
const usZoomInBtn = document.getElementById('usZoomIn');
const usZoomOutBtn = document.getElementById('usZoomOut');
const usZoomResetBtn = document.getElementById('usZoomReset');

function usOverlayText() {
  if (state.lang === 'en') return { title:'United States · 50 States', back:'← World', status:'Pinch or use + / − to zoom · drag to move' };
  if (state.lang === 'ja') return { title:'アメリカ · 50州', back:'← 世界へ', status:'ピンチまたは + / − で拡大 · ドラッグで移動' };
  return { title:'美國 · 50 州', back:'← 返回世界', status:'雙指或 + / − 放大 · 拖曳移動' };
}

function updateUSOverlayText() {
  const s = usOverlayText();
  usOverlayTitle.textContent = s.title;
  usBackWorldBtn.textContent = s.back;
  if (usOverlayState.active) ui.globeHint.textContent = s.status;
}

function usPathData(geometry) {
  const parts = [];
  const drawRing = ring => {
    if (!ring || ring.length < 3) return;
    parts.push(ring.map((p,i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ') + ' Z');
  };
  if (geometry?.type === 'Polygon') geometry.coordinates.forEach(drawRing);
  if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(poly => poly.forEach(drawRing));
  return parts.join(' ');
}

function syncUSSelection() {
  usOverlaySvg.querySelectorAll('.us-state').forEach(group => {
    group.classList.toggle('selected', group.dataset.name === state.region);
  });
}

function chooseUSState(name) {
  state.region = name || '';
  updateRegionControls(false);
  ui.regionSelect.value = state.region;
  ui.locationType.textContent = t('state');
  ui.locationName.textContent = state.region || displayName(state.country);
  syncUSSelection();
  if (typeof fetchNews === 'function') setTimeout(fetchNews, 0);
}

function clampUSZoom(v) {
  return Math.max(1, Math.min(15, v));
}

function applyUSMapTransform() {
  if (!usOverlayState.contentGroup) return;
  const z = usOverlayState.zoom;
  const limitX = 487.5 * (z - 1);
  const limitY = 305 * (z - 1);
  usOverlayState.panX = Math.max(-limitX, Math.min(limitX, usOverlayState.panX));
  usOverlayState.panY = Math.max(-limitY, Math.min(limitY, usOverlayState.panY));
  usOverlayState.contentGroup.setAttribute(
    'transform',
    `translate(${usOverlayState.panX} ${usOverlayState.panY}) translate(487.5 305) scale(${z}) translate(-487.5 -305)`
  );
}

function setUSMapZoom(nextZoom, anchorX = 487.5, anchorY = 305) {
  const oldZoom = usOverlayState.zoom;
  const newZoom = clampUSZoom(nextZoom);
  if (newZoom === oldZoom) return;
  const ratio = newZoom / oldZoom;
  usOverlayState.panX = anchorX - 487.5 - (anchorX - 487.5 - usOverlayState.panX) * ratio;
  usOverlayState.panY = anchorY - 305 - (anchorY - 305 - usOverlayState.panY) * ratio;
  usOverlayState.zoom = newZoom;
  applyUSMapTransform();
}

function resetUSMapView() {
  usOverlayState.zoom = 1;
  usOverlayState.panX = 0;
  usOverlayState.panY = 0;
  usOverlayState.pointers.clear();
  usOverlayState.dragStart = null;
  usOverlayState.pinchStart = null;
  applyUSMapTransform();
}

function clientToUSSvg(clientX, clientY) {
  const rect = usOverlaySvg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * 975,
    y: ((clientY - rect.top) / Math.max(1, rect.height)) * 610
  };
}

function renderUSMap(features) {
  usOverlaySvg.setAttribute('viewBox', '0 0 975 610');
  usOverlaySvg.innerHTML = '';
  const root = document.createElementNS('http://www.w3.org/2000/svg','g');
  usOverlayState.contentGroup = root;
  usOverlaySvg.appendChild(root);

  for (const feature of features) {
    const name = US_FIPS[String(feature.id).padStart(2,'0')];
    if (!name) continue;

    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.classList.add('us-state');
    group.dataset.name = name;
    group.setAttribute('role','button');
    group.setAttribute('aria-label',name);

    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', usPathData(feature.geometry));
    group.appendChild(path);
    group.addEventListener('click', e => {
      if (usOverlayState.dragStart?.moved) return;
      e.stopPropagation();
      chooseUSState(name);
    });
    group.addEventListener('pointerenter', () => { ui.globeStatus.textContent = name; });
    group.addEventListener('pointerleave', () => { ui.globeStatus.textContent = 'United States · 50 states'; });
    root.appendChild(group);

    try {
      const box = path.getBBox();
      if (box.width < 20 || box.height < 20) {
        const hit = document.createElementNS('http://www.w3.org/2000/svg','rect');
        const size = Math.max(24, box.width + 14, box.height + 14);
        hit.setAttribute('x', String(box.x + box.width/2 - size/2));
        hit.setAttribute('y', String(box.y + box.height/2 - size/2));
        hit.setAttribute('width', String(size));
        hit.setAttribute('height', String(size));
        hit.setAttribute('class','us-touch-target');
        hit.addEventListener('click', e => {
          if (usOverlayState.dragStart?.moved) return;
          e.stopPropagation();
          chooseUSState(name);
        });
        group.appendChild(hit);
      }
    } catch (_) {}
  }
  resetUSMapView();
  syncUSSelection();
}

async function ensureUSOverlay() {
  if (usOverlayState.loaded) return true;
  try {
    const r = await fetch(US_ATLAS_URL, { cache:'force-cache' });
    if (!r.ok) throw new Error(`US atlas ${r.status}`);
    const topo = await r.json();
    const collection = topojson.feature(topo, topo.objects.states);
    usOverlayState.features = collection.features.filter(f => US_FIPS[String(f.id).padStart(2,'0')]);
    if (usOverlayState.features.length !== 50) throw new Error(`Expected 50 states, got ${usOverlayState.features.length}`);
    renderUSMap(usOverlayState.features);
    usOverlayState.loaded = true;
    return true;
  } catch (e) {
    console.error('US overlay failed', e);
    ui.globeStatus.textContent = 'US map unavailable';
    return false;
  }
}

async function enterUSOverlay() {
  if (usOverlayState.active) return;
  if (!(await ensureUSOverlay())) return;
  usOverlayState.active = true;
  usOverlayEl.classList.remove('hidden');
  resetUSMapView();
  state.region = '';
  updateRegionControls(true);
  ui.regionSelect.value = '';
  syncUSSelection();
  updateUSOverlayText();
  ui.globeStatus.textContent = 'United States · 50 states';
}

function exitUSOverlay() {
  if (!usOverlayState.active) return;
  usOverlayState.active = false;
  usOverlayEl.classList.add('hidden');
  document.documentElement.classList.remove('map-gesture-lock');
  state.region = '';
  state.country = null;
  refreshPolygonColors();
  updateLabels();
  ui.regionControls.classList.add('hidden');
  setNewsState(t('intro'));
  requestAnimationFrame(() => resizeGlobe());
  ui.globeStatus.textContent = `${state.countries.length} countries`;
}

usZoomInBtn?.addEventListener('click', () => setUSMapZoom(usOverlayState.zoom * 1.5));
usZoomOutBtn?.addEventListener('click', () => setUSMapZoom(usOverlayState.zoom / 1.5));
usZoomResetBtn?.addEventListener('click', resetUSMapView);
usBackWorldBtn.addEventListener('click', exitUSOverlay);

usMapFrame?.addEventListener('wheel', e => {
  if (!usOverlayState.active) return;
  e.preventDefault();
  const p = clientToUSSvg(e.clientX, e.clientY);
  setUSMapZoom(usOverlayState.zoom * (e.deltaY < 0 ? 1.18 : 0.85), p.x, p.y);
}, { passive:false });

usMapFrame?.addEventListener('pointerdown', e => {
  if (!usOverlayState.active) return;
  e.preventDefault();
  document.documentElement.classList.add('map-gesture-lock');
  usOverlaySvg.setPointerCapture?.(e.pointerId);
  usOverlayState.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (usOverlayState.pointers.size === 1) {
    usOverlayState.dragStart = { x:e.clientX, y:e.clientY, panX:usOverlayState.panX, panY:usOverlayState.panY, moved:false };
  } else if (usOverlayState.pointers.size === 2) {
    const pts = [...usOverlayState.pointers.values()];
    const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
    const mid = clientToUSSvg((pts[0].x + pts[1].x)/2, (pts[0].y + pts[1].y)/2);
    usOverlayState.pinchStart = { distance:Math.hypot(dx,dy), zoom:usOverlayState.zoom, mid };
  }
});

usMapFrame?.addEventListener('pointermove', e => {
  if (!usOverlayState.pointers.has(e.pointerId)) return;
  e.preventDefault();
  usOverlayState.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

  if (usOverlayState.pointers.size >= 2 && usOverlayState.pinchStart) {
    const pts = [...usOverlayState.pointers.values()].slice(0,2);
    const distance = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
    const next = usOverlayState.pinchStart.zoom * (distance / Math.max(1, usOverlayState.pinchStart.distance));
    setUSMapZoom(next, usOverlayState.pinchStart.mid.x, usOverlayState.pinchStart.mid.y);
    return;
  }

  if (usOverlayState.pointers.size === 1 && usOverlayState.dragStart) {
    const rect = usOverlaySvg.getBoundingClientRect();
    const dx = (e.clientX - usOverlayState.dragStart.x) * 975 / Math.max(1, rect.width);
    const dy = (e.clientY - usOverlayState.dragStart.y) * 610 / Math.max(1, rect.height);
    if (Math.abs(dx) + Math.abs(dy) > 4) usOverlayState.dragStart.moved = true;
    usOverlayState.panX = usOverlayState.dragStart.panX + dx;
    usOverlayState.panY = usOverlayState.dragStart.panY + dy;
    applyUSMapTransform();
  }
});

function releaseUSPointer(e) {
  usOverlayState.pointers.delete(e.pointerId);
  if (usOverlayState.pointers.size < 2) usOverlayState.pinchStart = null;
  if (usOverlayState.pointers.size === 0) {
    document.documentElement.classList.remove('map-gesture-lock');
    setTimeout(() => { usOverlayState.dragStart = null; }, 0);
  } else {
    const p = [...usOverlayState.pointers.values()][0];
    usOverlayState.dragStart = { x:p.x, y:p.y, panX:usOverlayState.panX, panY:usOverlayState.panY, moved:true };
  }
}
usMapFrame?.addEventListener('pointerup', releaseUSPointer);
usMapFrame?.addEventListener('pointercancel', releaseUSPointer);

['gesturestart','gesturechange','gestureend'].forEach(type => {
  usMapFrame?.addEventListener(type, e => e.preventDefault(), { passive:false });
});
usMapFrame?.addEventListener('touchmove', e => {
  if (usOverlayState.active) e.preventDefault();
}, { passive:false });

ui.regionSelect.addEventListener('change', () => {
  if (usOverlayState.active) {
    ui.locationType.textContent = state.region ? t('state') : t('country');
    ui.locationName.textContent = state.region || displayName(state.country);
    setTimeout(syncUSSelection, 0);
  }
});
ui.languageButtons.forEach(button => button.addEventListener('click', () => setTimeout(updateUSOverlayText, 0)));

setInterval(() => {
  if (state.country !== usOverlayState.lastCountry) {
    usOverlayState.lastCountry = state.country;
    if (isUS()) enterUSOverlay();
    else if (usOverlayState.active) exitUSOverlay();
  }
}, 80);
