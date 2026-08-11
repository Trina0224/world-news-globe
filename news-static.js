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
    const normalized = articles.map(article => ({
      title: article.title,
      url: article.url,
      sourcecountry: article.source || 'Google News',
      datetime: article.published,
      language: article.language || 'Japanese'
    }));
    renderNews(normalized);
  } catch (error) {
    console.error('Static news load failed', error);
    setNewsState(t('error'));
  }
};

updateLabels();
