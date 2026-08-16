const GOOGLE = 'https://news.google.com/rss';

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
  const [countryQuery,hl,gl,ceid,language]=edition(country);
  const place = region || countryQuery || country;
  const cleanKeyword=String(keyword||'').trim().slice(0,80);
  if(!cleanKeyword) return {ok:true,country,region,keyword:'',article_count:0,articles:[]};

  let queryPlace=place;
  if(country==='United States' || country==='United States of America'){
    if(region==='District of Columbia') queryPlace='Washington DC';
    if(region==='Washington') queryPlace='Washington state';
  }

  const queries = region
    ? [`"${cleanKeyword}" "${queryPlace}" when:1d`, `${cleanKeyword} ${queryPlace} when:1d`]
    : [`"${cleanKeyword}" when:1d`, `"${cleanKeyword}" ${countryQuery} when:1d`];

  const settled=await Promise.allSettled(queries.map(async(q,i)=>{
    const r=await fetch(searchUrl(q,hl,gl,ceid),{headers:{'User-Agent':'WorldNewsGlobe/1.0'}});
    if(!r.ok) throw new Error(`Google News ${r.status}`);
    return parseRss(await r.text(),`keyword-${i+1}`,language);
  }));
  const all=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
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
    mode:'keyword',candidate_count:all.length,article_count:articles.length,articles
  };
}
