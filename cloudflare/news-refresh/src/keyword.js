import { localizeKeyword } from './keyword-localization.js';

export const KEYWORD_VERSION = '2026-10-17.1';
const GOOGLE = 'https://news.google.com/rss';
const FRESH_MS = 120000;
const STALE_MS = 600000;
const EDITIONS = {
  Taiwan:['台灣','zh-TW','TW','TW:zh-Hant','Traditional Chinese'],
  Japan:['日本','ja','JP','JP:ja','Japanese'],
  'United States':['United States','en-US','US','US:en','English'],
  'United States of America':['United States','en-US','US','US:en','English'],
  'South Korea':['대한민국','ko','KR','KR:ko','Korean'],
  India:['India','en-IN','IN','IN:en','English'],
  'United Kingdom':['United Kingdom','en-GB','GB','GB:en','English'],
  Canada:['Canada','en-CA','CA','CA:en','English'],
  Australia:['Australia','en-AU','AU','AU:en','English'],
  'New Zealand':['New Zealand','en-NZ','NZ','NZ:en','English'],
  Singapore:['Singapore','en-SG','SG','SG:en','English'],
  Malaysia:['Malaysia','en-MY','MY','MY:en','English'],
  Philippines:['Philippines','en-PH','PH','PH:en','English'],
  France:['France','fr','FR','FR:fr','French'],
  Germany:['Deutschland','de','DE','DE:de','German'],
  Italy:['Italia','it','IT','IT:it','Italian'],
  Spain:['España','es','ES','ES:es','Spanish'],
  Portugal:['Portugal','pt-PT','PT','PT:pt-150','Portuguese'],
  Brazil:['Brasil','pt-BR','BR','BR:pt-419','Portuguese'],
  Mexico:['México','es-419','MX','MX:es-419','Spanish'],
  Argentina:['Argentina','es-419','AR','AR:es-419','Spanish'],
  Chile:['Chile','es-419','CL','CL:es-419','Spanish'],
  Colombia:['Colombia','es-419','CO','CO:es-419','Spanish'],
  Netherlands:['Nederland','nl','NL','NL:nl','Dutch'],
  Belgium:['België','nl','BE','BE:nl','Dutch'],
  Switzerland:['Schweiz','de','CH','CH:de','German'],
  Austria:['Österreich','de','AT','AT:de','German'],
  Sweden:['Sverige','sv','SE','SE:sv','Swedish'],
  Norway:['Norge','no','NO','NO:no','Norwegian'],
  Denmark:['Danmark','da','DK','DK:da','Danish'],
  Finland:['Suomi','fi','FI','FI:fi','Finnish'],
  Poland:['Polska','pl','PL','PL:pl','Polish'],
  Czechia:['Česko','cs','CZ','CZ:cs','Czech'],
  Greece:['Ελλάδα','el','GR','GR:el','Greek'],
  Turkey:['Türkiye','tr','TR','TR:tr','Turkish'],
  Israel:['ישראל','he','IL','IL:he','Hebrew'],
  'Saudi Arabia':['السعودية','ar','SA','SA:ar','Arabic'],
  'United Arab Emirates':['الإمارات','ar','AE','AE:ar','Arabic'],
  Egypt:['مصر','ar','EG','EG:ar','Arabic'],
  'South Africa':['South Africa','en-ZA','ZA','ZA:en','English'],
  Indonesia:['Indonesia','id','ID','ID:id','Indonesian'],
  Thailand:['ประเทศไทย','th','TH','TH:th','Thai'],
  Vietnam:['Việt Nam','vi','VN','VN:vi','Vietnamese']
};
function norm(s=''){return String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();}
function canonicalCountry(country){
  const key=norm(country);
  if(['us','usa','u.s.','u.s.a.','united states of america'].includes(key)) return 'United States';
  if(['tw','台灣','臺灣'].includes(key)) return 'Taiwan';
  if(['jp','日本'].includes(key)) return 'Japan';
  return Object.keys(EDITIONS).find(name=>norm(name)===key) || String(country).trim();
}
function decodeXml(text='') {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(whole,n)=>{
      const value=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
      return value>0 && value<=0x10ffff && !(value>=0xd800 && value<=0xdfff)?String.fromCodePoint(value):whole;
    }).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function tag(block,name){
  const m=block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));
  return decodeXml(m?.[1]?.trim()||'').replace(/<[^>]+>/g,'').trim();
}
function parseRss(xml,language){
  if(!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/rss\s*>/i.test(xml)) {
    throw Object.assign(new Error('Google returned a non-RSS or incomplete response'),{kind:'INVALID_RSS',retryable:false});
  }
  const out=[];
  let items=0;
  for(const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    items++;
    const title=tag(m[1],'title'),url=tag(m[1],'link');
    if(!title || !/^https?:\/\//i.test(url)) continue;
    const published=tag(m[1],'pubDate'),date=new Date(published);
    out.push({title,url,source:tag(m[1],'source'),published:Number.isNaN(date.getTime())?published:date.toISOString(),language,feed:'keyword-1'});
  }
  if(items && !out.length) throw Object.assign(new Error('RSS items could not be parsed'),{kind:'INVALID_RSS',retryable:false});
  return out;
}
async function readBounded(response){
  const reader=response.body?.getReader();
  if(!reader) return '';
  const decoder=new TextDecoder();
  let total=0,text='';
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done) return text+decoder.decode();
      total+=value.byteLength;
      if(total>1048576){await reader.cancel();throw Object.assign(new Error('RSS exceeds 1 MiB limit'),{kind:'INVALID_RSS',retryable:false});}
      text+=decoder.decode(value,{stream:true});
    }
  } finally {reader.releaseLock();}
}
function retryAfter(response){
  const value=response.headers.get('Retry-After');
  if(!value) return 0;
  const seconds=/^\d+$/.test(value)?Number(value):Math.ceil((Date.parse(value)-Date.now())/1000);
  return Number.isFinite(seconds)?Math.max(0,seconds):0;
}
export async function fetchFeed(url,language,options={}) {
  const started=Date.now(),attempts=[];
  const fetcher=options.fetcher || fetch;
  const timeoutMs=options.attemptTimeoutMs ?? 4000;
  const pause=options.sleep || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  let lastError;
  for(let attempt=1;attempt<=2;attempt++){
    const controller=new AbortController();
    let timer,status=0;
    try {
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();
        reject(Object.assign(new Error('Google News request timed out'),{kind:'TIMEOUT',retryable:true}));
      },timeoutMs);});
      const articles=await Promise.race([Promise.resolve().then(async()=>{
        const response=await fetcher(url,{headers:{'User-Agent':'WorldNewsGlobe/1.0'},signal:controller.signal});
        status=response.status;
        if(!response.ok){
          const retry_after_seconds=retryAfter(response);
          // Consume/cancel failed response bodies before considering a retry.
          await response.body?.cancel().catch(()=>{});
          throw Object.assign(new Error(`Google News HTTP ${status}`),{kind:'HTTP',status,retry_after_seconds,retryable:(status===429 || status>=500) && retry_after_seconds<=1});
        }
        return parseRss(await readBounded(response),language);
      }),deadline]);
      attempts.push({attempt,status,ok:true,elapsed_ms:Date.now()-started,article_count:articles.length});
      return {articles,status,elapsed_ms:Date.now()-started,attempts:attempt,attempt_details:attempts};
    } catch(error) {
      lastError=error;
      const kind=controller.signal.aborted?'TIMEOUT':error.kind || 'NETWORK';
      attempts.push({attempt,status,ok:false,kind,error:error.message || String(error),elapsed_ms:Date.now()-started});
      if(error.retryable===false || attempt===2) break;
    } finally {clearTimeout(timer);}
    await pause(Math.max(350,(lastError?.retry_after_seconds||0)*1000));
  }
  throw Object.assign(new Error(lastError?.message || 'Google News failed'),{
    code:'GOOGLE_NEWS_UPSTREAM_FAILED',retry_after_seconds:lastError?.retry_after_seconds || 0,
    feed_results:[{feed:'keyword-1',ok:false,status:attempts.at(-1)?.status || 0,elapsed_ms:Date.now()-started,attempts:attempts.length,attempt_details:attempts,error:lastError?.message || 'Upstream failure'}]
  });
}
function literal(text){return `"${String(text).replace(/["\r\n\\]/g,' ').replace(/\s+/g,' ').trim()}"`;}
function score(item,keyword,place){
  const t=norm(item.title);let s=0;
  if(t.includes(norm(keyword))) s+=10;
  if(place && t.includes(norm(place))) s+=4;
  const timestamp=Date.parse(item.published);
  const age=Number.isFinite(timestamp)?Math.max(0,(Date.now()-timestamp)/3600000):24;
  s+=Math.max(0,5-age/6);
  if(/reuters|associated press|ap news|bbc|nhk|共同通信|時事通信|中央社|bloomberg/i.test(item.source||'')) s+=2;
  return s;
}
async function cachedResult(cache,key){
  if(!cache) return null;
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(async()=>{const response=await cache.match(key);return response?await response.json():null;}),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(null),200);})
    ]);
  } catch {return null;} finally {clearTimeout(timer);}
}
export async function keywordSearch(country,region,keyword,options={}){
  const started=Date.now();
  country=canonicalCountry(country);
  region=String(region||'').trim().slice(0,100);
  keyword=String(keyword||'').trim().slice(0,80);
  if(!keyword) return {ok:true,country,region,keyword,article_count:0,articles:[],version:KEYWORD_VERSION};
  const [countryQuery,hl,gl,ceid,language]=EDITIONS[country] || [country,'en-US','US','US:en','English'];
  const cache=options.cache===undefined?globalThis.caches?.default:options.cache;
  const cacheKey=new Request('https://world-news-refresh.kozakurayuki.workers.dev/__keyword-cache/'+KEYWORD_VERSION+'/'+encodeURIComponent(JSON.stringify([country,region,keyword,options.sourceLanguage||'auto'])));
  const previous=await cachedResult(cache,cacheKey);
  const age=previous?Date.now()-Date.parse(previous.generated_at):Infinity;
  const usable=previous?.version===KEYWORD_VERSION && previous.country===country && previous.region===region && previous.keyword===keyword && Array.isArray(previous.articles) && previous.articles.length>0 && age>=0 && age<STALE_MS;
  if(usable && age<FRESH_MS && !options.force) return {...previous,cached:true,stale:false,cache_age_ms:age,worker_elapsed_ms:Date.now()-started};
  const target=ceid.split(':')[1].split('-')[0];
  const localization=await localizeKeyword(keyword,target,options.env,options);
  let place=region || countryQuery;
  if(country==='United States' && region==='Washington') place='Washington state';
  if(country==='United States' && region==='District of Columbia') place='Washington DC';
  // ONE localized query. National mode selects the local news edition, not a
  // guaranteed list of domestic events. Region mode adds the selected place.
  const query=[literal(localization.term),region?literal(place):'', 'when:1d'].filter(Boolean).join(' ');
  const url=`${GOOGLE}/search?${new URLSearchParams({q:query,hl,gl,ceid})}`;
  try {
    const feed=await fetchFeed(url,language,options);
    const seen=new Set(),sources=new Map(),articles=[];
    const candidates=feed.articles.map(item=>({...item,rank_score:score(item,localization.term,place)})).sort((a,b)=>b.rank_score-a.rank_score);
    for(const item of candidates){
      const key=norm(item.title),source=norm(item.source)||'unknown';
      if(seen.has(key) || (sources.get(source)||0)>=2) continue;
      seen.add(key);sources.set(source,(sources.get(source)||0)+1);articles.push(item);
      if(articles.length===10) break;
    }
    const result={ok:true,version:KEYWORD_VERSION,country,region,keyword,search_keyword:localization.term,localization,
      edition:{hl,gl,ceid,language,fallback:!EDITIONS[country]},query_place:place,query,
      generated_at:new Date().toISOString(),mode:'keyword',source:'Google News RSS via Cloudflare Worker',
      candidate_count:candidates.length,article_count:articles.length,articles,cached:false,stale:false,
      worker_elapsed_ms:Date.now()-started,
      feed_results:[{feed:'keyword-1',ok:true,query,url,status:feed.status,elapsed_ms:feed.elapsed_ms,attempts:feed.attempts,attempt_details:feed.attempt_details,article_count:feed.articles.length}]};
    // Never cache errors or zero-result responses. Keep only same-query success.
    if(cache && articles.length){
      const write=Promise.resolve().then(()=>cache.put(cacheKey,new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${STALE_MS/1000}`}}))).catch(()=>{});
      if(options.ctx) options.ctx.waitUntil(write);else await write;
    }
    return result;
  } catch(error) {
    if(usable && Date.now()-Date.parse(previous.generated_at)<STALE_MS && error.code==='GOOGLE_NEWS_UPSTREAM_FAILED') return {...previous,cached:true,stale:true,cache_age_ms:Date.now()-Date.parse(previous.generated_at),worker_elapsed_ms:Date.now()-started,upstream_error:error.message,feed_results:error.feed_results};
    if(error.feed_results) error.feed_results=error.feed_results.map(feed=>({...feed,query,url}));
    error.search_keyword=localization.term;
    error.localization=localization;
    throw error;
  }
}
export async function keywordDebug(country,region,keyword,options={}){
  const started=Date.now();
  try {
    const result=await keywordSearch(country,region,keyword,{...options,force:true});
    const {articles,...debug}=result;
    return {...debug,feeds:result.feed_results};
  } catch(error) {
    return {ok:false,country:canonicalCountry(country),region,keyword,worker_elapsed_ms:Date.now()-started,version:KEYWORD_VERSION,code:error.code || 'KEYWORD_ERROR',error:error.message,search_keyword:error.search_keyword,localization:error.localization,feeds:error.feed_results || []};
  }
}
