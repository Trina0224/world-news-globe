// Japan drill-down layer: click prefectures directly on the globe while keeping the dropdown in sync.
const JAPAN_PREF_MAP = 'data/maps/japan-prefectures.geojson';
const japanMapState = { features: null, active: false, installing: false };

async function loadJapanPrefectures() {
  if (japanMapState.features) return japanMapState.features;
  const r = await fetch(`${JAPAN_PREF_MAP}?v=1`, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`Japan map ${r.status}`);
  const data = await r.json();
  japanMapState.features = Array.isArray(data.features) ? data.features : [];
  return japanMapState.features;
}

function styleJapanLayer() {
  if (!state.globe) return;
  state.globe
    .polygonAltitude(d => d.properties?.value === state.region ? 0.006 : 0.002)
    .polygonCapColor(d => d.properties?.value === state.region ? 'rgba(111,211,255,0.72)' : 'rgba(72,109,132,0.24)')
    .polygonSideColor(() => 'rgba(18,34,48,0.12)')
    .polygonStrokeColor(() => 'rgba(220,235,245,0.72)')
    .polygonLabel(d => `<div style="padding:6px 8px;font:12px -apple-system,sans-serif"><b>${d.properties?.label || ''}</b></div>`);
}

function styleWorldLayer() {
  if (!state.globe) return;
  state.globe
    .polygonAltitude(0.0015)
    .polygonCapColor(d => d === state.country ? 'rgba(111,211,255,0.62)' : 'rgba(64,95,118,0.16)')
    .polygonSideColor(() => 'rgba(16,30,44,0.10)')
    .polygonStrokeColor(() => 'rgba(205,226,240,0.42)')
    .polygonLabel(d => `<div style="padding:6px 8px;font:12px -apple-system,sans-serif"><b>${displayName(d)}</b></div>`);
}

function clearWorldSelectionHighlight() {
  if (!state.globe) return;
  state.globe
    .polygonAltitude(0.0015)
    .polygonCapColor(() => 'rgba(64,95,118,0.16)')
    .polygonSideColor(() => 'rgba(16,30,44,0.10)')
    .polygonStrokeColor(() => 'rgba(205,226,240,0.42)');
}

async function enterJapanMap() {
  if (!state.globe || japanMapState.installing) return;
  japanMapState.installing = true;

  // As soon as we enter the Japan drill-down, the whole-country selection
  // highlight is no longer useful. Clear it before loading/zooming so Japan
  // does not stay filled while the prefecture layer is being prepared.
  clearWorldSelectionHighlight();
  state.globe.pointOfView({ lat: 36.2, lng: 138.2, altitude: 0.72 }, 650);

  try {
    const features = await loadJapanPrefectures();
    if (!features.length) throw new Error('No prefecture geometry');
    japanMapState.active = true;
    state.globe.polygonsData(features);
    styleJapanLayer();
    state.globe.onPolygonClick(feature => {
      if (performance.now() < state.ignoreClickUntil) return;
      if (feature?.properties?.kind !== 'prefecture') return;
      state.region = feature.properties.value || '';
      updateRegionControls(false);
      ui.regionSelect.value = state.region;
      styleJapanLayer();
      if (typeof fetchNews === 'function') setTimeout(fetchNews, 0);
    });
    ui.globeStatus.textContent = 'Japan · 47 prefectures';
  } catch (e) {
    console.error('Japan prefecture map failed', e);
    // If the prefecture layer fails to load, restore the normal world style.
    styleWorldLayer();
  } finally {
    japanMapState.installing = false;
  }
}

function exitJapanMap() {
  if (!japanMapState.active || !state.globe) return;
  japanMapState.active = false;
  state.globe.polygonsData(state.countries);
  styleWorldLayer();
  state.globe.onPolygonClick(feature => {
    if (performance.now() < state.ignoreClickUntil) return;
    selectCountry(feature);
    if (isJapan()) setTimeout(enterJapanMap, 0);
  });
  ui.globeStatus.textContent = `${state.countries.length} countries`;
}

function installJapanMapMode() {
  if (!state.globe) return false;
  state.globe.onPolygonClick(feature => {
    if (performance.now() < state.ignoreClickUntil) return;
    selectCountry(feature);
    if (isJapan()) setTimeout(enterJapanMap, 0);
    else exitJapanMap();
  });

  ui.regionSelect.addEventListener('change', () => {
    if (isJapan() && !japanMapState.active) setTimeout(enterJapanMap, 0);
    if (japanMapState.active) setTimeout(styleJapanLayer, 0);
  });

  const controls = state.globe.controls();
  controls.addEventListener('change', () => {
    if (!japanMapState.active) return;
    let pov = null;
    try { pov = state.globe.pointOfView(); } catch (_) {}
    if (pov && pov.altitude > 1.35) exitJapanMap();
  });
  return true;
}

(function waitForGlobe() {
  if (installJapanMapMode()) return;
  setTimeout(waitForGlobe, 120);
})();
