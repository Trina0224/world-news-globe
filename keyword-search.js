(() => {
  const ENDPOINT = 'https://world-news-refresh.kozakurayuki.workers.dev/keyword';
  const baseFetchNews = fetchNews.bind(window);
  let keyword = String(window.initialWorldNewsKeyword || '').trim().slice(0, 80);
  let requestId = 0;
  let active = null;
  window.keywordSearchVersion = '2026-10-17.1';
  const diagnostics = [];
  window.keywordDiagnostics = diagnostics;
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

  const feedback = document.createElement('div');
  feedback.className = 'keyword-feedback';
  feedback.setAttribute('role', 'status');
  feedback.style.cssText = 'max-width:340px;font-size:11px;line-height:1.4;color:var(--muted);white-space:normal;';
  root.appendChild(feedback);
  const EXTRA = {
    en:{used:'Search term',fallback:'Local translation unavailable; searching the original term.',stale:'Cached keyword results',timeout:'Search timed out. Press Search to retry.',invalid:'Invalid search response.'},
    'zh-Hant':{used:'實際搜尋詞',fallback:'當地語言翻譯暫時無法使用，改用原關鍵字搜尋。',stale:'使用此關鍵字的快取結果',timeout:'搜尋逾時，請按搜尋重試。',invalid:'搜尋回應格式不正確。'},
    ja:{used:'検索に使用した語',fallback:'翻訳を利用できないため、元のキーワードで検索しました。',stale:'キーワードのキャッシュ結果',timeout:'検索がタイムアウトしました。再検索してください。',invalid:'検索応答の形式が不正です。'}
  };
  function extra(){ return EXTRA[state.lang] || EXTRA.en; }
  function trace(event, request, detail = {}) {
    diagnostics.push({event,id:request?.id,key:request?.snapshot.key,at:new Date().toISOString(),...detail});
    if(diagnostics.length > 40) diagnostics.shift();
  }
  function invalidateStatic() {
    state.newsRequestId = (state.newsRequestId || 0) + 1;
  }
  function cancelActive(reason = 'superseded') {
    const previous = active;
    active = null;
    ++requestId;
    invalidateStatic();
    if(previous){
      trace('cancel', previous, {reason});
      previous.controller.abort();
    }
  }
  function current(request) {
    return active === request && request.id === requestId && Boolean(state.country && keyword)
      && request.snapshot.key === requestSnapshot().key;
  }
  function displayTerm(value) {
    const text = String(value || '');
    if(state.lang === 'zh-Hant' && window.OpenCC?.Converter) {
      return window.OpenCC.Converter({from:'cn',to:'twp'})(text);
    }
    return text;
  }
  function showResult(data, request) {
    const c=copy(), x=extra();
    const used=data.search_keyword || request.snapshot.keyword;
    const info=[`${x.used}: ${displayTerm(used)}`];
    if(data.localization?.status === 'fallback') info.push(x.fallback);
    if(data.stale) info.push(`${x.stale} (${Math.max(1,Math.round((data.cache_age_ms||0)/60000))} min)`);
    feedback.textContent=info.join(' · ');
    ui.newsWindow.textContent=`${c.active}: ${request.snapshot.keyword}`;
    if(!data.articles.length){
      setNewsState(c.none);
      ui.globeStatus.textContent=`0 · ${request.snapshot.keyword}`;
    }else{
      renderStaticNews(data.articles);
      ui.globeStatus.textContent=`${data.articles.length} · ${request.snapshot.keyword}`;
    }
    window.lastKeywordError=null;
  }

  function keywordFetch(options = {}) {
    if(!state.country || !keyword) {
      cancelActive('no-keyword-or-country');
      feedback.textContent='';
      return baseFetchNews();
    }
    const snapshot=requestSnapshot();
    if(active && !active.controller.signal.aborted && active.snapshot.key===snapshot.key){
      trace('coalesced',active);
      return active.promise;
    }
    cancelActive();
    const request={id:requestId,snapshot,controller:new AbortController(),started:Date.now(),timedOut:false,promise:null};
    active=request;
    invalidateStatic();
    const c=copy();
    setNewsState(c.searching,true);
    ui.newsWindow.textContent=`${c.active}: ${snapshot.keyword}`;
    ui.globeStatus.textContent=c.searching;
    feedback.textContent='';
    trace('start',request);

    // Use a separate settlement deadline: even a late/ignored abort cannot pin
    // the single-flight slot forever. Cleanup is by request identity, NOT key.
    let rejectStop;
    const stopped=new Promise((_,reject)=>{rejectStop=reject;});
    const onAbort=()=>rejectStop(new DOMException('Search cancelled','AbortError'));
    request.controller.signal.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>{
      request.timedOut=true;
      request.controller.abort();
    },REQUEST_TIMEOUT_MS);

    const task=Promise.resolve().then(async()=>{
      if(request.controller.signal.aborted) throw new DOMException('Search cancelled','AbortError');
      const response=await fetch(ENDPOINT,{
        method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
        body:JSON.stringify({country:snapshot.country,region:snapshot.region,keyword:snapshot.keyword,refresh:options.force===true}),
        signal:request.controller.signal
      });
      request.httpStatus=response.status;
      let data;
      try { data=await response.json(); }
      catch { throw new Error(`${extra().invalid} HTTP ${response.status}`); }
      request.serverRequestId=data.request_id;
      if(!response.ok || !data.ok){
        const error=new Error(data.error || `HTTP ${response.status}`);
        error.code=data.code;
        error.feeds=data.feed_results;
        throw error;
      }
      if(!Array.isArray(data.articles)) throw new Error(extra().invalid);
      return data;
    });
    request.promise=Promise.race([task,stopped]).then(data=>{
      if(!current(request)){trace('discarded',request);return;}
      showResult(data,request);
      trace('success',request,{http:request.httpStatus,count:data.articles.length,elapsed_ms:Date.now()-request.started,request_id:data.request_id,cached:Boolean(data.cached),stale:Boolean(data.stale)});
    }).catch(error=>{
      if(!current(request)) return;
      const detail=request.timedOut ? extra().timeout : `${error.name || 'Error'}: ${error.message || error}`;
      window.lastKeywordError={detail,key:snapshot.key,id:request.id,http:request.httpStatus,code:error.code,feeds:error.feeds,request_id:request.serverRequestId,elapsed_ms:Date.now()-request.started,at:new Date().toISOString()};
      trace('error',request,window.lastKeywordError);
      console.error('Keyword news failed',window.lastKeywordError);
      setNewsState(copy().error);
      ui.globeStatus.textContent=`${copy().error} · ${detail}`;
      feedback.textContent=detail;
    }).finally(()=>{
      clearTimeout(timer);
      request.controller.signal.removeEventListener('abort',onAbort);
      if(active===request) active=null;
    });
    return request.promise;
  }

  fetchNews = function(){ return keywordFetch(); };

  function setKeyword(value){
    const next=String(value||'').trim().slice(0,80);
    if(next!==keyword) cancelActive('keyword-changed');
    keyword=next;
    input.value=keyword;
    window.worldNewsKeyword=keyword;
    updateCopy();
    // URL state must not be able to prevent a search (e.g. History API limits).
    try { window.syncWorldNewsUrl?.(true); }
    catch(error) { console.warn('Keyword URL update failed',error); }
  }

  root.addEventListener('submit',event=>{
    event.preventDefault();
    setKeyword(input.value);
    keywordFetch();
    input.blur();
  });
  clear.addEventListener('click',()=>{
    setKeyword('');
    keywordFetch();
    input.focus();
  });
  // A control click is not a globe selection or drag.
  ['pointerdown','pointerup','click','dblclick'].forEach(name=>root.addEventListener(name,event=>event.stopPropagation()));

  const liveRefresh=document.getElementById('refreshNowBtn');
  liveRefresh?.addEventListener('click',event=>{
    if(!keyword) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    keywordFetch({force:true});
  },true);
  ['backWorldBtn','usBackWorldBtn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{
    cancelActive('back-to-world');
    feedback.textContent='';
  }));
  ui.languageButtons.forEach(button=>button.addEventListener('click',()=>setTimeout(updateCopy,0)));

  setKeyword(keyword);
  window.keywordNewsRefresh=keywordFetch;
})();
