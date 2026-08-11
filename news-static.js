// Static-news adapter: keeps the globe independent from external news APIs.
// The Pages workflow generates data/countries/jp.json before deployment.

strings['zh-Hant'].loading = '正在讀取最新日本新聞…';
strings['zh-Hant'].none = '目前這個地區還沒有建立新聞來源。先試日本。';
strings['zh-Hant'].error = '新聞快取還沒準備好，等 GitHub Pages 更新後再試一次。';
strings['zh-Hant'].source = '新聞來源：Google News RSS；由 GitHub Actions 定期更新。';
strings.en.loading = 'Loading the latest Japan headlines…';
strings.en.none = 'A news feed has not been added for this location yet. Try Japan.';
strings.en.error = 'The news cache is not ready yet. Try again after the next Pages deployment.';
strings.en.source = 'News source: Google News RSS, refreshed by GitHub Actions.';
strings.ja.loading = '日本の最新ニュースを読み込み中…';
strings.ja.none = 'この地域のニュースフィードはまだ準備中です。まず日本をお試しください。';
strings.ja.error = 'ニュースキャッシュがまだ準備できていません。Pages 更新後にもう一度お試しください。';
strings.ja.source = 'ニュース提供：Google News RSS。GitHub Actions で定期更新。';

async function fetchStaticJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Static news ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function renderStaticNews(articles) {
  const seen = new Set();
  const unique = [];

  for (const article of articles) {
    const title = (article.title || '').trim();
    const url = article.url || '';
    if (!title || !url) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(article);

    if (unique.length >= 10) break;
  }

  if (!unique.length) {
    setNewsState(t('none'));
    return;
  }

  ui.newsState.classList.add('hidden');
  ui.newsList.innerHTML = '';

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
    source.textContent = article.source || 'Google News';
    meta.appendChild(source);

    const when = articleDate({ datetime: article.published });
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

fetchNews = async function () {
  if (!state.country) return;

  if (!isJapan()) {
    setNewsState(t('none'));
    return;
  }

  setNewsState(t('loading'), true);
  try {
    const data = await fetchStaticJson('data/countries/jp.json');
    const articles = Array.isArray(data.articles) ? data.articles : [];
    renderStaticNews(articles);
  } catch (error) {
    console.error('Static news load failed', error);
    setNewsState(t('error'));
  }
};

updateLabels();
