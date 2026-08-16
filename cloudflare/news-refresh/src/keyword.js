const GOOGLE = 'https://news.google.com/rss';
const GOOGLE_TIMEOUT_MS = 12000;

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

function decodeXml(text='') {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function tag(block,name){
  const m=block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));
  return decodeXml(m?.[1]?.trim()||'').replace(/<[^>]+>/g,'').trim();
}
function parseRss(xml,feed,language){
  const out=[];
  for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)){
    const b=m[1], title=tag(b,'title'), url=tag(b,'link');
    if(!title||!url) continue;
    const source=tag(b,'source');
    const pub=tag(b,'pubDate');
    const d=new Date(pub);
    out.push({title,url,source,published:Number.isNaN(d.getTime())?pub:d.toISOString(),language,feed});
  }
  return out;
}
function norm(s=''){ return s.toLowerCase().normalize('NFKC').replace(/\s+/g,' ').trim(); }
function searchUrl(q,hl,gl,ceid){ return `${GOOGLE}/search?q=${encodeURIComponent(q)}&hl=${encodeURIComponent(hl)}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`; }
function edition(country){ return EDITIONS[country] || [country,'en-US','US','US:en','English']; }

async function fetchFeed(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),GOOGLE_TIMEOUT_MS);
  const started=Date.now();
  try{
    const response=await fetch(url,{
      headers:{'User-Agent':'WorldNewsGlobe/1.0'},
      signal:controller.signal
    });
    const elapsed_ms=Date.now()-started;
    if(!response.ok) throw new Error(`Google News HTTP ${response.status} after ${elapsed_ms}ms`);
    return {xml:await response.text(),status:response.status,elapsed_ms};
  }catch(error){
    if(error?.name==='AbortError'){
      throw new Error(`Google News timeout after ${GOOGLE_TIMEOUT_MS}ms`);
    }
    throw error;
  }finally{
    clearTimeout(timeout);
  }
}

function buildQueries(country,region,keyword){
  const [countryQuery,hl,gl,ceid,language]=edition(country);
  const place=region || countryQuery || country;
  let queryPlace=place;
  if(country==='United States' || country==='United States of America'){
    if(region==='District of Columbia') queryPlace='Washington DC';
    if(region==='Washington') queryPlace='Washington state';
  }
  const queries=region
    ? [`"${keyword}" "${queryPlace}" when:1d`, `${keyword} ${queryPlace} when:1d`]
    : [`"${keyword}" when:1d`, `"${keyword}" ${countryQuery} when:1d`];
  return {countryQuery,hl,gl,ceid,language,queryPlace,queries};
}

export async function keywordDebug(country,region,keyword){
  const cleanKeyword=String(keyword||'').trim().slice(0,80);
  if(!cleanKeyword) return {ok:false,error:'keyword is required'};
  const {hl,gl,ceid,language,queryPlace,queries}=buildQueries(country,region,cleanKeyword);
  const started=Date.now();
  const settled=await Promise.allSettled(queries.map(async(q,i)=>{
    const url=searchUrl(q,hl,gl,ceid);
    const result=await fetchFeed(url);
    const articles=parseRss(result.xml,`keyword-${i+1}`,language);
    return {feed:`keyword-${i+1}`,ok:true,query:q,url,status:result.status,elapsed_ms:result.elapsed_ms,article_count:articles.length};
  }));
  const feeds=settled.map((result,index)=>result.status==='fulfilled'
    ? result.value
    : {feed:`keyword-${index+1}`,ok:false,query:queries[index],error:String(result.reason?.message||result.reason||'Google News request failed')}
  );
  return {
    ok:feeds.some(feed=>feed.ok),
    country,region,keyword:cleanKeyword,query_place:queryPlace,
    worker_elapsed_ms:Date.now()-started,
    generated_at:new Date().toISOString(),
    feeds
  };
}

function score(item,keyword,place){
  const t=norm(item.title), k=norm(keyword), p=norm(place);
  let s=0;
  if(k && t.includes(k)) s+=10;
  if(p && t.includes(p)) s+=4;
  const age=Math.max(0,(Date.now()-new Date(item.published).getTime())/3600000)||24;
  s+=Math.max(0,5-age/6);
  if(/reuters|associated press|ap news|bbc|nhk|共同通信|時事通信|中央社|bloomberg/i.test(item.source||'')) s+=2;
  return s;
}

export async function keywordSearch(country,region,keyword){
  const cleanKeyword=String(keyword||'').trim().slice(0,80);
  if(!cleanKeyword) return {ok:true,country,region,keyword:'',article_count:0,articles:[]};
  const {hl,gl,ceid,language,queryPlace,queries}=buildQueries(country,region,cleanKeyword);

  const settled=await Promise.allSettled(queries.map(async(q,i)=>{
    const result=await fetchFeed(searchUrl(q,hl,gl,ceid));
    return {
      articles:parseRss(result.xml,`keyword-${i+1}`,language),
      status:result.status,
      elapsed_ms:result.elapsed_ms
    };
  }));
  const feed_results=settled.map((result,index)=>result.status==='fulfilled'
    ? {feed:`keyword-${index+1}`,ok:true,status:result.value.status,elapsed_ms:result.value.elapsed_ms,article_count:result.value.articles.length}
    : {feed:`keyword-${index+1}`,ok:false,error:String(result.reason?.message||result.reason||'Google News request failed')}
  );
  const successful=settled.filter(result=>result.status==='fulfilled');
  if(!successful.length){
    const error=new Error(`All Google News queries failed: ${feed_results.map(result=>result.error).join('; ')}`);
    error.code='GOOGLE_NEWS_UPSTREAM_FAILED';
    error.feed_results=feed_results;
    throw error;
  }
  const all=successful.flatMap(result=>result.value.articles);
  const seen=new Set();
  const unique=[];
  for(const item of all){
    const key=norm(item.title);
    if(seen.has(key)) continue;
    seen.add(key);
    unique.push({...item,rank_score:score(item,cleanKeyword,queryPlace)});
  }
  unique.sort((a,b)=>b.rank_score-a.rank_score);

  const articles=[];
  const sourceCount=new Map();
  for(const item of unique){
    const src=norm(item.source)||'unknown';
    if((sourceCount.get(src)||0)>=2) continue;
    sourceCount.set(src,(sourceCount.get(src)||0)+1);
    articles.push(item);
    if(articles.length>=10) break;
  }

  return {
    ok:true,country,region,keyword:cleanKeyword,
    generated_at:new Date().toISOString(),
    source:'Google News RSS via Cloudflare Worker',
    mode:'keyword',candidate_count:all.length,article_count:articles.length,
    partial:successful.length<settled.length,feed_results,articles
  };
}
