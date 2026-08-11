// Stable hybrid mode: keep the 3D globe alive underneath a separate 2D SVG Japan map.
const JAPAN_OVERLAY_MAP = 'data/maps/japan-prefectures.geojson';
const japanOverlay = {
  active: false,
  lastCountry: null,
  loaded: false,
  features: []
};

const overlayEl = document.getElementById('japanOverlay');
const overlaySvg = document.getElementById('japanOverlayMap');
const backWorldBtn = document.getElementById('backWorldBtn');
const overlayTitle = document.getElementById('japanOverlayTitle');

const JP_FILL = 'rgba(55, 96, 122, 0.82)';
const JP_STROKE = 'rgba(222, 238, 248, 0.92)';
const JP_SELECTED = 'rgba(111, 211, 255, 0.95)';
const JP_SELECTED_STROKE = 'rgba(255,255,255,1)';

function overlayText() {
  if (state.lang === 'en') return { title: 'Japan · 47 Prefectures', back: '← World', status: 'Tap a prefecture' };
  if (state.lang === 'ja') return { title: '日本 · 47都道府県', back: '← 世界へ', status: '都道府県をタップ' };
  return { title: '日本 · 47 都道府縣', back: '← 返回世界', status: '直接點選都道府縣' };
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

function renderJapanOverlay(features) {
  const pts = [];
  for (const f of features) for (const ring of geometryRings(f.geometry)) for (const p of ring) pts.push(p);
  if (!pts.length) return;

  const lons = pts.map(p => p[0]);
  const lats = pts.map(p => p[1]);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const W = 900, H = 900, pad = 54;
  const scale = Math.min((W - pad * 2) / (maxLon - minLon), (H - pad * 2) / (maxLat - minLat));
  const x0 = (W - (maxLon - minLon) * scale) / 2;
  const y0 = (H - (maxLat - minLat) * scale) / 2;
  const project = p => [x0 + (p[0] - minLon) * scale, H - (y0 + (p[1] - minLat) * scale)];

  overlaySvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  overlaySvg.innerHTML = '';

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
    group.addEventListener('click', () => choosePrefecture(f.properties.value));
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
    overlaySvg.appendChild(group);
  }
  syncOverlaySelection();
}

async function ensureJapanOverlay() {
  if (japanOverlay.loaded) return true;
  try {
    const r = await fetch(`${JAPAN_OVERLAY_MAP}?v=4`, { cache: 'force-cache' });
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
  // Keep WebGL alive underneath. Do NOT hide or pause the globe on Safari/iPad.
  overlayEl.classList.remove('hidden');
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
  state.region = '';
  state.country = null;
  refreshPolygonColors();
  updateLabels();
  ui.regionControls.classList.add('hidden');
  setNewsState(t('intro'));
  // Globe was never hidden, but force its canvas sizing once after the overlay disappears.
  requestAnimationFrame(() => {
    resizeGlobe();
    try { state.globe?.renderer?.().render?.(state.globe.scene(), state.globe.camera()); } catch (_) {}
  });
  ui.globeStatus.textContent = `${state.countries.length} countries`;
}

backWorldBtn.addEventListener('click', exitJapanOverlay);
ui.regionSelect.addEventListener('change', () => {
  if (japanOverlay.active) setTimeout(syncOverlaySelection, 0);
});

ui.languageButtons.forEach(button => {
  button.addEventListener('click', () => setTimeout(updateOverlayText, 0));
});

// Watch the existing globe selection without ever replacing globe.gl polygons.
setInterval(() => {
  if (state.country !== japanOverlay.lastCountry) {
    japanOverlay.lastCountry = state.country;
    if (isJapan()) enterJapanOverlay();
    else if (japanOverlay.active) exitJapanOverlay();
  }
}, 80);
