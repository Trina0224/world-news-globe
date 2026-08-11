const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json';
const EARTH_TEXTURE = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-night.jpg';
const GDELT_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

const state = { lang: 'zh-Hant', country: null, region: '', countries: [], globe: null };

const ui = {
  globe: document.getElementById('globe'), globeWrap: document.getElementById('globe-wrap'), globeStatus: document.getElementById('globeStatus'),
  globeHint: document.getElementById('globeHint'), locationType: document.getElementById('locationType'), locationName: document.getElementById('locationName'),
  localTime: document.getElementById('localTime'), newsWindow: document.getElementById('newsWindow'), regionControls: document.getElementById('regionControls'),
  regionLabel: document.getElementById('regionLabel'), regionSelect: document.getElementById('regionSelect'), headlineLabel: document.getElementById('headlineLabel'),
  refreshBtn: document.getElementById('refreshBtn'), newsState: document.getElementById('newsState'), emptyMessage: document.getElementById('emptyMessage'),
  newsList: document.getElementById('newsList'), sourceNote: document.getElementById('sourceNote'), languageButtons: [...document.querySelectorAll('[data-lang]')]
};

const strings = {
  'zh-Hant': { choose:'選一個國家',hint:'拖曳旋轉 · 滾輪縮放 · 點擊國家',world:'世界',country:'國家',state:'州',prefecture:'都道府縣',region:'地區',all:'全部',headlines:'今日新聞',window:'最近 24 小時',intro:'轉動地球，點一個國家看看今天發生什麼。',loading:'正在整理當地最新新聞…',none:'最近 24 小時找不到新聞，請換個地區或稍後再試。',error:'新聞來源目前無法連線。',source:'新聞來源：GDELT。標題保留原文。',live:'即時' },
  en: { choose:'Choose a country',hint:'Drag to rotate · Scroll to zoom · Click a country',world:'WORLD',country:'COUNTRY',state:'STATE',prefecture:'PREFECTURE',region:'Region',all:'All',headlines:"Today's news",window:'Last 24 hours',intro:'Spin the globe and choose a country to see what is happening today.',loading:'Finding the latest local news…',none:'No recent stories found. Try another region or refresh later.',error:'The news source is currently unavailable.',source:'News source: GDELT. Headlines remain in their original language.',live:'Live' },
  ja: { choose:'国を選択',hint:'ドラッグで回転 · スクロールで拡大 · 国をクリック',world:'世界',country:'国',state:'州',prefecture:'都道府県',region:'地域',all:'全国',headlines:'今日のニュース',window:'過去24時間',intro:'地球を回して国を選ぶと、今日のニュースを確認できます。',loading:'最新の現地ニュースを取得中…',none:'過去24時間の記事が見つかりません。別の地域を選ぶか、後でもう一度お試しください。',error:'ニュースソースに接続できません。',source:'ニュース提供：GDELT。見出しは原文のまま表示します。',live:'ライブ' }
};

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

const JP_PREFECTURES = [
 ['北海道','Hokkaido'],['青森県','Aomori'],['岩手県','Iwate'],['宮城県','Miyagi'],['秋田県','Akita'],['山形県','Yamagata'],['福島県','Fukushima'],['茨城県','Ibaraki'],['栃木県','Tochigi'],['群馬県','Gunma'],['埼玉県','Saitama'],['千葉県','Chiba'],['東京都','Tokyo'],['神奈川県','Kanagawa'],['新潟県','Niigata'],['富山県','Toyama'],['石川県','Ishikawa'],['福井県','Fukui'],['山梨県','Yamanashi'],['長野県','Nagano'],['岐阜県','Gifu'],['静岡県','Shizuoka'],['愛知県','Aichi'],['三重県','Mie'],['滋賀県','Shiga'],['京都府','Kyoto'],['大阪府','Osaka'],['兵庫県','Hyogo'],['奈良県','Nara'],['和歌山県','Wakayama'],['鳥取県','Tottori'],['島根県','Shimane'],['岡山県','Okayama'],['広島県','Hiroshima'],['山口県','Yamaguchi'],['徳島県','Tokushima'],['香川県','Kagawa'],['愛媛県','Ehime'],['高知県','Kochi'],['福岡県','Fukuoka'],['佐賀県','Saga'],['長崎県','Nagasaki'],['熊本県','Kumamoto'],['大分県','Oita'],['宮崎県','Miyazaki'],['鹿児島県','Kagoshima'],['沖縄県','Okinawa']
];

const COUNTRY_ALIASES = {
  'United States of America':'UnitedStates', 'United States':'UnitedStates', 'Korea, Republic of':'SouthKorea', 'South Korea':'SouthKorea',
  'Russian Federation':'Russia', 'Viet Nam':'Vietnam', 'Syrian Arab Republic':'Syria', 'Iran (Islamic Republic of)':'Iran', 'United Republic of Tanzania':'Tanzania',
  'Czech Republic':'CzechRepublic', 'Democratic Republic of the Congo':'DemocraticRepublicoftheCongo', 'Republic of the Congo':'RepublicoftheCongo',
  'United Kingdom':'UnitedKingdom', 'United Arab Emirates':'UnitedArabEmirates', 'Saudi Arabia':'SaudiArabia', 'New Zealand':'NewZealand', 'South Africa':'SouthAfrica'
};

const TIMEZONES = { Japan:'Asia/Tokyo', Taiwan:'Asia/Taipei', 'United States of America':'America/New_York', 'United States':'America/New_York', China:'Asia/Shanghai', 'United Kingdom':'Europe/London', France:'Europe/Paris', Germany:'Europe/Berlin', Canada:'America/Toronto', Australia:'Australia/Sydney', India:'Asia/Kolkata', 'South Korea':'Asia/Seoul', Singapore:'Asia/Singapore' };

function t(k){ return strings[state.lang][k]; }
function rawName(f){ return f?.properties?.name || ''; }
function displayName(f){
  const n = rawName(f);
  const common = {'United States of America':{ 'zh-Hant':'美國', en:'United States', ja:'アメリカ'}, Japan:{'zh-Hant':'日本',en:'Japan',ja:'日本'}, Taiwan:{'zh-Hant':'台灣',en:'Taiwan',ja:'台湾'}};
  return common[n]?.[state.lang] || n;
}
function countryToken(f){ const n=rawName(f); return COUNTRY_ALIASES[n] || n.replace(/[^A-Za-z]/g,''); }
function isUS(){ return ['United States of America','United States'].includes(rawName(state.country)); }
function isJapan(){ return rawName(state.country)==='Japan'; }
function formatLocalTime(f){ const tz=TIMEZONES[rawName(f)]; if(!tz)return '—'; try{return new Intl.DateTimeFormat(state.lang,{timeZone:tz,hour:'2-digit',minute:'2-digit',weekday:'short'}).format(new Date());}catch{return '—';} }

function updateLabels(){
  ui.globeHint.textContent=t('hint'); ui.newsWindow.textContent=t('window'); ui.regionLabel.textContent=t('region'); ui.headlineLabel.textContent=t('headlines'); ui.sourceNote.textContent=t('source');
  if(!state.country){ ui.locationType.textContent=t('world'); ui.locationName.textContent=t('choose'); ui.emptyMessage.textContent=t('intro'); }
  else { ui.locationName.textContent=displayName(state.country); updateRegionControls(false); }
}

function updateRegionControls(reset=true){
  if(!state.country)return;
  if(reset) state.region='';
  let regions=null;
  if(isUS()) regions=US_STATES.map(x=>({value:x,label:x}));
  if(isJapan()) regions=JP_PREFECTURES.map(([label,value])=>({value,label}));
  ui.locationType.textContent = state.region ? (isUS()?t('state'):t('prefecture')) : t('country');
  if(!regions){ ui.regionControls.classList.add('hidden'); state.region=''; return; }
  ui.regionControls.classList.remove('hidden');
  const current=state.region; ui.regionSelect.innerHTML='';
  ui.regionSelect.append(new Option(t('all'),''));
  regions.forEach(r=>ui.regionSelect.append(new Option(r.label,r.value)));
  ui.regionSelect.value=current;
}

function setNewsState(message,loading=false){ ui.newsList.innerHTML=''; ui.newsState.classList.remove('hidden','loading'); if(loading)ui.newsState.classList.add('loading'); ui.emptyMessage.textContent=message; }
function articleDate(a){
  const v=a.seendate||a.date||''; if(!v)return '';
  const s=/^\d{8}T\d{6}Z$/.test(v)?`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}Z`:v;
  const d=new Date(s); if(Number.isNaN(d.getTime()))return '';
  const hours=Math.max(1,Math.round((Date.now()-d.getTime())/3600000)); return new Intl.RelativeTimeFormat(state.lang,{numeric:'auto'}).format(-hours,'hour');
}
function renderNews(articles){
  const seen=new Set(); const unique=articles.filter(a=>{const k=(a.title||'').trim().toLowerCase(); if(!k||seen.has(k))return false; seen.add(k); return true;}).slice(0,8);
  if(!unique.length){ setNewsState(t('none')); return; }
  ui.newsState.classList.add('hidden'); ui.newsList.innerHTML='';
  unique.forEach((a,i)=>{
    const li=document.createElement('li'); li.className='news-item';
    const num=document.createElement('span'); num.className='news-index'; num.textContent=String(i+1).padStart(2,'0');
    const body=document.createElement('div'); body.className='news-body';
    const link=document.createElement('a'); link.className='news-title'; link.href=a.url; link.target='_blank'; link.rel='noreferrer'; link.textContent=a.title;
    const meta=document.createElement('div'); meta.className='news-meta';
    const source=document.createElement('span'); source.className='badge'; source.textContent=a.domain||a.sourcecountry||t('live'); meta.append(source);
    const when=articleDate(a); if(when){const s=document.createElement('span');s.textContent=when;meta.append(s);} if(a.language){const s=document.createElement('span');s.textContent=a.language;meta.append(s);}
    body.append(link,meta); li.append(num,body); ui.newsList.append(li);
  });
}

async function gdeltRequest(query,maxrecords='50'){
  const p=new URLSearchParams({query,mode:'ArtList',maxrecords,format:'json',sort:'DateDesc',timespan:'24h'});
  const r=await fetch(`${GDELT_URL}?${p.toString()}`); if(!r.ok)throw new Error(`GDELT ${r.status}`); return r.json();
}

async function fetchNews(){
  if(!state.country)return; setNewsState(t('loading'),true);
  const base=`sourcecountry:${countryToken(state.country)}`;
  const query=state.region?`${base} "${state.region}"`:base;
  try{
    let data=await gdeltRequest(query); let articles=Array.isArray(data.articles)?data.articles:[];
    if(!articles.length && state.region){ data=await gdeltRequest(base,'30'); articles=Array.isArray(data.articles)?data.articles:[]; }
    renderNews(articles);
  }catch(e){ console.error(e); setNewsState(t('error')); }
}

function recolor(){
  if(!state.globe)return;
  state.globe
    .polygonAltitude(d=>d===state.country?0.018:0.006)
    .polygonCapColor(d=>d===state.country?'rgba(111,211,255,0.72)':'rgba(64,95,118,0.30)')
    .polygonSideColor(d=>d===state.country?'rgba(111,211,255,0.28)':'rgba(16,30,44,0.28)')
    .polygonStrokeColor(()=> 'rgba(205,226,240,0.55)');
}

function selectCountry(f){
  state.country=f; state.region=''; ui.locationName.textContent=displayName(f); ui.localTime.textContent=formatLocalTime(f); updateRegionControls(true); recolor(); fetchNews();
}

async function initGlobe(){
  try{
    const r=await fetch(GEOJSON_URL); if(!r.ok)throw new Error('GeoJSON unavailable'); const geo=await r.json();
    state.countries=geo.features.filter(f=>f.properties?.name!=='Antarctica');
    state.globe=Globe()(ui.globe)
      .backgroundColor('rgba(0,0,0,0)').showGlobe(true).globeImageUrl(EARTH_TEXTURE)
      .showAtmosphere(true).atmosphereColor('#6fd3ff').atmosphereAltitude(0.12)
      .polygonsData(state.countries).polygonAltitude(0.006)
      .polygonCapColor(()=> 'rgba(64,95,118,0.30)').polygonSideColor(()=> 'rgba(16,30,44,0.28)').polygonStrokeColor(()=> 'rgba(205,226,240,0.55)')
      .polygonLabel(d=>`<div style="padding:6px 8px;font:12px -apple-system,sans-serif"><b>${displayName(d)}</b></div>`)
      .onPolygonHover(d=>{ui.globe.style.cursor=d?'pointer':'grab'; state.globe.polygonAltitude(p=>p===d||p===state.country?0.018:0.006);})
      .onPolygonClick(selectCountry);
    const c=state.globe.controls(); c.autoRotate=true; c.autoRotateSpeed=0.24; c.enableDamping=true; c.dampingFactor=0.08;
    state.globe.pointOfView({lat:25,lng:135,altitude:2.05},0); resizeGlobe();
    const stop=()=>{ if(state.globe) state.globe.controls().autoRotate=false; }; ui.globe.addEventListener('pointerdown',stop,{once:true}); ui.globe.addEventListener('wheel',stop,{once:true,passive:true});
    ui.globeStatus.textContent=`${state.countries.length} countries`;
  }catch(e){console.error(e);ui.globeStatus.textContent='Map unavailable';}
}

function resizeGlobe(){ if(state.globe){state.globe.width(ui.globeWrap.clientWidth);state.globe.height(ui.globeWrap.clientHeight);} }
ui.regionSelect.addEventListener('change',()=>{state.region=ui.regionSelect.value;updateRegionControls(false);fetchNews();});
ui.refreshBtn.addEventListener('click',fetchNews); window.addEventListener('resize',resizeGlobe);
ui.languageButtons.forEach(b=>b.addEventListener('click',()=>{state.lang=b.dataset.lang;ui.languageButtons.forEach(x=>x.classList.toggle('active',x===b));document.documentElement.lang=state.lang;updateLabels();if(state.country){ui.locationName.textContent=displayName(state.country);ui.localTime.textContent=formatLocalTime(state.country);}}));
updateLabels(); initGlobe();
