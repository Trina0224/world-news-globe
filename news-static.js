// Static-news adapter for Japan, United States, and all other globe countries.

strings['zh-Hant'].loading = '正在讀取最新新聞…';
strings['zh-Hant'].none = '目前找不到這個地區的近期新聞。';
strings['zh-Hant'].error = '新聞快取還沒準備好，等 GitHub Pages 更新後再試一次。';
strings['zh-Hant'].source = '新聞來源：Google News RSS；由 GitHub Actions 定期更新。';
strings.en.loading = 'Loading the latest headlines…';
strings.en.none = 'No recent headlines were found for this location.';
strings.en.error = 'The news cache is not ready yet. Try again after the next Pages deployment.';
strings.en.source = 'News source: Google News RSS, refreshed by GitHub Actions.';
strings.ja.loading = '最新ニュースを読み込み中…';
strings.ja.none = 'この地域の最近のニュースは見つかりませんでした。';
strings.ja.error = 'ニュースキャッシュがまだ準備できていません。Pages 更新後にもう一度お試しください。';
strings.ja.source = 'ニュース提供：Google News RSS。GitHub Actions で定期更新。';

const JP_REGION_SLUGS = {
  Hokkaido:'hokkaido', Aomori:'aomori', Iwate:'iwate', Miyagi:'miyagi', Akita:'akita', Yamagata:'yamagata', Fukushima:'fukushima',
  Ibaraki:'ibaraki', Tochigi:'tochigi', Gunma:'gunma', Saitama:'saitama', Chiba:'chiba', Tokyo:'tokyo', Kanagawa:'kanagawa',
  Niigata:'niigata', Toyama:'toyama', Ishikawa:'ishikawa', Fukui:'fukui', Yamanashi:'yamanashi', Nagano:'nagano', Gifu:'gifu',
  Shizuoka:'shizuoka', Aichi:'aichi', Mie:'mie', Shiga:'shiga', Kyoto:'kyoto', Osaka:'osaka', Hyogo:'hyogo', Nara:'nara',
  Wakayama:'wakayama', Tottori:'tottori', Shimane:'shimane', Okayama:'okayama', Hiroshima:'hiroshima', Yamaguchi:'yamaguchi',
  Tokushima:'tokushima', Kagawa:'kagawa', Ehime:'ehime', Kochi:'kochi', Fukuoka:'fukuoka', Saga:'saga', Nagasaki:'nagasaki',
  Kumamoto:'kumamoto', Oita:'oita', Miyazaki:'miyazaki', Kagoshima:'kagoshima', Okinawa:'okinawa'
};

const US_REGION_SLUGS = Object.fromEntries([
  ['Alabama','alabama'],['Alaska','alaska'],['Arizona','arizona'],['Arkansas','arkansas'],['California','california'],['Colorado','colorado'],
  ['Connecticut','connecticut'],['Delaware','delaware'],['Florida','florida'],['Georgia','georgia'],['Hawaii','hawaii'],['Idaho','idaho'],
  ['Illinois','illinois'],['Indiana','indiana'],['Iowa','iowa'],['Kansas','kansas'],['Kentucky','kentucky'],['Louisiana','louisiana'],
  ['Maine','maine'],['Maryland','maryland'],['Massachusetts','massachusetts'],['Michigan','michigan'],['Minnesota','minnesota'],['Mississippi','mississippi'],
  ['Missouri','missouri'],['Montana','montana'],['Nebraska','nebraska'],['Nevada','nevada'],['New Hampshire','new-hampshire'],['New Jersey','new-jersey'],
  ['New Mexico','new-mexico'],['New York','new-york'],['North Carolina','north-carolina'],['North Dakota','north-dakota'],['Ohio','ohio'],
  ['Oklahoma','oklahoma'],['Oregon','oregon'],['Pennsylvania','pennsylvania'],['Rhode Island','rhode-island'],['South Carolina','south-carolina'],
  ['South Dakota','south-dakota'],['Tennessee','tennessee'],['Texas','texas'],['Utah','utah'],['Vermont','vermont'],['Virginia','virginia'],
  ['Washington','washington'],['West Virginia','west-virginia'],['Wisconsin','wisconsin'],['Wyoming','wyoming']
]);

let worldNewsCache = null;

async function fetchStaticJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Static news ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getWorldNewsCache() {
  if (worldNewsCache) return worldNewsCache;
  worldNewsCache = await fetchStaticJson('data/world.json');
  return worldNewsCache;
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
  if (!unique.length) { setNewsState(t('none')); return; }
  ui.newsState.classList.add('hidden');
  ui.newsList.innerHTML = '';
  unique.forEach((article, index) => {
    const li = document.createElement('li'); li.className = 'news-item';
    const number = document.createElement('span'); number.className = 'news-index'; number.textContent = String(index + 1).padStart(2, '0');
    const body = document.createElement('div'); body.className = 'news-body';
    const link = document.createElement('a'); link.className = 'news-title'; link.href = article.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = article.title;
    const meta = document.createElement('div'); meta.className = 'news-meta';
    const source = document.createElement('span'); source.className = 'badge'; source.textContent = article.source || 'Google News'; meta.appendChild(source);
    const when = articleDate({ datetime: article.published });
    if (when) { const time = document.createElement('span'); time.textContent = when; meta.appendChild(time); }
    if (article.language) { const language = document.createElement('span'); language.textContent = article.language; meta.appendChild(language); }
    body.append(link, meta); li.append(number, body); ui.newsList.appendChild(li);
  });
}

fetchNews = async function () {
  if (!state.country) return;
  setNewsState(t('loading'), true);

  try {
    if (isJapan()) {
      let path = 'data/countries/jp.json';
      if (state.region && JP_REGION_SLUGS[state.region]) path = `data/jp/${JP_REGION_SLUGS[state.region]}.json`;
      const data = await fetchStaticJson(path);
      renderStaticNews(Array.isArray(data.articles) ? data.articles : []);
      return;
    }

    if (isUS()) {
      let path = 'data/countries/us.json';
      if (state.region && US_REGION_SLUGS[state.region]) path = `data/us/${US_REGION_SLUGS[state.region]}.json`;
      const data = await fetchStaticJson(path);
      renderStaticNews(Array.isArray(data.articles) ? data.articles : []);
      return;
    }

    const world = await getWorldNewsCache();
    const country = world?.countries?.[rawName(state.country)];
    renderStaticNews(Array.isArray(country?.articles) ? country.articles : []);
  } catch (error) {
    console.error('Static news load failed', rawName(state.country), error);
    setNewsState(t('error'));
  }
};

updateLabels();
