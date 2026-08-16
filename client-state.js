(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err)));
  }

  const params = new URLSearchParams(location.search);
  const navEntry = performance.getEntriesByType?.('navigation')?.[0];
  const isReload = navEntry?.type === 'reload' || performance.navigation?.type === 1;
  const requestedCountry = params.get('country');
  const requestedRegion = params.get('region');
  const requestedLang = params.get('lang');
  const requestedKeyword = isReload ? '' : String(params.get('keyword') || '').trim().slice(0, 80);

  window.initialWorldNewsKeyword = requestedKeyword;
  window.worldNewsKeyword = requestedKeyword;

  if (isReload && params.has('keyword')) {
    const clean = new URL(location.href);
    clean.searchParams.delete('keyword');
    history.replaceState(null, '', clean);
  }

  let restoring = Boolean(requestedCountry || requestedRegion || requestedLang);
  let lastKey = '';

  function canonicalCountry(name) {
    if (!name) return '';
    if (name === 'United States') return 'United States of America';
    return name;
  }

  function applyLanguage(lang) {
    if (!lang || !['zh-Hant', 'en', 'ja'].includes(lang)) return;
    state.lang = lang;
    ui.languageButtons.forEach(button => button.classList.toggle('active', button.dataset.lang === lang));
    document.documentElement.lang = lang;
    if (typeof refreshLanguageUI === 'function') refreshLanguageUI();
    else updateLabels();
  }

  function setRegionWhenReady(region) {
    if (!region) return;
    const deadline = performance.now() + 5000;
    const tick = () => {
      if (isJapan() && typeof choosePrefecture === 'function' && japanOverlay?.active) {
        const valid = JP_PREFECTURES.some(([, value]) => value === region);
        if (valid) choosePrefecture(region);
        return;
      }
      if (isUS() && typeof chooseUSState === 'function' && usOverlayState?.active) {
        if (US_STATES.includes(region)) chooseUSState(region);
        return;
      }
      if (performance.now() < deadline) setTimeout(tick, 80);
    };
    tick();
  }

  function restoreFromUrl() {
    applyLanguage(requestedLang);
    if (!requestedCountry) {
      restoring = false;
      return;
    }
    const wanted = canonicalCountry(requestedCountry);
    const deadline = performance.now() + 10000;
    const tick = () => {
      const feature = state.countries.find(f => canonicalCountry(rawName(f)) === wanted);
      if (feature) {
        selectCountry(feature);
        setRegionWhenReady(requestedRegion);
        setTimeout(() => { restoring = false; syncUrl(true); }, 500);
        return;
      }
      if (performance.now() < deadline) setTimeout(tick, 100);
      else restoring = false;
    };
    tick();
  }

  function syncUrl(force = false) {
    if (restoring && !force) return;
    const next = new URL(location.href);
    next.search = '';
    const name = rawName(state.country);
    if (name) next.searchParams.set('country', name === 'United States of America' ? 'United States' : name);
    if (state.region) next.searchParams.set('region', state.region);
    if (state.lang !== 'en') next.searchParams.set('lang', state.lang);
    const keyword = String(window.worldNewsKeyword || '').trim().slice(0, 80);
    if (keyword) next.searchParams.set('keyword', keyword);
    const key = next.pathname + next.search;
    if (key === lastKey && !force) return;
    lastKey = key;
    history.replaceState(null, '', next);
  }

  window.syncWorldNewsUrl = syncUrl;
  restoreFromUrl();
  setInterval(syncUrl, 180);
})();
