const GOOGLE = 'https://news.google.com/rss';
const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';

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

const LANGUAGE_CODES = {
  'Traditional Chinese':'zh','Simplified Chinese':'zh','Japanese':'ja','English':'en','Korean':'ko','French':'fr','German':'de',
  'Italian':'it','Spanish':'es','Portuguese':'pt','Dutch':'nl','Swedish':'sv','Norwegian':'no','Danish':'da','Finnish':'fi',
  'Polish':'pl','Czech':'cs','Greek':'el','Turkish':'tr','Hebrew':'he','Arabic':'ar','Indonesian':'id','Thai':'th','Vietnamese':'vi'
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
  for(const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
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
function searchUrl(q,hl,gl,ceid){ return `${GOOGLE}/search?q=${encodeURIComponent(q)}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`; }
function edition(country){ return EDITIONS[country] || [country,'en-US','US','US:en','English']; }
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

async function fetchRss(url){
  let lastError=null;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(url,{headers:{
        'User-Agent':'Mozilla/5.0 (compatible; WorldNewsGlobe/2.0)',
        'Accept':'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
        'Accept-Language':'en-US,en;q=0.8'
      }});
      const text=await response.text();
      if(response.ok && /<rss[\s>]|<feed[\s>]|<item[\s>]/i.test(text)) return text;
      const retryable=[429,500,502,503,504].includes(response.status) || response.ok;
      lastError=new Error(response.ok ? 'Google News returned non-RSS content' : `Google News ${response.status}`);
      if(!retryable) throw lastError;
    }catch(error){
      lastError=error;
    }
    if(attempt<3) await sleep(500*Math.pow(2,attempt)+Math.floor(Math.random()*250));
  }
  throw lastError || new Error('Google News request failed');
}

function detectKeywordLanguage(text){
  if(/[ぁ-ゟ゠-ヿ]/u.test(text)) return 'ja';
  if(/[\u4e00-\u9fff]/u.test(text)) return 'zh';
  if(/[가-힣]/u.test(text)) return 'ko';
  if(/[؀-ۿ]/u.test(text)) return 'ar';
  if(/[א-ת]/u.test(text)) return 'he';
  if(/[ก-๛]/u.test(text)) return 'th';
  return 'en';
}

async function translateKeyword(env,text,source_lang,target_lang){
  if(!env?.AI || !text || !source_lang || !target_lang || source_lang===target_lang) return text;
  try{
    const response=await env.AI.run(TRANSLATION_MODEL,{text,source_lang,target_lang});
    return String(response?.translated_text||'').trim() || text;
  }catch(error){
    console.warn('Keyword translation unavailable',source_lang,target_lang,error?.message||error);
    return text;
  }
}

async function keywordVariants(env,keyword,localLanguage){
  const original=String(keyword||'').trim();
  const source=detectKeywordLanguage(original);
  const local=LANGUAGE_CODES[localLanguage] || 'en';
  const variants=[original];

  const english=await translateKeyword(env,original,source,'en');
  if(english && !variants.some(x=>norm(x)===norm(english))) variants.push(english);

  const localBase=source==='en'?english:original;
  const localSource=source==='en'?'en':source;
  const localTerm=await translateKeyword(env,localBase,localSource,local);
  if(localTerm && !variants.some(x=>norm(x)===norm(localTerm))) variants.push(localTerm);

  return variants.slice(0,3);
}

function score(item,keywords,place){
  const t=norm(item.title), p=norm(place);
  let s=0;
  if(keywords.some(keyword=>keyword && t.includes(norm(keyword)))) s+=10;
  if(p && t.includes(p)) s+=4;
  const age=Math.max(0,(Date.now()-new Date(item.published).getTime())/3600000)||24;
  s+=Math.max(0,5-age/6);
  if(/reuters|associated press|ap news|bbc|nhk|共同通信|時事通信|中央社|bloomberg/i.test(item.source||'')) s+=2;
  return s;
}

function buildQueries(keywords,region,queryPlace,countryQuery){
  const out=[];
  const seen=new Set();
  for(const term of keywords){
    const candidates=region
      ? [`${term} ${queryPlace} when:1d`, `${term} ${queryPlace}`]
      : [`${term} when:1d`, `${term} ${countryQuery} when:1d`];
    for(const q of candidates){
      const key=norm(q);
      if(!seen.has(key)){ seen.add(key); out.push(q); }
    }
  }
  return out;
}

export async function keywordSearch(env,country,region,keyword){
  const [countryQuery,hl,gl,ceid,language]=edition(country);
  const place=region || countryQuery || country;
  const cleanKeyword=String(keyword||'').trim().slice(0,80);
  if(!cleanKeyword) return {ok:true,country,region,keyword:'',article_count:0,articles:[]};

  let queryPlace=place;
  if(country==='United States' || country==='United States of America'){
    if(region==='District of Columbia') queryPlace='Washington DC';
    if(region==='Washington') queryPlace='Washington state';
  }

  const keywords=await keywordVariants(env,cleanKeyword,language);
  const queries=buildQueries(keywords,region,queryPlace,countryQuery);
  const all=[];
  const diagnostics=[];

  // Google News has recently returned transient 503/non-RSS responses to burst traffic.
  // Query sequentially and stop once there is a healthy candidate pool.
  for(let i=0;i<queries.length;i++){
    const q=queries[i];
    try{
      const xml=await fetchRss(searchUrl(q,hl,gl,ceid));
      const parsed=parseRss(xml,`keyword-${i+1}`,language);
      diagnostics.push({query:q,ok:true,count:parsed.length});
      all.push(...parsed);
      if(all.length>=45) break;
    }catch(error){
      diagnostics.push({query:q,ok:false,error:String(error?.message||error)});
    }
    if(i<queries.length-1) await sleep(180);
  }

  const successful=diagnostics.filter(x=>x.ok).length;
  if(!successful) throw new Error('Google News is temporarily unavailable for keyword search');

  const seen=new Set();
  const unique=[];
  for(const item of all){
    const key=norm(item.title);
    if(seen.has(key)) continue;
    seen.add(key);
    unique.push({...item,rank_score:score(item,keywords,queryPlace)});
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
    ok:true,country,region,keyword:cleanKeyword,keyword_variants:keywords,
    generated_at:new Date().toISOString(),
    source:'Google News RSS via Cloudflare Worker',
    mode:'keyword-localized-v2',candidate_count:all.length,
    successful_query_count:successful,article_count:articles.length,articles
  };
}
