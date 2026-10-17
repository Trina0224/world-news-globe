import refreshApp from './index.js';
import { keywordSearch, keywordDebug, KEYWORD_VERSION } from './keyword.js';

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
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
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

async function handleKeyword(request, env, ctx, origin) {
  if (request.method !== 'POST') return json({ok:false,error:'Use POST /keyword'},405,origin);
  const request_id=crypto.randomUUID();
  let body;
  try {body=await request.json();}
  catch {return json({ok:false,error:'Invalid JSON',request_id},400,origin);}
  const country=String(body?.country||'').trim().slice(0,100);
  const region=String(body?.region||'').trim().slice(0,100);
  const keyword=String(body?.keyword||'').trim().slice(0,80);
  if(!country || !keyword) return json({ok:false,error:'country and keyword are required',request_id},400,origin);
  try {
    const result=await keywordSearch(country,region,keyword,{env,ctx,force:body.refresh===true,sourceLanguage:body.source_language});
    return json({...result,request_id},200,origin);
  } catch(error) {
    const upstream=error?.code==='GOOGLE_NEWS_UPSTREAM_FAILED';
    // No credentials, cookies, or raw upstream HTML are exposed in diagnostics.
    return json({ok:false,version:KEYWORD_VERSION,request_id,country,region,keyword,
      code:error.code || 'KEYWORD_ERROR',error:error.message || 'Keyword search failed',
      feed_results:error.feed_results || [],search_keyword:error.search_keyword,
      localization:error.localization,retry_after_seconds:error.retry_after_seconds || 0
    },upstream?502:500,origin);
  }
}

async function handleKeywordDebug(request, env, ctx, origin) {
  if(request.method!=='GET') return json({ok:false,error:'Use GET /debug-keyword'},405,origin);
  const url=new URL(request.url);
  const country=String(url.searchParams.get('country')||'').trim().slice(0,100);
  const region=String(url.searchParams.get('region')||'').trim().slice(0,100);
  const keyword=String(url.searchParams.get('keyword')||'').trim().slice(0,80);
  if(!country || !keyword) return json({ok:false,error:'country and keyword are required'},400,origin);
  const result=await keywordDebug(country,region,keyword,{env,ctx,sourceLanguage:url.searchParams.get('source_language')});
  return json({...result,request_id:crypto.randomUUID()},result.ok?200:502,origin);
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
      return handleKeyword(request, env, ctx, origin);
    }

    if (url.pathname === '/debug-keyword') {
      return handleKeywordDebug(request, env, ctx, origin);
    }

    return refreshApp.fetch(request, env, ctx);
  }
};
