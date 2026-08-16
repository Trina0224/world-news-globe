const ALLOWED_ORIGIN = 'https://trina0224.github.io';
const GOOGLE = 'https://news.google.com/rss';

const EDITIONS = {
  Taiwan: ['台灣', 'zh-TW', 'TW', 'TW:zh-Hant', 'Traditional Chinese'],
  China: ['中國', 'zh-CN', 'CN', 'CN:zh-Hans', 'Simplified Chinese'],
  'South Korea': ['대한민국', 'ko', 'KR', 'KR:ko', 'Korean'],
  India: ['India', 'en-IN', 'IN', 'IN:en', 'English'],
  'United Kingdom': ['United Kingdom', 'en-GB', 'GB', 'GB:en', 'English'],
  Canada: ['Canada', 'en-CA', 'CA', 'CA:en', 'English'],
  Australia: ['Australia', 'en-AU', 'AU', 'AU:en', 'English'],
  'New Zealand': ['New Zealand', 'en-NZ', 'NZ', 'NZ:en', 'English'],
  Singapore: ['Singapore', 'en-SG', 'SG', 'SG:en', 'English'],
  Malaysia: ['Malaysia', 'en-MY', 'MY', 'MY:en', 'English'],
  Philippines: ['Philippines', 'en-PH', 'PH', 'PH:en', 'English'],
  France: ['France', 'fr', 'FR', 'FR:fr', 'French'],
  Germany: ['Deutschland', 'de', 'DE', 'DE:de', 'German'],
  Italy: ['Italia', 'it', 'IT', 'IT:it', 'Italian'],
  Spain: ['España', 'es', 'ES', 'ES:es', 'Spanish'],
  Portugal: ['Portugal', 'pt-PT', 'PT', 'PT:pt-150', 'Portuguese'],
  Brazil: ['Brasil', 'pt-BR', 'BR', 'BR:pt-419', 'Portuguese'],
  Mexico: ['México', 'es-419', 'MX', 'MX:es-419', 'Spanish'],
  Argentina: ['Argentina', 'es-419', 'AR', 'AR:es-419', 'Spanish'],
  Chile: ['Chile', 'es-419', 'CL', 'CL:es-419', 'Spanish'],
  Colombia: ['Colombia', 'es-419', 'CO', 'CO:es-419', 'Spanish'],
  Netherlands: ['Nederland', 'nl', 'NL', 'NL:nl', 'Dutch'],
  Belgium: ['België', 'nl', 'BE', 'BE:nl', 'Dutch'],
  Switzerland: ['Schweiz', 'de', 'CH', 'CH:de', 'German'],
  Austria: ['Österreich', 'de', 'AT', 'AT:de', 'German'],
  Sweden: ['Sverige', 'sv', 'SE', 'SE:sv', 'Swedish'],
  Norway: ['Norge', 'no', 'NO', 'NO:no', 'Norwegian'],
  Denmark: ['Danmark', 'da', 'DK', 'DK:da', 'Danish'],
  Finland: ['Suomi', 'fi', 'FI', 'FI:fi', 'Finnish'],
  Poland: ['Polska', 'pl', 'PL', 'PL:pl', 'Polish'],
  Czechia: ['Česko', 'cs', 'CZ', 'CZ:cs', 'Czech'],
  Greece: ['Ελλάδα', 'el', 'GR', 'GR:el', 'Greek'],
  Turkey: ['Türkiye', 'tr', 'TR', 'TR:tr', 'Turkish'],
  Israel: ['ישראל', 'he', 'IL', 'IL:he', 'Hebrew'],
  'Saudi Arabia': ['السعودية', 'ar', 'SA', 'SA:ar', 'Arabic'],
  'United Arab Emirates': ['الإمارات', 'ar', 'AE', 'AE:ar', 'Arabic'],
  Egypt: ['مصر', 'ar', 'EG', 'EG:ar', 'Arabic'],
  'South Africa': ['South Africa', 'en-ZA', 'ZA', 'ZA:en', 'English'],
  Indonesia: ['Indonesia', 'id', 'ID', 'ID:id', 'Indonesian'],
  Thailand: ['ประเทศไทย', 'th', 'TH', 'TH:th', 'Thai'],
  Vietnam: ['Việt Nam', 'vi', 'VN', 'VN:vi', 'Vietnamese']
};

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(origin) });
}

function decodeXml(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return decodeXml(m?.[1]?.trim() || '').replace(/<[^>]+>/g, '').trim();
}

function parseRss(xml, feed, language) {
  const out = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = tag(block, 'title');
    const url = tag(block, 'link');
    const source = tag(block, 'source');
    const pub = tag(block, 'pubDate');
    if (!title || !url) continue;
    let published = pub;
    const dt = new Date(pub);
    if (!Number.isNaN(dt.getTime())) published = dt.toISOString();
    out.push({ title, url, source, published, language, feed });
  }
  return out;
}

function searchUrl(query, hl, gl, ceid) {
  return `${GOOGLE}/search?q=${encodeURIComponent(query)}&hl=${encodeURIComponent(hl)}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
}

function edition(country) {
  if (country === 'Japan') return ['日本', 'ja', 'JP', 'JP:ja', 'Japanese'];
  if (country === 'United States' || country === 'United States of America') return ['United States', 'en-US', 'US', 'US:en', 'English'];
  return EDITIONS[country] || [country, 'en-US', 'US', 'US:en', 'English'];
}

function feedPlan(country, region) {
  const [queryName, hl, gl, ceid, language] = edition(country);
  const feeds = [];
  const add = (name, query) => feeds.push([name, searchUrl(query, hl, gl, ceid)]);

  if (country === 'Japan') {
    if (!region) {
      feeds.push(['top', `${GOOGLE}?hl=ja&gl=JP&ceid=JP:ja`]);
      feeds.push(['nation', `${GOOGLE}/headlines/section/topic/NATION?hl=ja&gl=JP&ceid=JP:ja`]);
      add('government', '日本 政府 when:1d');
      add('economy', '日本 経済 when:1d');
      add('breaking', '日本 事件 速報 when:1d');
      add('disaster', '日本 災害 地震 台風 when:1d');
      return { feeds, terms: ['日本', '国内'], language };
    }
    add('local', `"${region}" ニュース when:1d`);
    add('breaking', `"${region}" 事件 速報 when:1d`);
    add('government', `"${region}" 行政 when:1d`);
    add('disaster', `"${region}" 災害 天気 when:1d`);
    return { feeds, terms: [region], language };
  }

  if (country === 'United States' || country === 'United States of America') {
    if (!region) {
      feeds.push(['top', `${GOOGLE}?hl=en-US&gl=US&ceid=US:en`]);
      feeds.push(['nation', `${GOOGLE}/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en`]);
      add('breaking', 'United States breaking news when:1d');
      add('government', 'United States government politics when:1d');
      add('economy', 'United States economy when:1d');
      return { feeds, terms: ['United States', 'U.S.', 'US'], language };
    }
    const r = region === 'District of Columbia' ? 'Washington DC' : region === 'Washington' ? 'Washington state' : region;
    add('local', `"${r}" local news when:1d`);
    add('breaking', `"${r}" breaking news when:1d`);
    add('government', `"${r}" government when:1d`);
    add('disaster', `"${r}" weather fire earthquake when:1d`);
    return { feeds, terms: [r, region], language };
  }

  if (country === 'Taiwan') {
    feeds.push(['top', `${GOOGLE}?hl=zh-TW&gl=TW&ceid=TW:zh-Hant`]);
    feeds.push(['nation', `${GOOGLE}/headlines/section/topic/NATION?hl=zh-TW&gl=TW&ceid=TW:zh-Hant`]);
    add('breaking', '台灣 重大 速報 when:1d');
    add('government', '台灣 政府 政策 when:1d');
    add('economy', '台灣 經濟 產業 when:1d');
    add('disaster', '台灣 地震 災害 天氣 when:1d');
    return { feeds, terms: ['台灣', '臺灣'], language };
  }

  add('breaking', `"${queryName}" breaking news when:1d`);
  add('government', `"${queryName}" government politics when:1d`);
  add('economy', `"${queryName}" economy when:1d`);
  add('general', `"${queryName}" news when:1d`);
  return { feeds, terms: [queryName, country], language };
}

function norm(s = '') {
  return s.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function tokens(title) {
  return new Set(norm(title).match(/[\p{L}\p{N}]{2,}/gu) || []);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let same = 0;
  for (const x of a) if (b.has(x)) same++;
  return same / (a.size + b.size - same);
}

function sameEvent(a, b) {
  const ta = norm(a.title).replace(/\s[-–—|]\s[^-–—|]{2,60}$/, '');
  const tb = norm(b.title).replace(/\s[-–—|]\s[^-–—|]{2,60}$/, '');
  if (ta === tb) return true;
  return jaccard(tokens(ta), tokens(tb)) >= 0.48;
}

function sourceBonus(source = '') {
  const s = norm(source);
  const tierA = ['reuters','associated press','ap news','bbc','nhk','共同通信','時事通信','中央社','公視新聞網','bloomberg','financial times','npr'];
  if (tierA.some(x => s.includes(x))) return 2.2;
  if (/(times|post|journal|tribune|herald|daily|news|press|新聞|放送|テレビ|tv)/i.test(s)) return 0.7;
  return 0;
}

function editorialScore(item, terms) {
  const t = norm(item.title);
  let score = 0;
  if (terms.some(term => term && t.includes(norm(term)))) score += 5.5;
  if (/(breaking|速報|earthquake|地震|fire|火災|wildfire|台風|typhoon|flood|洪水|election|選挙|選舉|court|法院|government|政府|economy|經濟|経済|tariff|關稅|関税|interest rate|利率|事故|事件)/i.test(item.title)) score += 2.0;
  if (/(sponsored|press release|pr newswire|business wire|deal|coupon|review|best .* to buy|おすすめ|ランキング|開箱|優惠|折扣|懶人包)/i.test(item.title)) score -= 5.0;
  if (['top','nation','breaking','disaster'].includes(item.feed)) score += 1.4;
  if (['government','economy'].includes(item.feed)) score += 0.7;
  return score;
}

function rank(candidates, terms, limit = 10) {
  const seenUrl = new Set();
  const prepared = candidates.filter(x => x.title && x.url && !seenUrl.has(x.url) && seenUrl.add(x.url));
  const clusters = [];
  for (const item of prepared) {
    let target = null;
    for (const c of clusters) {
      if (c.some(other => sameEvent(item, other))) { target = c; break; }
    }
    if (target) target.push(item); else clusters.push([item]);
  }

  const reps = clusters.map(cluster => {
    const sources = new Set(cluster.map(x => norm(x.source)).filter(Boolean));
    const feeds = new Set(cluster.map(x => x.feed).filter(Boolean));
    const coverageScore = Math.min(15, Math.max(0, sources.size - 1) * 4);
    const feedScore = Math.min(3, Math.max(0, feeds.size - 1) * 0.8);
    let best = null, bestScore = -999;
    for (const item of cluster) {
      const age = Math.max(0, (Date.now() - new Date(item.published).getTime()) / 3600000) || 12;
      const recency = Math.max(0, 5.5 - age / 4.5);
      const score = coverageScore + feedScore + recency + editorialScore(item, terms) + sourceBonus(item.source);
      if (score > bestScore) { bestScore = score; best = item; }
    }
    return best ? { ...best, rank_score: Math.round(bestScore * 100) / 100, coverage: Math.max(1, sources.size), feed_coverage: Math.max(1, feeds.size) } : null;
  }).filter(Boolean).sort((a, b) => b.rank_score - a.rank_score);

  const out = [], sourceCount = new Map();
  for (const item of reps) {
    const src = norm(item.source) || 'unknown';
    if ((sourceCount.get(src) || 0) >= 2) continue;
    sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function refreshArea(country, region) {
  const plan = feedPlan(country, region);
  const settled = await Promise.allSettled(plan.feeds.map(async ([feed, url]) => {
    const response = await fetch(url, { headers: { 'User-Agent': 'WorldNewsGlobe/1.0' } });
    if (!response.ok) throw new Error(`${feed}: ${response.status}`);
    return parseRss(await response.text(), feed, plan.language);
  }));
  const candidates = settled.flatMap(x => x.status === 'fulfilled' ? x.value : []);
  if (!candidates.length) throw new Error('Google News returned no usable headlines');
  const articles = rank(candidates, plan.terms, 10);
  return {
    ok: true,
    country,
    region,
    generated_at: new Date().toISOString(),
    source: 'Google News RSS via Cloudflare Worker',
    ranking: 'live-multi-feed-event-v2.1',
    candidate_count: candidates.length,
    source_count: new Set(candidates.map(x => x.source).filter(Boolean)).size,
    article_count: articles.length,
    articles
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (request.method === 'GET') {
      return json({ ok: true, service: 'World News live refresh', status: 'online', version: '2.1', endpoint: 'POST /refresh' }, 200, origin);
    }

    if (request.method !== 'POST' || !['/', '/refresh'].includes(url.pathname)) {
      return json({ ok: false, error: 'Use POST /refresh' }, 405, origin);
    }

    try {
      const body = await request.json();
      const country = String(body?.country || '').trim();
      const region = String(body?.region || '').trim();
      if (!country) return json({ ok: false, error: 'country is required' }, 400, origin);
      const result = await refreshArea(country, region);
      return json(result, 200, origin);
    } catch (error) {
      return json({ ok: false, error: error?.message || 'Refresh failed' }, 500, origin);
    }
  }
};
