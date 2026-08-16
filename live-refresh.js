(() => {
  const REFRESH_ENDPOINT = 'https://world-news-refresh.kozakurayuki.workers.dev/refresh';
  const TRANSLATE_ENDPOINT = 'https://world-news-refresh.kozakurayuki.workers.dev/translate';
  const button = document.getElementById('refreshNowBtn');
  const translateButton = document.getElementById('translateHeadlinesBtn');
  if (!button || !translateButton) return;

  const TEXT = {
    en: {
      idle:'↻ Refresh this area', busy:'Refreshing…', ok:'Updated just now', fail:'Live refresh failed',
      translate:'Translate headlines', translating:'Translating…', original:'Show original',
      translateFail:'Translation unavailable', quota:'Free translation quota reached'
    },
    'zh-Hant': {
      idle:'↻ 立即更新此地區', busy:'更新中…', ok:'剛剛更新', fail:'即時更新失敗',
      translate:'翻譯新聞標題', translating:'翻譯中…', original:'顯示原文',
      translateFail:'目前無法翻譯', quota:'今日免費翻譯額度已用完'
    },
    ja: {
      idle:'↻ この地域を更新', busy:'更新中…', ok:'たった今更新', fail:'リアルタイム更新に失敗',
      translate:'見出しを翻訳', translating:'翻訳中…', original:'原文を表示',
      translateFail:'翻訳を利用できません', quota:'本日の無料翻訳枠を使い切りました'
    }
  };

  const KNOWN_LANGUAGES = new Set([
    'English','Japanese','Traditional Chinese','Simplified Chinese','Korean','French','German','Italian','Spanish',
    'Portuguese','Dutch','Swedish','Norwegian','Danish','Finnish','Polish','Czech','Greek','Turkish','Hebrew','Arabic',
    'Indonesian','Thai','Vietnamese'
  ]);

  const toTaiwanTraditional = window.OpenCC?.Converter
    ? window.OpenCC.Converter({ from:'cn', to:'twp' })
    : null;

  let translated = false;
  let translationBusy = false;

  function copy() { return TEXT[state.lang] || TEXT.en; }

  function resetTranslation() {
    ui.newsList.querySelectorAll('.news-title').forEach(link => {
      if (link.dataset.originalTitle) {
        link.textContent = link.dataset.originalTitle;
        delete link.dataset.originalTitle;
      }
    });
    ui.newsList.querySelectorAll('.news-original').forEach(el => el.remove());
    translated = false;
    if (!translationBusy) translateButton.textContent = copy().translate;
  }

  function updateVisibility() {
    button.classList.toggle('hidden', !state.country);
    if (!button.disabled) button.textContent = copy().idle;

    const hasNews = Boolean(state.country && ui.newsList.querySelector('.news-item'));
    translateButton.classList.toggle('hidden', !hasNews);
    if (!translationBusy) translateButton.textContent = translated ? copy().original : copy().translate;
  }

  function workerRegion() {
    if (!state.region) return '';
    if (isJapan()) {
      const pair = JP_PREFECTURES.find(([, value]) => value === state.region);
      return pair?.[0] || state.region;
    }
    return state.region;
  }

  function visibleHeadlineItems() {
    return [...ui.newsList.querySelectorAll('.news-item')].slice(0, 10).map(item => {
      const link = item.querySelector('.news-title');
      const language = [...item.querySelectorAll('.news-meta span')]
        .map(el => el.textContent.trim())
        .find(value => KNOWN_LANGUAGES.has(value)) || 'English';
      return { text: link?.dataset.originalTitle || link?.textContent || '', language };
    }).filter(item => item.text);
  }

  function normalizeTranslation(text) {
    const translatedTitle = String(text || '').trim();
    if (!translatedTitle) return '';
    if (state.lang !== 'zh-Hant') return translatedTitle;
    if (!toTaiwanTraditional) throw new Error('OpenCC is unavailable');
    return toTaiwanTraditional(translatedTitle).trim();
  }

  async function refreshNow() {
    if (!state.country || button.disabled) return;
    resetTranslation();
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
      const response = await fetch(REFRESH_ENDPOINT, {
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
      updateVisibility();
    }
  }

  async function toggleTranslation() {
    if (translationBusy) return;
    if (translated) {
      resetTranslation();
      updateVisibility();
      return;
    }

    const items = visibleHeadlineItems();
    if (!items.length) return;

    const c = copy();
    translationBusy = true;
    translateButton.disabled = true;
    translateButton.classList.add('loading');
    translateButton.textContent = c.translating;
    const previousStatus = ui.globeStatus.textContent;
    ui.globeStatus.textContent = c.translating;

    try {
      if (state.lang === 'zh-Hant' && !toTaiwanTraditional) {
        throw new Error('OpenCC is unavailable');
      }

      const response = await fetch(TRANSLATE_ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ target:state.lang, items })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !Array.isArray(data.translations)) {
        const err = new Error(data.error || `HTTP ${response.status}`);
        err.quota = Boolean(data.quota || response.status === 429);
        throw err;
      }

      const normalized = data.translations.map(normalizeTranslation);
      const links = [...ui.newsList.querySelectorAll('.news-title')].slice(0, normalized.length);
      links.forEach((link, index) => {
        const original = link.textContent.trim();
        const translatedTitle = normalized[index];
        if (!translatedTitle || translatedTitle === original) return;
        link.dataset.originalTitle = original;
        link.textContent = translatedTitle;

        const originalLine = document.createElement('div');
        originalLine.className = 'news-original';
        originalLine.textContent = original;
        originalLine.style.cssText = 'margin-top:6px;color:var(--muted);font-size:12px;line-height:1.4;font-weight:400;';
        link.insertAdjacentElement('afterend', originalLine);
      });

      translated = true;
      ui.globeStatus.textContent = state.lang === 'zh-Hant'
        ? `${normalized.length} headlines translated · Taiwan Traditional`
        : `${normalized.length} headlines translated`;
    } catch (error) {
      console.error('Headline translation failed', error);
      ui.globeStatus.textContent = error.quota ? c.quota : c.translateFail;
      setTimeout(() => {
        if ([c.quota, c.translateFail].includes(ui.globeStatus.textContent)) ui.globeStatus.textContent = previousStatus;
      }, 3000);
    } finally {
      translationBusy = false;
      translateButton.disabled = false;
      translateButton.classList.remove('loading');
      updateVisibility();
    }
  }

  button.addEventListener('click', refreshNow);
  translateButton.addEventListener('click', toggleTranslation);

  ui.languageButtons.forEach(b => b.addEventListener('click', () => {
    resetTranslation();
    setTimeout(updateVisibility, 0);
  }));
  ui.regionSelect.addEventListener('change', () => {
    resetTranslation();
    setTimeout(updateVisibility, 0);
  });

  new MutationObserver(() => {
    if (!translationBusy) resetTranslation();
    updateVisibility();
  }).observe(ui.newsList, { childList:true });

  setInterval(updateVisibility, 250);
  updateVisibility();
})();
