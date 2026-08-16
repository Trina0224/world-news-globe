import refreshApp from './index.js';
import { keywordSearch } from './keyword.js';

const ALLOWED_ORIGIN = 'https://trina0224.github.io';
const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';

const SOURCE_LANGS = {
  'English':'en',
  'Japanese':'ja',
  'Traditional Chinese':'zh',
  'Simplified Chinese':'zh',
  'Korean':'ko',
  'French':'fr',
  'German':'de',
  'Italian':'it',
  'Spanish':'es',
  'Portuguese':'pt',
  'Dutch':'nl',
  'Swedish':'sv',
  'Norwegian':'no',
  'Danish':'da',
  'Finnish':'fi',
  'Polish':'pl',
  'Czech':'cs',
  'Greek':'el',
  'Turkish':'tr',
  'Hebrew':'he',
  'Arabic':'ar',
  'Indonesian':'id',
  'Thai':'th',
  'Vietnamese':'vi'
};

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: cors(origin) });
}

function targetCode(target) {
  if (target === 'en') return 'en';
  if (target === 'ja') return 'ja';
  if (target === 'zh-Hant') return 'zh';
  return '';
}

function sameLanguage(language, target) {
  if (target === 'en') return language === 'English';
  if (target === 'ja') return language === 'Japanese';
  if (target === 'zh-Hant') return language === 'Traditional Chinese';
  return false;
}

async function translateOne(env, item, target) {
  const text = String(item?.text || '').trim();
  const language = String(item?.language || 'English').trim();
  if (!text) return '';
  if (sameLanguage(language, target)) return text;

  const source_lang = SOURCE_LANGS[language] || 'en';
  const target_lang = targetCode(target);
  const response = await env.AI.run(TRANSLATION_MODEL, {
    text,
    source_lang,
    target_lang
  });
  const translated = String(response?.translated_text || '').trim();
  if (!translated) throw new Error('Translation returned empty output');
  return translated;
}

async function handleTranslate(request, env, origin) {
  if (request.method !== 'POST') {
    return json({ ok:false, error:'Use POST /translate' }, 405, origin);
  }
  if (!env?.AI) {
    return json({ ok:false, error:'Workers AI binding is unavailable', free_only:true }, 503, origin);
  }

  try {
    const body = await request.json();
    const target = String(body?.target || '').trim();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 10) : [];
    if (!['en','zh-Hant','ja'].includes(target)) {
      return json({ ok:false, error:'target must be en, zh-Hant, or ja' }, 400, origin);
    }
    if (!items.length) {
      return json({ ok:false, error:'items are required' }, 400, origin);
    }

    const translations = [];
    for (const item of items) {
      translations.push(await translateOne(env, item, target));
    }

    return json({
      ok:true,
      target,
      model:TRANSLATION_MODEL,
      chinese_normalization: target === 'zh-Hant' ? 'client-opencc-s2twp' : null,
      free_only:true,
      translations
    }, 200, origin);
  } catch (error) {
    const message = String(error?.message || 'Translation failed');
    const quota = /3036|quota|daily free allocation|paid plan|5035/i.test(message);
    return json({
      ok:false,
      error: quota ? 'Free translation quota is unavailable right now.' : message,
      free_only:true,
      quota
    }, quota ? 429 : 500, origin);
  }
}

async function handleKeyword(request, env, origin) {
  if (request.method !== 'POST') {
    return json({ ok:false, error:'Use POST /keyword' }, 405, origin);
  }
  try {
    const body = await request.json();
    const country = String(body?.country || '').trim();
    const region = String(body?.region || '').trim();
    const keyword = String(body?.keyword || '').trim();
    if (!country) return json({ ok:false, error:'country is required' }, 400, origin);
    if (!keyword) return json({ ok:false, error:'keyword is required' }, 400, origin);
    const result = await keywordSearch(env, country, region, keyword);
    return json(result, 200, origin);
  } catch (error) {
    return json({ ok:false, error:error?.message || 'Keyword search failed' }, 500, origin);
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;
    const url = new URL(request.url);

    if (url.pathname === '/translate') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status:204, headers:cors(origin) });
      }
      return handleTranslate(request, env, origin);
    }

    if (url.pathname === '/keyword') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status:204, headers:cors(origin) });
      }
      return handleKeyword(request, env, origin);
    }

    return refreshApp.fetch(request, env, ctx);
  }
};
