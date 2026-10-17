import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const localizationURL=moduleURL(readFileSync(new URL('../cloudflare/news-refresh/src/keyword-localization.js',import.meta.url),'utf8'));
const {localizeKeyword}=await import(localizationURL);
const workerSource=readFileSync(new URL('../cloudflare/news-refresh/src/keyword.js',import.meta.url),'utf8').replace("'./keyword-localization.js'",JSON.stringify(localizationURL));
const {fetchFeed,keywordSearch,keywordDebug,KEYWORD_VERSION}=await import(moduleURL(workerSource));

const rss=(n=1)=>`<rss version="2.0"><channel>${Array.from({length:n},(_,i)=>`<item><title>Election story ${i}</title><link>https://example.org/${i}</link><source>Publisher ${i}</source><pubDate>${new Date().toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
const response=(n=1)=>new Response(rss(n),{headers:{'Content-Type':'application/rss+xml'}});
const offline={cache:null,sleep:async()=>{},fetcher:async()=>response()};
function cacheStore(){const values=new Map();return {values,async match(key){return values.get(key.url)?.clone();},async put(key,value){values.set(key.url,value.clone());}};}

test('election localizes to Taiwan, Japan, France without AI',async()=>{
 for(const [country,term] of [['Taiwan','選舉'],['Japan','選挙'],['France','élection']]){
  const urls=[];
  const data=await keywordSearch(country,'','election',{...offline,fetcher:async url=>{urls.push(url);return response();}});
  assert.equal(data.search_keyword,term);assert.equal(urls.length,1);
  assert.ok(new URL(urls[0]).searchParams.get('q').includes(term));
 }
});
test('Japanese and Chinese topic inputs localize back into English',async()=>{
 assert.equal((await localizeKeyword('選挙','en')).term,'election');
 assert.equal((await localizeKeyword('地震','en')).term,'earthquake');
});
test('country aliases use the same Taiwan edition',async()=>{
 const a=await keywordSearch('taiwan','','election',offline);
 assert.equal(a.country,'Taiwan');assert.equal(a.edition.gl,'TW');assert.equal(a.search_keyword,'選舉');
 assert.equal((await keywordSearch('usa','','election',offline)).country,'United States');
});
test('proper names and tickers are not translated',async()=>{
 for(const name of ['AMD','NVIDIA','OpenAI','TSMC'])assert.equal((await localizeKeyword(name,'ja')).term,name);
});
test('unknown translation is a single existing-model call',async()=>{
 const calls=[];const env={AI:{run:async(model,input)=>{calls.push({model,input});return {translated_text:'宇宙探査'};}}};
 const r=await localizeKeyword('space exploration','ja',env);
 assert.equal(r.term,'宇宙探査');assert.equal(calls.length,1);assert.equal(calls[0].input.source_lang,'en');
});
test('a hanging translation falls back without blocking news',async()=>{
 const r=await localizeKeyword('space exploration','ja',{AI:{run:()=>new Promise(()=>{})}},{timeoutMs:5});
 assert.equal(r.term,'space exploration');assert.equal(r.status,'fallback');assert.equal(r.reason,'translation-timeout');
});
test('translation quota errors preserve original term',async()=>{
 const r=await localizeKeyword('space exploration','ja',{AI:{run:async()=>{throw new Error('3036 daily quota');}}});
 assert.equal(r.term,'space exploration');assert.equal(r.reason,'translation-quota');
});
test('HTTP 200 HTML is an upstream error, never fake zero news',async()=>{
 await assert.rejects(fetchFeed('https://example.org/rss','English',{sleep:async()=>{},fetcher:async()=>new Response('<html>not rss</html>')}),e=>e.code==='GOOGLE_NEWS_UPSTREAM_FAILED'&&e.feed_results[0].attempt_details[0].kind==='INVALID_RSS');
});
test('permanent HTTP 404 is not retried',async()=>{
 let calls=0;await assert.rejects(fetchFeed('https://example.org/rss','English',{sleep:async()=>{},fetcher:async()=>{calls++;return new Response('missing',{status:404});}}));assert.equal(calls,1);
});
test('503 retries once; success records both attempts',async()=>{
 let calls=0;const r=await fetchFeed('https://example.org/rss','English',{sleep:async()=>{},fetcher:async()=>++calls===1?new Response('busy',{status:503}):response()});
 assert.equal(calls,2);assert.equal(r.attempt_details[0].status,503);assert.equal(r.articles.length,1);
});
test('long Retry-After does not trigger immediate repeated 429',async()=>{
 let calls=0;await assert.rejects(fetchFeed('https://example.org/rss','English',{sleep:async()=>{},fetcher:async()=>{calls++;return new Response('slow',{status:429,headers:{'Retry-After':'30'}});}}));assert.equal(calls,1);
});
test('hung RSS/body has a bounded deadline',async()=>{
 await assert.rejects(fetchFeed('https://example.org/rss','English',{attemptTimeoutMs:5,sleep:async()=>{},fetcher:()=>new Promise(()=>{})}),e=>e.feed_results[0].attempts===2);
});
test('a valid empty RSS stays empty and is not cached',async()=>{
 const cache=cacheStore();const r=await keywordSearch('Japan','','earthquake',{...offline,cache,fetcher:async()=>response(0)});
 assert.equal(r.article_count,0);assert.equal(cache.values.size,0);
});
test('repeat keyword reuses same-country successful cache',async()=>{
 const cache=cacheStore();let calls=0;
 const options={...offline,cache,fetcher:async()=>{calls++;return response();}};
 await keywordSearch('Japan','','election',options);
 const r=await keywordSearch('Japan','','election',options);
 assert.equal(r.cached,true);assert.equal(calls,1);
 await keywordSearch('Taiwan','','election',options);assert.equal(calls,2);
});
test('refresh bypasses fresh cache; outage can use labelled same-query success',async()=>{
 const cache=cacheStore();await keywordSearch('Japan','','election',{...offline,cache});
 const r=await keywordSearch('Japan','','election',{...offline,cache,force:true,fetcher:async()=>new Response('busy',{status:503})});
 assert.equal(r.stale,true);assert.equal(r.articles.length,1);
 await assert.rejects(keywordSearch('Japan','','earthquake',{...offline,cache,force:true,fetcher:async()=>new Response('busy',{status:503})}));
});
test('debug executes the real search/localization path',async()=>{
 const r=await keywordDebug('taiwan','','election',offline);
 assert.equal(r.country,'Taiwan');assert.equal(r.search_keyword,'選舉');assert.equal(r.feeds.length,1);assert.equal(r.version,KEYWORD_VERSION);
});

// Small DOM double: exercise the actual production script, with deterministic
// late responses. Full click tests can also run via keyword_browser.py.
class Element {
 constructor(){this.listeners={};this.children=[];this.fields={};this.dataset={};this.style={};this.textContent='';this.value='';this.classList={add(){},remove(){},toggle(){}};}
 setAttribute(){} appendChild(x){this.children.push(x);return x;} append(...xs){this.children.push(...xs);}
 querySelector(selector){return this.fields[selector] ||= new Element();}querySelectorAll(){return [];}
 addEventListener(name,cb){(this.listeners[name] ||= []).push(cb);}blur(){}focus(){}
 emit(name){for(const cb of this.listeners[name]||[])cb({preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});}
}
function harness({withStatic=false,timeout=15000}={}){
 const ids=new Map();const el=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 const calls=[];const c={console:{error(){},warn(){},debug(){}},URL,Request,Response,AbortController,DOMException,Date,Map,Set,Promise,
  setTimeout:(fn,ms)=>setTimeout(fn,ms===15000?timeout:ms),clearTimeout,
  document:{createElement:()=>new Element(),getElementById:el,head:new Element()},
  state:{country:{properties:{name:'United States of America'}},region:'',lang:'en',newsRequestId:0},
  ui:{globeWrap:el('wrap'),newsState:el('newsState'),newsList:el('newsList'),newsWindow:el('newsWindow'),globeStatus:el('globeStatus'),languageButtons:[]},
  JP_PREFECTURES:[['東京都','Tokyo']],strings:{en:{},ja:{},'zh-Hant':{}},updateLabels(){},articleDate(){return '';},t:key=>key,
  fetch:(url,opts={})=>new Promise((resolve,reject)=>calls.push({url,body:JSON.parse(opts.body||'{}'),opts,resolve,reject}))};
 c.window=c;c.rawName=f=>f?.properties?.name||'';c.isJapan=()=>c.rawName(c.state.country)==='Japan';c.isUS=()=>c.rawName(c.state.country).startsWith('United States');
 c.setNewsState=msg=>{c.message=msg;c.rendered='';};c.renderStaticNews=articles=>{c.rendered=articles.map(a=>a.title).join('|');};
 c.fetchNews=()=>{c.renderStaticNews([{title:'ORDINARY'}]);return Promise.resolve();};
 vm.createContext(c);
 if(withStatic)vm.runInContext(readFileSync(new URL('../news-static.js',import.meta.url),'utf8'),c);
 // Override only the renderer, not the request/control implementation.
 c.renderStaticNews=articles=>{c.rendered=articles.map(a=>a.title).join('|');};
 vm.runInContext(readFileSync(new URL('../keyword-search.js',import.meta.url),'utf8'),c);
 const root=c.ui.globeWrap.children[0];
 return {c,calls,root,submit(word){root.querySelector('.keyword-input').value=word;root.emit('submit');},finish(i,title='RESULT'){const x=calls[i];x.resolve({ok:true,status:200,json:async()=>({ok:true,articles:[{title,url:'https://example.org/story'}],...x.body})});}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('frontend A/B/A cleanup is based on identity, not reusable key',async()=>{
 const h=harness();h.submit('AI');await flush();h.submit('election');await flush();h.submit('AI');await flush();
 h.finish(0,'OLD');await flush();h.submit('AI');await flush();assert.equal(h.calls.length,3);
 h.finish(2);await flush();
});
test('frontend empty Search cancels previous keyword result',async()=>{
 const h=harness();h.submit('AI');await flush();h.submit('');h.finish(0,'OLD');await flush();assert.equal(h.c.rendered,'ORDINARY');
});
test('frontend network failure can retry same key',async()=>{
 const h=harness();h.submit('AI');await flush();h.calls[0].reject(new TypeError('Load failed'));await flush();
 h.submit('AI');await flush();h.finish(1,'RECOVERED');await flush();assert.equal(h.c.rendered,'RECOVERED');
});
test('frontend timeout releases slot even when fetch ignores abort',async()=>{
 const h=harness({timeout:5});h.submit('AI');await new Promise(r=>setTimeout(r,15));
 assert.ok(h.c.lastKeywordError.detail.includes('timed out'));h.submit('AI');await flush();assert.equal(h.calls.length,2);h.finish(1);await flush();
});
test('ordinary news returning late cannot overwrite keyword results',async()=>{
 const h=harness({withStatic:true});void h.c.fetchNews();await flush();h.submit('election');await flush();
 h.finish(1,'KEYWORD');await flush();h.finish(0,'OLD STATIC');await flush();assert.equal(h.c.rendered,'KEYWORD');
});
test('old static failure cannot overwrite new search success',async()=>{
 const h=harness({withStatic:true});void h.c.fetchNews();await flush();h.submit('election');await flush();
 h.finish(1,'KEYWORD');await flush();h.calls[0].reject(new Error('Static network failed'));await flush();assert.equal(h.c.rendered,'KEYWORD');
});
