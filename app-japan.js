const MAP_URL = 'data/maps/japan-prefectures.geojson';

const state = { lang: 'zh-Hant', region: '', mapFeatures: [] };

const PREFS = [
  ['','全部','All','全国'],['Hokkaido','北海道','Hokkaido','北海道'],['Aomori','青森県','Aomori','青森県'],['Iwate','岩手県','Iwate','岩手県'],['Miyagi','宮城県','Miyagi','宮城県'],['Akita','秋田県','Akita','秋田県'],['Yamagata','山形県','Yamagata','山形県'],['Fukushima','福島県','Fukushima','福島県'],['Ibaraki','茨城県','Ibaraki','茨城県'],['Tochigi','栃木県','Tochigi','栃木県'],['Gunma','群馬県','Gunma','群馬県'],['Saitama','埼玉県','Saitama','埼玉県'],['Chiba','千葉県','Chiba','千葉県'],['Tokyo','東京都','Tokyo','東京都'],['Kanagawa','神奈川県','Kanagawa','神奈川県'],['Niigata','新潟県','Niigata','新潟県'],['Toyama','富山県','Toyama','富山県'],['Ishikawa','石川県','Ishikawa','石川県'],['Fukui','福井県','Fukui','福井県'],['Yamanashi','山梨県','Yamanashi','山梨県'],['Nagano','長野県','Nagano','長野県'],['Gifu','岐阜県','Gifu','岐阜県'],['Shizuoka','静岡県','Shizuoka','静岡県'],['Aichi','愛知県','Aichi','愛知県'],['Mie','三重県','Mie','三重県'],['Shiga','滋賀県','Shiga','滋賀県'],['Kyoto','京都府','Kyoto','京都府'],['Osaka','大阪府','Osaka','大阪府'],['Hyogo','兵庫県','Hyogo','兵庫県'],['Nara','奈良県','Nara','奈良県'],['Wakayama','和歌山県','Wakayama','和歌山県'],['Tottori','鳥取県','Tottori','鳥取県'],['Shimane','島根県','Shimane','島根県'],['Okayama','岡山県','Okayama','岡山県'],['Hiroshima','広島県','Hiroshima','広島県'],['Yamaguchi','山口県','Yamaguchi','山口県'],['Tokushima','徳島県','Tokushima','徳島県'],['Kagawa','香川県','Kagawa','香川県'],['Ehime','愛媛県','Ehime','愛媛県'],['Kochi','高知県','Kochi','高知県'],['Fukuoka','福岡県','Fukuoka','福岡県'],['Saga','佐賀県','Saga','佐賀県'],['Nagasaki','長崎県','Nagasaki','長崎県'],['Kumamoto','熊本県','Kumamoto','熊本県'],['Oita','大分県','Oita','大分県'],['Miyazaki','宮崎県','Miyazaki','宮崎県'],['Kagoshima','鹿児島県','Kagoshima','鹿児島県'],['Okinawa','沖縄県','Okinawa','沖縄県']
];

const SLUGS = Object.fromEntries(PREFS.filter(p=>p[0]).map(p=>[p[0], p[0].toLowerCase()]));
SLUGS.Oita='oita';

const strings = {
  'zh-Hant': { title:'日本', type:'日本新聞地圖', region:'都道府縣', all:'全部', headlines:'今日新聞', window:'最近 24 小時', hint:'直接點地圖上的都道府縣', loading:'正在讀取最新新聞…', none:'目前找不到這個地區的近期新聞。', error:'新聞快取還沒準備好，請稍後再試。', source:'新聞來源：Google News RSS；由 GitHub Actions 定期更新。' },
  en: { title:'Japan', type:'JAPAN NEWS MAP', region:'Prefecture', all:'All', headlines:"Today's news", window:'Last 24 hours', hint:'Tap a prefecture directly on the map', loading:'Loading the latest headlines…', none:'No recent headlines were found for this location.', error:'The news cache is not ready yet. Try again shortly.', source:'News source: Google News RSS, refreshed by GitHub Actions.' },
  ja: { title:'日本', type:'日本ニュースマップ', region:'都道府県', all:'全国', headlines:'今日のニュース', window:'過去24時間', hint:'地図の都道府県を直接タップ', loading:'最新ニュースを読み込み中…', none:'この地域の最近のニュースは見つかりませんでした。', error:'ニュースキャッシュがまだ準備できていません。しばらくしてからお試しください。', source:'ニュース提供：Google News RSS。GitHub Actions で定期更新。' }
};

const ui = {
  map: document.getElementById('japanMap'), mapStatus: document.getElementById('globeStatus'), mapHint: document.getElementById('globeHint'),
  locationType: document.getElementById('locationType'), locationName: document.getElementById('locationName'), localTime: document.getElementById('localTime'), newsWindow: document.getElementById('newsWindow'),
  regionLabel: document.getElementById('regionLabel'), regionSelect: document.getElementById('regionSelect'), headlineLabel: document.getElementById('headlineLabel'), refreshBtn: document.getElementById('refreshBtn'),
  newsState: document.getElementById('newsState'), emptyMessage: document.getElementById('emptyMessage'), newsList: document.getElementById('newsList'), sourceNote: document.getElementById('sourceNote'),
  languageButtons: [...document.querySelectorAll('[data-lang]')]
};

function t(k){ return strings[state.lang][k]; }
function prefLabel(value){ const p=PREFS.find(x=>x[0]===value); if(!p) return t('title'); return state.lang==='zh-Hant'?p[1]:state.lang==='en'?p[2]:p[3]; }
function formatTime(){ try{return new Intl.DateTimeFormat(state.lang,{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',weekday:'short'}).format(new Date());}catch{return '—';} }

function updateLabels(){
  ui.locationType.textContent = state.region ? t('region') : t('type');
  ui.locationName.textContent = state.region ? prefLabel(state.region) : t('title');
  ui.localTime.textContent = formatTime(); ui.newsWindow.textContent=t('window'); ui.regionLabel.textContent=t('region'); ui.headlineLabel.textContent=t('headlines'); ui.sourceNote.textContent=t('source'); ui.mapHint.textContent=t('hint');
  const current=state.region; ui.regionSelect.innerHTML='';
  PREFS.forEach(p=>{const label=state.lang==='zh-Hant'?p[1]:state.lang==='en'?p[2]:p[3]; ui.regionSelect.append(new Option(label,p[0]));});
  ui.regionSelect.value=current;
}

function setNewsState(message, loading=false){ ui.newsList.innerHTML=''; ui.newsState.classList.remove('hidden','loading'); if(loading)ui.newsState.classList.add('loading'); ui.emptyMessage.textContent=message; }
function articleDate(v){ if(!v)return ''; const d=new Date(v); if(Number.isNaN(d.getTime()))return ''; const h=Math.max(1,Math.round((Date.now()-d.getTime())/3600000)); return new Intl.RelativeTimeFormat(state.lang,{numeric:'auto'}).format(-h,'hour'); }

function renderNews(articles){
  const seen=new Set(), list=[];
  for(const a of articles){ const title=(a.title||'').trim(); if(!title||!a.url)continue; const key=title.toLowerCase(); if(seen.has(key))continue; seen.add(key); list.push(a); if(list.length>=10)break; }
  if(!list.length){setNewsState(t('none'));return;}
  ui.newsState.classList.add('hidden'); ui.newsList.innerHTML='';
  list.forEach((a,i)=>{ const li=document.createElement('li'); li.className='news-item'; const num=document.createElement('span'); num.className='news-index'; num.textContent=String(i+1).padStart(2,'0'); const body=document.createElement('div'); body.className='news-body'; const link=document.createElement('a'); link.className='news-title'; link.href=a.url; link.target='_blank'; link.rel='noreferrer'; link.textContent=a.title; const meta=document.createElement('div'); meta.className='news-meta'; const src=document.createElement('span'); src.className='badge'; src.textContent=a.source||'Google News'; meta.append(src); const when=articleDate(a.published); if(when){const s=document.createElement('span');s.textContent=when;meta.append(s);} body.append(link,meta); li.append(num,body); ui.newsList.append(li); });
}

async function fetchNews(){
  setNewsState(t('loading'),true);
  let path='data/countries/jp.json'; if(state.region){const slug=SLUGS[state.region]; if(slug)path=`data/jp/${slug}.json`;}
  try{const r=await fetch(`${path}?v=${Date.now()}`,{cache:'no-store'}); if(!r.ok)throw new Error(r.status); const data=await r.json(); renderNews(Array.isArray(data.articles)?data.articles:[]);}catch(e){console.error(e);setNewsState(t('error'));}
}

function geometryRings(g){ if(!g)return []; if(g.type==='Polygon')return g.coordinates; if(g.type==='MultiPolygon')return g.coordinates.flat(); return []; }
function allPoints(features){ const pts=[]; for(const f of features)for(const ring of geometryRings(f.geometry))for(const p of ring)pts.push(p); return pts; }

function renderMap(features){
  const pts=allPoints(features); const lons=pts.map(p=>p[0]), lats=pts.map(p=>p[1]); const minLon=Math.min(...lons),maxLon=Math.max(...lons),minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const W=900,H=900,pad=36; const sx=(W-pad*2)/(maxLon-minLon), sy=(H-pad*2)/(maxLat-minLat), scale=Math.min(sx,sy); const x0=(W-(maxLon-minLon)*scale)/2, y0=(H-(maxLat-minLat)*scale)/2;
  const project=p=>[x0+(p[0]-minLon)*scale, H-(y0+(p[1]-minLat)*scale)];
  ui.map.setAttribute('viewBox',`0 0 ${W} ${H}`); ui.map.innerHTML='';
  for(const f of features){ const group=document.createElementNS('http://www.w3.org/2000/svg','g'); group.classList.add('prefecture'); group.dataset.value=f.properties.value; group.setAttribute('role','button'); group.setAttribute('aria-label',f.properties.label);
    for(const ring of geometryRings(f.geometry)){ if(ring.length<3)continue; const path=document.createElementNS('http://www.w3.org/2000/svg','path'); const d=ring.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ')+' Z'; path.setAttribute('d',d); group.appendChild(path); }
    group.addEventListener('click',()=>selectRegion(f.properties.value)); group.addEventListener('pointerenter',()=>{ui.mapStatus.textContent=f.properties.label;}); group.addEventListener('pointerleave',()=>{ui.mapStatus.textContent='47 prefectures';}); ui.map.appendChild(group); }
  applySelection(); ui.mapStatus.textContent='47 prefectures';
}

function applySelection(){ ui.map.querySelectorAll('.prefecture').forEach(el=>el.classList.toggle('selected',el.dataset.value===state.region)); }
function selectRegion(value){ state.region=value||''; ui.regionSelect.value=state.region; updateLabels(); applySelection(); fetchNews(); }

async function initMap(){ try{const r=await fetch(`${MAP_URL}?v=2`,{cache:'force-cache'}); if(!r.ok)throw new Error(r.status); const data=await r.json(); state.mapFeatures=data.features||[]; renderMap(state.mapFeatures);}catch(e){console.error(e);ui.mapStatus.textContent='Map unavailable';} }

ui.regionSelect.addEventListener('change',()=>selectRegion(ui.regionSelect.value)); ui.refreshBtn.addEventListener('click',fetchNews);
ui.languageButtons.forEach(b=>b.addEventListener('click',()=>{state.lang=b.dataset.lang;ui.languageButtons.forEach(x=>x.classList.toggle('active',x===b));document.documentElement.lang=state.lang;updateLabels();}));

updateLabels(); initMap(); fetchNews();
