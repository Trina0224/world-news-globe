// US drill-down: keep the 3D globe alive and cover it with a fixed 2D 50-state map.
const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-albers-10m.json';

const US_FIPS = {
  '01':'Alabama','02':'Alaska','04':'Arizona','05':'Arkansas','06':'California','08':'Colorado','09':'Connecticut','10':'Delaware',
  '12':'Florida','13':'Georgia','15':'Hawaii','16':'Idaho','17':'Illinois','18':'Indiana','19':'Iowa','20':'Kansas','21':'Kentucky',
  '22':'Louisiana','23':'Maine','24':'Maryland','25':'Massachusetts','26':'Michigan','27':'Minnesota','28':'Mississippi','29':'Missouri',
  '30':'Montana','31':'Nebraska','32':'Nevada','33':'New Hampshire','34':'New Jersey','35':'New Mexico','36':'New York','37':'North Carolina',
  '38':'North Dakota','39':'Ohio','40':'Oklahoma','41':'Oregon','42':'Pennsylvania','44':'Rhode Island','45':'South Carolina','46':'South Dakota',
  '47':'Tennessee','48':'Texas','49':'Utah','50':'Vermont','51':'Virginia','53':'Washington','54':'West Virginia','55':'Wisconsin','56':'Wyoming'
};

const usOverlayState = { active:false, loaded:false, lastCountry:null, features:[] };
const usOverlayEl = document.getElementById('usOverlay');
const usOverlaySvg = document.getElementById('usOverlayMap');
const usBackWorldBtn = document.getElementById('usBackWorldBtn');
const usOverlayTitle = document.getElementById('usOverlayTitle');

function usOverlayText() {
  if (state.lang === 'en') return { title:'United States · 50 States', back:'← World', status:'Tap a state' };
  if (state.lang === 'ja') return { title:'アメリカ · 50州', back:'← 世界へ', status:'州をタップ' };
  return { title:'美國 · 50 州', back:'← 返回世界', status:'直接點選州' };
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

function renderUSMap(features) {
  usOverlaySvg.setAttribute('viewBox', '0 0 975 610');
  usOverlaySvg.innerHTML = '';
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
    group.addEventListener('click', () => chooseUSState(name));
    group.addEventListener('pointerenter', () => { ui.globeStatus.textContent = name; });
    group.addEventListener('pointerleave', () => { ui.globeStatus.textContent = 'United States · 50 states'; });
    usOverlaySvg.appendChild(group);

    // Tiny Northeast states get a larger invisible touch target without changing their visible geometry.
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
        hit.addEventListener('click', e => { e.stopPropagation(); chooseUSState(name); });
        group.appendChild(hit);
      }
    } catch (_) {}
  }
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
  state.region = '';
  state.country = null;
  refreshPolygonColors();
  updateLabels();
  ui.regionControls.classList.add('hidden');
  setNewsState(t('intro'));
  requestAnimationFrame(() => resizeGlobe());
  ui.globeStatus.textContent = `${state.countries.length} countries`;
}

usBackWorldBtn.addEventListener('click', exitUSOverlay);
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
