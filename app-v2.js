const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const EARTH_TEXTURE = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-night.jpg';
const GDELT_CONTEXT_URL = 'https://api.gdeltproject.org/api/v2/context/context';

const state = {
  lang: 'zh-Hant',
  country: null,
  region: '',
  countries: [],
  globe: null,
  newsController: null,
  newsRequestId: 0,
  pointerStart: null,
  pointerMoved: false,
  ignoreClickUntil: 0
};

const ui = {
  globe: document.getElementById('globe'),
  globeWrap: document.getElementById('globe-wrap'),
  globeStatus: document.getElementById('globeStatus'),
  globeHint: document.getElementById('globeHint'),
  locationType: document.getElementById('locationType'),
  locationName: document.getElementById('locationName'),
  localTime: document.getElementById('localTime'),
  newsWindow: document.getElementById('newsWindow'),
  regionControls: document.getElementById('regionControls'),
  regionLabel: document.getElementById('regionLabel'),
  regionSelect: document.getElementById('regionSelect'),
  headlineLabel: document.getElementById('headlineLabel'),
  refreshBtn: document.getElementById('refreshBtn'),
  newsState: document.getElementById('newsState'),
  emptyMessage: document.getElementById('emptyMessage'),
  newsList: document.getElementById('newsList'),
  sourceNote: document.getElementById('sourceNote'),
  languageButtons: [...document.querySelectorAll('[data-lang]')]
};

const strings = {
  'zh-Hant': {
    choose:'選一個國家', hint:'拖曳旋轉 · 滾輪縮放 · 輕點國家', world:'世界', country:'國家', state:'州', prefecture:'都道府縣', region:'地區', all:'全部',
    headlines:'今日新聞', window:'最近 24 小時', intro:'轉動地球，輕點一個國家看看今天發生什麼。', loading:'正在搜尋與這個地點直接相關的新聞…',
    none:'最近 24 小時找不到足夠的地點相關新聞。', error:'新聞服務目前沒有回應，請稍後重試。', source:'新聞來源：GDELT Context。搜尋文章中實際提到的地點。', live:'即時'
  },
  en: {
    choose:'Choose a country', hint:'Drag to rotate · Scroll to zoom · Tap a country', world:'WORLD', country:'COUNTRY', state:'STATE', prefecture:'PREFECTURE', region:'Region', all:'All',
    headlines:"Today's news", window:'Last 24 hours', intro:'Spin the globe and tap a country to see what is happening today.', loading:'Searching for stories that directly mention this location…',
    none:'No sufficiently location-relevant stories were found in the last 24 hours.', error:'The news service is not responding. Please try again later.', source:'News source: GDELT Context. Search is based on locations mentioned in article text.', live:'Live'
  },
  ja: {
    choose:'国を選択', hint:'ドラッグで回転 · スクロールで拡大 · 国をタップ', world:'世界', country:'国', state:'州', prefecture:'都道府県', region:'地域', all:'全国',
    headlines:'今日のニュース', window:'過去24時間', intro:'地球を回して国をタップすると、今日のニュースを確認できます。', loading:'記事本文でこの地域に直接言及しているニュースを検索中…',
    none:'過去24時間に十分な地域関連ニュースが見つかりませんでした。', error:'ニュースサービスが応答していません。後でもう一度お試しください。', source:'ニュース提供：GDELT Context。記事本文中の地名言及を検索します。', live:'ライブ'
  }
};

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

const JP_PREFECTURES = [
  ['北海道','Hokkaido'],['青森県','Aomori'],['岩手県','Iwate'],['宮城県','Miyagi'],['秋田県','Akita'],['山形県','Yamagata'],['福島県','Fukushima'],['茨城県','Ibaraki'],['栃木県','Tochigi'],['群馬県','Gunma'],['埼玉県','Saitama'],['千葉県','Chiba'],['東京都','Tokyo'],['神奈川県','Kanagawa'],['新潟県','Niigata'],['富山県','Toyama'],['石川県','Ishikawa'],['福井県','Fukui'],['山梨県','Yamanashi'],['長野県','Nagano'],['岐阜県','Gifu'],['静岡県','Shizuoka'],['愛知県','Aichi'],['三重県','Mie'],['滋賀県','Shiga'],['京都府','Kyoto'],['大阪府','Osaka'],['兵庫県','Hyogo'],['奈良県','Nara'],['和歌山県','Wakayama'],['鳥取県','Tottori'],['島根県','Shimane'],['岡山県','Okayama'],['広島県','Hiroshima'],['山口県','Yamaguchi'],['徳島県','Tokushima'],['香川県','Kagawa'],['愛媛県','Ehime'],['高知県','Kochi'],['福岡県','Fukuoka'],['佐賀県','Saga'],['長崎県','Nagasaki'],['熊本県','Kumamoto'],['大分県','Oita'],['宮崎県','Miyazaki'],['鹿児島県','Kagoshima'],['沖縄県','Okinawa']
];

const TIMEZONES = {
  Japan:'Asia/Tokyo', Taiwan:'Asia/Taipei', 'United States of America':'America/New_York', 'United States':'America/New_York', China:'Asia/Shanghai',
  'United Kingdom':'Europe/London', France:'Europe/Paris', Germany:'Europe/Berlin', Canada:'America/Toronto', Australia:'Australia/Sydney', India:'Asia/Kolkata',
  'South Korea':'Asia/Seoul', Singapore:'Asia/Singapore'
};

function t(k){ return strings[state.lang][k]; }
function rawName(f){ return f?.properties?.name || ''; }
function displayName(f){
  const n = rawName(f);
  const names = {
    'United States of America':{'zh-Hant':'美國',en:'United States',ja:'アメリカ'},
    'United States':{'zh-Hant':'美國',en:'United States',ja:'アメリカ'},
    Japan:{'zh-Hant':'日本',en:'Japan',ja:'日本'},
    Taiwan:{'zh-Hant':'台灣',en:'Taiwan',ja:'台湾'}
  };
  return names[n]?.[state.lang] || n;
}
function searchCountryName(){ const n=rawName(state.country); return n==='United States of America'?'United States':n; }
function isUS(){ return ['United States of America','United States'].includes(rawName(state.country)); }
function isJapan(){ return rawName(state.country)==='Japan'; }

function formatLocalTime(f){
  const tz=TIMEZONES[rawName(f)];
  if(!tz) return '—';
  try { return new Intl.DateTimeFormat(state.lang,{timeZone:tz,hour:'2-digit',minute:'2-digit',weekday:'short'}).format(new Date()); }
  catch { return '—'; }
}

function updateLabels(){
  ui.globeHint.textContent=t('hint');
  ui.newsWindow.textContent=t('window');
  ui.regionLabel.textContent=t('region');
  ui.headlineLabel.textContent=t('headlines');
  ui.sourceNote.textContent=t('source');
  if(!state.country){
    ui.locationType.textContent=t('world');
    ui.locationName.textContent=t('choose');
    ui.emptyMessage.textContent=t('intro');
  } else {
    ui.locationName.textContent=displayName(state.country);
    updateRegionControls(false);
  }
}

function updateRegionControls(reset=true){
  if(!state.country) return;
  if(reset) state.region='';
  let regions=null;
  if(isUS()) regions=US_STATES.map(x=>({value:x,label:x}));
  if(isJapan()) regions=JP_PREFECTURES.map(([label,value])=>({value,label}));
  ui.locationType.textContent=state.region?(isUS()?t('state'):t('prefecture')):t('country');
  if(!regions){ ui.regionControls.classList.add('hidden'); state.region=''; return; }
  ui.regionControls.classList.remove('hidden');
  const current=state.region;
  ui.regionSelect.innerHTML='';
  ui.regionSelect.append(new Option(t('all'),''));
  regions.forEach(r=>ui.regionSelect.append(new Option(r.label,r.value)));
  ui.regionSelect.value=current;
}

function setNewsState(message,loading=false){
  ui.newsList.innerHTML='';
  ui.newsState.classList.remove('hidden','loading');
  if(loading) ui.newsState.classList.add('loading');
  ui.emptyMessage.textContent=message;
}

function articleDate(a){
  const v=a.seendate||a.date||a.datetime||'';
  if(!v) return '';
  const s=/^\d{8}T\d{6}Z$/.test(v)?`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}Z`:v;
  const d=new Date(s);
  if(Number.isNaN(d.getTime())) return '';
  const h=Math.max(1,Math.round((Date.now()-d.getTime())/3600000));
  return new Intl.RelativeTimeFormat(state.lang,{numeric:'auto'}).format(-h,'hour');
}

function renderNews(articles){
  const seen=new Set(), domains=new Map(), unique=[];
  for(const a of articles){
    const title=(a.title||'').trim();
    const url=a.url||a.documenturl||'';
    if(!title||!url) continue;
    const key=title.toLowerCase();
    if(seen.has(key)) continue;
    const domain=a.domain||(()=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '';}})();
    const count=domains.get(domain)||0;
    if(domain && count>=2) continue;
    seen.add(key); domains.set(domain,count+1); unique.push({...a,url,domain});
    if(unique.length>=8) break;
  }
  if(!unique.length){ setNewsState(t('none')); return; }
  ui.newsState.classList.add('hidden');
  ui.newsList.innerHTML='';
  unique.forEach((a,i)=>{
    const li=document.createElement('li'); li.className='news-item';
    const num=document.createElement('span'); num.className='news-index'; num.textContent=String(i+1).padStart(2,'0');
    const body=document.createElement('div'); body.className='news-body';
    const link=document.createElement('a'); link.className='news-title'; link.href=a.url; link.target='_blank'; link.rel='noreferrer'; link.textContent=a.title;
    const meta=document.createElement('div'); meta.className='news-meta';
    const source=document.createElement('span'); source.className='badge'; source.textContent=a.domain||a.sourcecountry||t('live'); meta.append(source);
    const when=articleDate(a); if(when){ const s=document.createElement('span'); s.textContent=when; meta.append(s); }
    if(a.language){ const s=document.createElement('span'); s.textContent=a.language; meta.append(s); }
    body.append(link,meta); li.append(num,body); ui.newsList.append(li);
  });
}

async function contextRequest(query,signal){
  const p=new URLSearchParams({query,mode:'artlist',format:'json',maxrecords:'25',timespan:'24H'});
  const r=await fetch(`${GDELT_CONTEXT_URL}?${p.toString()}`,{signal,cache:'no-store'});
  if(!r.ok) throw new Error(`GDELT Context ${r.status}`);
  const text=await r.text();
  if(!text.trim()) throw new Error('Empty GDELT response');
  return JSON.parse(text);
}

async function fetchNews(){
  if(!state.country) return;
  if(state.newsController) state.newsController.abort();
  const controller=new AbortController();
  state.newsController=controller;
  const requestId=++state.newsRequestId;
  setNewsState(t('loading'),true);
  const country=searchCountryName();
  const query=state.region?`\"${state.region}\" \"${country}\"`:`\"${country}\"`;
  const timeout=setTimeout(()=>controller.abort(),7000);
  try {
    const data=await contextRequest(query,controller.signal);
    if(requestId!==state.newsRequestId) return;
    const articles=Array.isArray(data.articles)?data.articles:(Array.isArray(data.results)?data.results:[]);
    renderNews(articles);
  } catch(e){
    if(requestId!==state.newsRequestId) return;
    console.error(e);
    setNewsState(e.name==='AbortError'?t('error'):t('error'));
  } finally {
    clearTimeout(timeout);
  }
}

function refreshPolygonColors(){
  if(!state.globe) return;
  state.globe.polygonCapColor(d=>d===state.country?'rgba(111,211,255,0.62)':'rgba(64,95,118,0.16)');
}

function selectCountry(f){
  if(performance.now()<state.ignoreClickUntil) return;
  state.country=f;
  state.region='';
  ui.locationName.textContent=displayName(f);
  ui.localTime.textContent=formatLocalTime(f);
  updateRegionControls(true);
  refreshPolygonColors();
  setTimeout(fetchNews,0);
}

function installDragGuard(){
  ui.globe.addEventListener('pointerdown',e=>{
    state.pointerStart={x:e.clientX,y:e.clientY};
    state.pointerMoved=false;
    if(state.globe) state.globe.controls().autoRotate=false;
  },{passive:true});
  ui.globe.addEventListener('pointermove',e=>{
    if(!state.pointerStart) return;
    const dx=e.clientX-state.pointerStart.x, dy=e.clientY-state.pointerStart.y;
    if(dx*dx+dy*dy>64) state.pointerMoved=true;
  },{passive:true});
  const finish=()=>{
    if(state.pointerMoved) state.ignoreClickUntil=performance.now()+400;
    state.pointerStart=null;
    state.pointerMoved=false;
  };
  ui.globe.addEventListener('pointerup',finish,{passive:true});
  ui.globe.addEventListener('pointercancel',finish,{passive:true});
}

async function initGlobe(){
  try {
    const r=await fetch(WORLD_TOPO_URL,{cache:'force-cache'});
    if(!r.ok) throw new Error('World atlas unavailable');
    const world=await r.json();
    const collection=topojson.feature(world,world.objects.countries);
    state.countries=collection.features.filter(f=>f.properties?.name!=='Antarctica');
    const coarsePointer=window.matchMedia('(pointer: coarse)').matches;
    state.globe=Globe()(ui.globe)
      .backgroundColor('rgba(0,0,0,0)')
      .showGlobe(true)
      .globeImageUrl(EARTH_TEXTURE)
      .showAtmosphere(!coarsePointer)
      .atmosphereColor('#6fd3ff')
      .atmosphereAltitude(0.08)
      .polygonsData(state.countries)
      .polygonAltitude(0.0015)
      .polygonCapColor(()=> 'rgba(64,95,118,0.16)')
      .polygonSideColor(()=> 'rgba(16,30,44,0.10)')
      .polygonStrokeColor(()=> 'rgba(205,226,240,0.42)')
      .polygonLabel(d=>`<div style="padding:6px 8px;font:12px -apple-system,sans-serif"><b>${displayName(d)}</b></div>`)
      .onPolygonClick(selectCountry);

    try { state.globe.renderer().setPixelRatio(1); } catch(e) { console.warn('pixel ratio limit unavailable',e); }
    const c=state.globe.controls();
    c.autoRotate=true; c.autoRotateSpeed=0.16; c.enableDamping=true; c.dampingFactor=0.06; c.enablePan=false;
    state.globe.pointOfView({lat:25,lng:135,altitude:2.10},0);
    resizeGlobe();
    installDragGuard();

    const canvas=ui.globe.querySelector('canvas');
    if(canvas){
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ui.globeStatus.textContent='WebGL recovering…';});
      canvas.addEventListener('webglcontextrestored',()=>{ui.globeStatus.textContent=`${state.countries.length} countries`;resizeGlobe();});
    }
    ui.globeStatus.textContent=`${state.countries.length} countries`;
  } catch(e){
    console.error(e);
    ui.globeStatus.textContent='Map unavailable';
  }
}

function resizeGlobe(){
  if(!state.globe) return;
  const w=Math.max(1,ui.globeWrap.clientWidth), h=Math.max(1,ui.globeWrap.clientHeight);
  state.globe.width(w); state.globe.height(h);
}

let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resizeGlobe,180);});
ui.regionSelect.addEventListener('change',()=>{state.region=ui.regionSelect.value;updateRegionControls(false);setTimeout(fetchNews,0);});
ui.refreshBtn.addEventListener('click',()=>setTimeout(fetchNews,0));
ui.languageButtons.forEach(b=>b.addEventListener('click',()=>{
  state.lang=b.dataset.lang;
  ui.languageButtons.forEach(x=>x.classList.toggle('active',x===b));
  document.documentElement.lang=state.lang;
  updateLabels();
  if(state.country){ui.locationName.textContent=displayName(state.country);ui.localTime.textContent=formatLocalTime(state.country);}
}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden) setTimeout(resizeGlobe,100);});

updateLabels();
initGlobe();
