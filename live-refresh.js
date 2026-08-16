(() => {
  const ENDPOINT = 'https://world-news-refresh.kozakurayuki.workers.dev/refresh';
  const button = document.getElementById('refreshNowBtn');
  if (!button) return;

  const TEXT = {
    en: { idle:'↻ Refresh this area', busy:'Refreshing…', ok:'Updated just now', fail:'Live refresh failed' },
    'zh-Hant': { idle:'↻ 立即更新此地區', busy:'更新中…', ok:'剛剛更新', fail:'即時更新失敗' },
    ja: { idle:'↻ この地域を更新', busy:'更新中…', ok:'たった今更新', fail:'リアルタイム更新に失敗' }
  };

  function copy() { return TEXT[state.lang] || TEXT.en; }

  function updateVisibility() {
    button.classList.toggle('hidden', !state.country);
    if (!button.disabled) button.textContent = copy().idle;
  }

  function workerRegion() {
    if (!state.region) return '';
    if (isJapan()) {
      const pair = JP_PREFECTURES.find(([, value]) => value === state.region);
      return pair?.[0] || state.region;
    }
    return state.region;
  }

  async function refreshNow() {
    if (!state.country || button.disabled) return;
    const c = copy();
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = c.busy;

    const countryRaw = rawName(state.country);
    const country = countryRaw === 'United States of America' ? 'United States' : countryRaw;
    const region = workerRegion();
    const previousStatus = ui.globeStatus.textContent;
    ui.globeStatus.textContent = c.busy;

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, region })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (!Array.isArray(data.articles) || !data.articles.length) throw new Error('No live headlines returned');

      renderStaticNews(data.articles);
      ui.newsWindow.textContent = c.ok;
      ui.globeStatus.textContent = `${c.ok} · ${data.article_count || data.articles.length} headlines`;
      button.classList.add('success');
      setTimeout(() => button.classList.remove('success'), 1200);
    } catch (error) {
      console.error('Live refresh failed', error);
      ui.globeStatus.textContent = c.fail;
      button.classList.add('error');
      setTimeout(() => {
        button.classList.remove('error');
        if (ui.globeStatus.textContent === c.fail) ui.globeStatus.textContent = previousStatus;
      }, 2500);
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
      button.textContent = copy().idle;
    }
  }

  button.addEventListener('click', refreshNow);
  ui.languageButtons.forEach(b => b.addEventListener('click', () => setTimeout(updateVisibility, 0)));
  ui.regionSelect.addEventListener('change', () => setTimeout(updateVisibility, 0));

  setInterval(updateVisibility, 250);
  updateVisibility();
})();
