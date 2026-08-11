const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json';
const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

const state = {
  lang: 'zh-Hant',
  country: null,
  region: '',
  countries: [],
  globe: null,
};

const ui = {
  globe: document.getElementById('globe'),
  globeWrap: document.getElementById('globe-wrap'),
  globeStatus: document.getElementById('globeStatus'),
  globeHint: document.getElementById('globeHint'),
  locationType: document.getElementById('locationType'),
  locationName: document.getElementById('locationName'),
  localTime: document.getElementById('localTime'),
  newsWindow: document.getElementById('newsWindow'),
  regionControls: document.getElementById('regionControls'),
  regionLabel: document.getElementById('regionLabel'),
  regionSelect: document.getElementById('regionSelect'),
  headlineLabel: document.getElementById('headlineLabel'),
  refreshBtn: document.getElementById('refreshBtn'),
  newsState: document.getElementById('newsState'),
  emptyMessage: document.getElementById('emptyMessage'),
  newsList: document.getElementById('newsList'),
  sourceNote: document.getElementById('sourceNote'),
  languageButtons: [...document.querySelectorAll('[data-lang]')],
};

const strings = {
  'zh-Hant': {
    choose: '選一個國家',
    hint: '拖曳旋轉 · 滾輪縮放 · 點擊國家',
    world: '世界',
    country: '國家',
    state: '州',
    prefecture: '都道府縣',
    region: '地區',
    all: '全部',
    headlines: '今日新聞',
    window: '最近 24 小時',
    intro: '轉動地球，點一個國家看看今天發生什麼。',
    loading: '正在整理當地最新新聞…',
    none: '暫時找不到足夠的近期新聞。可以稍後重新整理。',
    error: '新聞來源暫時無法連線。',
    source: '新聞來源：GDELT。標題保留原文。',
    live: '即時',
  },
  en: {
    choose: 'Choose a country',
    hint: 'Drag to rotate · Scroll to zoom · Click a country',
    world: 'WORLD',
    country: 'COUNTRY',
    state: 'STATE',
    prefecture: 'PREFECTURE',
    region: 'Region',
    all: 'All',
    headlines: "Today's news",
    window: 'Last 24 hours',
    intro: 'Spin the globe and choose a country to see what is happening today.',
    loading: 'Finding the latest local news…',
    none: 'Not enough recent stories were found. Try refreshing later.',
    error: 'The news source is temporarily unavailable.',
    source: 'News source: GDELT. Headlines remain in their original language.',
    live: 'Live',
  },
  ja: {
    choose: '国を選択',
    hint: 'ドラッグで回転 · スクロールで拡大 · 国をクリック',
    world: '世界',
    country: '国',
    state: '州',
    prefecture: '都道府県',
    region: '地域',
    all: '全国',
    headlines: '今日のニュース',
    window: '過去24時間',
    intro: '地球を回して国を選ぶと、今日のニュースを確認できます。',
    loading: '最新の現地ニュースを取得中…',
    none: '十分な最新記事が見つかりませんでした。後でもう一度お試しください。',
    error: 'ニュースソースに一時的に接続できません。',
    source: 'ニュース提供：GDELT。見出しは原文のまま表示します。',
    live: 'ライブ',
  },
};

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia',
  'Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts',
  'Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico',
  'New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina',
  'South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'
];

const JP_PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
  '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
  '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
];

const GDELT_CODES = {
  'United States of America': 'US', 'United States': 'US', Japan: 'JA', Taiwan: 'TW', China: 'CH',
  'United Kingdom': 'UK', France: 'FR', Germany: 'GM', Canada: 'CA', Australia: 'AS', India: 'IN',
  'South Korea': 'KS', 'Republic of Korea': 'KS', Singapore: 'SN', Italy: 'IT', Spain: 'SP', Brazil: 'BR',
  Mexico: 'MX', Netherlands: 'NL', Sweden: 'SW', Switzerland: 'SZ', Ukraine: 'UP', Israel: 'IS'
};

const TIMEZONES = {
  US: 'America/New_York', JA: 'Asia/Tokyo', TW: 'Asia/Taipei', CH: 'Asia/Shanghai', UK: 'Europe/London',
  FR: 'Europe/Paris', GM: 'Europe/Berlin', CA: 'America/Toronto', AS: 'Australia/Sydney', IN: 'Asia/Kolkata',
  KS: 'Asia/Seoul', SN: 'Asia/Singapore', IT: 'Europe/Rome', SP: 'Europe/Madrid', BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City', NL: 'Europe/Amsterdam', SW: 'Europe/Stockholm', SZ: 'Europe/Zurich',
  UP: 'Europe/Kyiv', IS: 'Asia/Jerusalem'
};

function t(key) { return strings[state.lang][key]; }

function countryDisplayName(feature) {
  const raw = feature?.properties?.name || 'Unknown';
  const iso2 = feature?.properties?.iso_a2;
  try {
    if (iso2 && iso2 !== '-99') return new Intl.DisplayNames([state.lang], { type: 'region' }).of(iso2);
  } catch (_) {}
  return raw;
}

function getRawCountryName(feature) {
  return feature?.properties?.name || '';
}

function getCountryCode(feature) {
  const iso2 = feature?.properties?.iso_a2;
  if (iso2 && iso2 !== '-99') return iso2;
  return GDELT_CODES[getRawCountryName(feature)] || '';
}

function formatLocalTime(feature) {
  const code = getCountryCode(feature);
  const tz = TIMEZONES[code];
  if (!tz) return '—';
  try {
    return new Intl.DateTimeFormat(state.lang, { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date());
  } catch (_) { return '—'; }
}

function updateLabels() {
  ui.globeHint.textContent = t('hint');
  ui.newsWindow.textContent = t('window');
  ui.regionLabel.textContent = t('region');
  ui.headlineLabel.textContent = t('headlines');
  ui.sourceNote.textContent = t('source');

  if (!state.country) {
    ui.locationType.textContent = t('world');
    ui.locationName.textContent = t('choose');
    ui.emptyMessage.textContent = t('intro');
  } else {
    ui.locationName.textContent = countryDisplayName(state.country);
    updateRegionControls(false);
  }
}

function updateRegionControls(reset = true) {
  if (!state.country) return;
  const code = getCountryCode(state.country);
  let regions = null;
  let type = t('country');

  if (code === 'US') { regions = US_STATES; type = state.region ? t('state') : t('country'); }
  if (code === 'JP' || code === 'JA') { regions = JP_PREFECTURES; type = state.region ? t('prefecture') : t('country'); }

  ui.locationType.textContent = type;

  if (!regions) {
    ui.regionControls.classList.add('hidden');
    if (reset) state.region = '';
    return;
  }

  ui.regionControls.classList.remove('hidden');
  if (reset) state.region = '';
  const current = state.region;
  ui.regionSelect.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('all');
  ui.regionSelect.appendChild(all);
  regions.forEach(region => {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    ui.regionSelect.appendChild(option);
  });
  ui.regionSelect.value = current;
}

function setNewsState(message, mode = 'idle') {
  ui.newsList.innerHTML = '';
  ui.newsState.classList.remove('hidden', 'loading');
  if (mode === 'loading') ui.newsState.classList.add('loading');
  ui.emptyMessage.textContent = message;
}

function articleDate(article) {
  const value = article.seendate || article.date || '';
  if (!value) return '';
  const normalized = /^\d{8}T\d{6}Z$/.test(value)
    ? `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(9,11)}:${value.slice(11,13)}:${value.slice(13,15)}Z`
    : value;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.RelativeTimeFormat(state.lang, { numeric: 'auto' }).format(
    -Math.max(1, Math.round((Date.now() - d.getTime()) / 3600000)), 'hour'
  );
}

function renderNews(articles) {
  ui.newsState.classList.add('hidden');
  ui.newsList.innerHTML = '';

  const seen = new Set();
  const unique = articles.filter(a => {
    const key = (a.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  if (!unique.length) {
    setNewsState(t('none'));
    return;
  }

  unique.forEach((article, index) => {
    const li = document.createElement('li');
    li.className = 'news-item';

    const number = document.createElement('span');
    number.className = 'news-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const body = document.createElement('div');
    body.className = 'news-body';

    const link = document.createElement('a');
    link.className = 'news-title';
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = article.title;

    const meta = document.createElement('div');
    meta.className = 'news-meta';

    const source = document.createElement('span');
    source.className = 'badge';
    source.textContent = article.domain || article.sourcecountry || t('live');
    meta.appendChild(source);

    const when = articleDate(article);
    if (when) {
      const time = document.createElement('span');
      time.textContent = when;
      meta.appendChild(time);
    }

    if (article.language) {
      const language = document.createElement('span');
      language.textContent = article.language;
      meta.appendChild(language);
    }

    body.append(link, meta);
    li.append(number, body);
    ui.newsList.appendChild(li);
  });
}

async function fetchNews() {
  if (!state.country) return;
  setNewsState(t('loading'), 'loading');

  const rawCountry = getRawCountryName(state.country);
  const code = getCountryCode(state.country);
  const countryTerm = code ? `sourcecountry:${code}` : `\"${rawCountry}\"`;
  const regionTerm = state.region ? ` \"${state.region}\"` : '';
  const query = `${countryTerm}${regionTerm}`;

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: '50',
    format: 'json',
    sort: 'HybridRel',
    timespan: '24h'
  });

  try {
    const response = await fetch(`${GDELT_URL}?${params}`);
    if (!response.ok) throw new Error(`GDELT ${response.status}`);
    const data = await response.json();
    let articles = Array.isArray(data.articles) ? data.articles : [];

    // Regional queries can be sparse. Fall back to country news rather than showing a dead end.
    if (!articles.length && state.region) {
      const fallback = new URLSearchParams({
        query: countryTerm,
        mode: 'ArtList',
        maxrecords: '30',
        format: 'json',
        sort: 'HybridRel',
        timespan: '24h'
      });
      const fallbackResponse = await fetch(`${GDELT_URL}?${fallback}`);
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        articles = Array.isArray(fallbackData.articles) ? fallbackData.articles : [];
      }
    }

    renderNews(articles);
  } catch (error) {
    console.error(error);
    setNewsState(t('error'));
  }
}

function selectCountry(feature) {
  state.country = feature;
  state.region = '';
  ui.locationName.textContent = countryDisplayName(feature);
  ui.localTime.textContent = formatLocalTime(feature);
  updateRegionControls(true);
  state.globe.polygonCapColor(d => d === feature ? 'rgba(111,211,255,0.45)' : 'rgba(80,104,126,0.18)');
  fetchNews();
}

async function initGlobe() {
  try {
    const response = await fetch(GEOJSON_URL);
    const geo = await response.json();
    state.countries = geo.features.filter(f => f.properties?.name !== 'Antarctica');

    state.globe = Globe()(ui.globe)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#6fd3ff')
      .atmosphereAltitude(0.12)
      .polygonsData(state.countries)
      .polygonAltitude(d => d === state.country ? 0.018 : 0.006)
      .polygonCapColor(d => d === state.country ? 'rgba(111,211,255,0.45)' : 'rgba(80,104,126,0.18)')
      .polygonSideColor(() => 'rgba(30,46,62,0.25)')
      .polygonStrokeColor(() => 'rgba(188,215,232,0.48)')
      .polygonLabel(d => `<div style="padding:6px 8px;font:12px -apple-system,sans-serif"><b>${countryDisplayName(d)}</b></div>`)
      .onPolygonHover(d => {
        ui.globe.style.cursor = d ? 'pointer' : 'grab';
        state.globe.polygonAltitude(p => p === d || p === state.country ? 0.018 : 0.006);
      })
      .onPolygonClick(selectCountry);

    state.globe.controls().autoRotate = true;
    state.globe.controls().autoRotateSpeed = 0.28;
    state.globe.controls().enableDamping = true;
    state.globe.pointOfView({ lat: 25, lng: 135, altitude: 2.05 }, 0);

    const stopRotate = () => { state.globe.controls().autoRotate = false; };
    ui.globe.addEventListener('pointerdown', stopRotate, { once: true });
    ui.globe.addEventListener('wheel', stopRotate, { once: true, passive: true });

    resizeGlobe();
    ui.globeStatus.textContent = `${state.countries.length} countries`;
  } catch (error) {
    console.error(error);
    ui.globeStatus.textContent = 'Map unavailable';
  }
}

function resizeGlobe() {
  if (!state.globe) return;
  state.globe.width(ui.globeWrap.clientWidth);
  state.globe.height(ui.globeWrap.clientHeight);
}

ui.regionSelect.addEventListener('change', () => {
  state.region = ui.regionSelect.value;
  updateRegionControls(false);
  fetchNews();
});

ui.refreshBtn.addEventListener('click', fetchNews);
window.addEventListener('resize', resizeGlobe);

ui.languageButtons.forEach(button => {
  button.addEventListener('click', () => {
    state.lang = button.dataset.lang;
    ui.languageButtons.forEach(b => b.classList.toggle('active', b === button));
    document.documentElement.lang = state.lang;
    updateLabels();
    if (state.country) {
      ui.locationName.textContent = countryDisplayName(state.country);
      ui.localTime.textContent = formatLocalTime(state.country);
      if (ui.newsList.children.length) fetchNews();
    }
  });
});

updateLabels();
initGlobe();
