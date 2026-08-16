(() => {
  const ENDPOINT = 'https://world-news-refresh.kozakurayuki.workers.dev/keyword';
  const baseFetchNews = fetchNews.bind(window);
  let keyword = String(window.initialWorldNewsKeyword || '').trim().slice(0, 80);
  let requestId = 0;
  let activeController = null;
  let activeKey = '';
  let activePromise = null;
  const REQUEST_TIMEOUT_MS = 15000;

  const TEXT = {
    en:{ label:'Keyword', placeholder:'One keyword', apply:'Search', clear:'Clear', searching:'Searching keyword news…', none:'No news found for this keyword in this area.', error:'Keyword search unavailable.', active:'Keyword', try:'Try', examples:['AI','earthquake','World Cup','election'] },
    'zh-Hant':{ label:'關鍵字', placeholder:'輸入一個關鍵字', apply:'搜尋', clear:'清除', searching:'搜尋關鍵字新聞中…', none:'這個地區目前找不到此關鍵字的新聞。', error:'關鍵字搜尋目前無法使用。', active:'關鍵字', try:'試試', examples:['AI','地震','世界盃','選舉'] },
    ja:{ label:'キーワード', placeholder:'キーワードを1つ', apply:'検索', clear:'クリア', searching:'キーワードニュースを検索中…', none:'この地域では、このキーワードのニュースが見つかりません。', error:'キーワード検索を利用できません。', active:'キーワード', try:'例', examples:['AI','地震','ワールドカップ','選挙'] }
  };

  const root = document.createElement('form');
  root.className = 'keyword-control';
  root.setAttribute('role','search');
  root.innerHTML = `
    <div class="keyword-main-row">
      <span class="keyword-label"></span>
      <input class="keyword-input" type="search" maxlength="80" autocomplete="off" spellcheck="false" />
      <button class="keyword-apply" type="submit"></button>
      <button class="keyword-clear" type="button" aria-label="Clear keyword">×</button>
    </div>
    <div class="keyword-examples"></div>
  `;
  ui.globeWrap.appendChild(root);

  const label = root.querySelector('.keyword-label');
  const input = root.querySelector('.keyword-input');
  const apply = root.querySelector('.keyword-apply');
  const clear = root.querySelector('.keyword-clear');
  const examples = root.querySelector('.keyword-examples');

  const style = document.createElement('style');
  style.textContent = `
    .keyword-control{position:absolute;z-index:9;left:24px;bottom:62px;display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:7px 8px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(5,7,11,.78);backdrop-filter:blur(14px);box-shadow:0 8px 28px rgba(0,0,0,.22)}
    .keyword-main-row{display:flex;align-items:center;gap:6px}
    .keyword-control.active{border-color:rgba(111,211,255,.45);box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px rgba(111,211,255,.07) inset}
    .keyword-label{color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .keyword-input{width:150px;min-width:0;border:0;border-bottom:1px solid rgba(255,255,255,.14);outline:0;padding:5px 3px;color:var(--text);background:transparent;font:inherit;font-size:12px}
    .keyword-input:focus{border-bottom-color:rgba(111,211,255,.7)}
    .keyword-apply,.keyword-clear,.keyword-example{border:1px solid rgba(255,255,255,.14);border-radius:999px;color:var(--text);background:rgba(255,255,255,.05);cursor:pointer;font:inherit;font-size:10px;padding:5px 8px}
    .keyword-clear{display:none;width:25px;height:25px;padding:0;font-size:15px;line-height:1}
    .keyword-control.active .keyword-clear{display:block}
    .keyword-examples{display:flex;align-items:center;gap:5px;flex-wrap:wrap;color:var(--muted);font-size:9px;line-height:1}
    .keyword-example{padding:3px 6px;color:var(--muted);background:rgba(255,255,255,.025)}
    .keyword-example:hover{color:var(--accent);border-color:rgba(111,211,255,.35)}
    @media(max-width:840px){.keyword-control{left:14px;bottom:56px}.keyword-input{width:128px}}
    @media(max-width:430px){.keyword-control{right:14px;left:14px;bottom:55px}.keyword-label{display:none}.keyword-input{width:auto;flex:1}.keyword-apply{padding:6px 9px}.keyword-examples{overflow-x:auto;flex-wrap:nowrap;padding-bottom:1px}.keyword-example{white-space:nowrap}}
  `;
  document.head.appendChild(style);

  function copy(){ return TEXT[state.lang] || TEXT.en; }
  function renderExamples(){
    const c=copy();
    examples.innerHTML='';
    const prefix=document.createElement('span');
    prefix.textContent=`${c.try}:`;
    examples.appendChild(prefix);
    c.examples.forEach(value=>{
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='keyword-example';
      chip.textContent=value;
      chip.addEventListener('click',()=>{
        setKeyword(value);
        if(state.country) keywordFetch();
        input.blur();
      });
      examples.appendChild(chip);
    });
  }
  function updateCopy(){
    const c=copy();
    label.textContent=c.label;
    input.placeholder=c.placeholder;
    apply.textContent=c.apply;
    clear.title=c.clear;
    clear.setAttribute('aria-label',c.clear);
    root.classList.toggle('active',Boolean(keyword));
    renderExamples();
  }

  function japaneseRegion(){
    if(!state.region) return '';
    if(isJapan()){
      const pair=JP_PREFECTURES.find(([,value])=>value===state.region);
      return pair?.[0] || state.region;
    }
    return state.region;
  }

  function countryName(){
    const raw=rawName(state.country);
    return raw==='United States of America'?'United States':raw;
  }

  function requestSnapshot(){
    const snapshot={country:countryName(),region:japaneseRegion(),keyword};
    snapshot.key=JSON.stringify([snapshot.country,snapshot.region,snapshot.keyword]);
    return snapshot;
  }

  function formatError(error){
    const name=String(error?.name || 'Error');
    const message=String(error?.message || error || '').trim();
    if(name==='AbortError') return 'AbortError';
    return message ? `${name}: ${message}` : name;
  }

  function keywordFetch(){
    if(!state.country || !keyword) return baseFetchNews();

    const snapshot=requestSnapshot();
    if(activePromise && activeKey===snapshot.key){
      console.debug('Keyword search coalesced',snapshot.key);
      return activePromise;
    }

    // Only a genuinely different location/keyword supersedes the active request.
    if(activeController) activeController.abort();
    const id=++requestId;
    const controller=new AbortController();
    activeController=controller;
    activeKey=snapshot.key;
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    const c=copy();

    setNewsState(c.searching,true);
    ui.newsWindow.textContent=`${c.active}: ${snapshot.keyword}`;
    ui.globeStatus.textContent=c.searching;

    const promise=(async()=>{
      try{
        const response=await fetch(ENDPOINT,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({country:snapshot.country,region:snapshot.region,keyword:snapshot.keyword}),
          signal:controller.signal
        });
        const data=await response.json().catch(()=>({}));
        if(id!==requestId) return;
        if(!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);

        if(!Array.isArray(data.articles) || !data.articles.length){
          setNewsState(c.none);
          ui.globeStatus.textContent=`0 · ${snapshot.keyword}`;
          return;
        }

        renderStaticNews(data.articles);
        ui.globeStatus.textContent=`${data.article_count || data.articles.length} · ${snapshot.keyword}`;
      }catch(error){
        if(id!==requestId) return;
        const detail=formatError(error);
        window.lastKeywordError={detail,key:snapshot.key,at:new Date().toISOString()};
        console.error('Keyword news failed',window.lastKeywordError,error);
        setNewsState(c.error);
        ui.newsWindow.textContent=`${c.active}: ${snapshot.keyword}`;
        ui.globeStatus.textContent=`${c.error} · ${detail}`;
      }finally{
        clearTimeout(timeout);
        if(activeController===controller) activeController=null;
        if(activeKey===snapshot.key){
          activeKey='';
          activePromise=null;
        }
      }
    })();

    activePromise=promise;
    return promise;
  }

  fetchNews = async function(){
    if(keyword) return keywordFetch();
    return baseFetchNews();
  };

  function setKeyword(value){
    keyword=String(value||'').trim().slice(0,80);
    input.value=keyword;
    window.worldNewsKeyword=keyword;
    updateCopy();
    window.syncWorldNewsUrl?.(true);
  }

  root.addEventListener('submit',event=>{
    event.preventDefault();
    setKeyword(input.value);
    if(state.country) keywordFetch();
    input.blur();
  });

  clear.addEventListener('click',()=>{
    if(activeController){
      ++requestId;
      activeController.abort();
      activeController=null;
      activeKey='';
      activePromise=null;
    }
    setKeyword('');
    if(state.country) baseFetchNews();
    input.focus();
  });

  const liveRefresh=document.getElementById('refreshNowBtn');
  liveRefresh?.addEventListener('click',event=>{
    if(!keyword) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    keywordFetch();
  },true);

  ui.languageButtons.forEach(button=>button.addEventListener('click',()=>setTimeout(updateCopy,0)));

  setKeyword(keyword);
  window.keywordNewsRefresh=keywordFetch;
})();
