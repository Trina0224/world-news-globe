"""Optional offline Chromium regression tests; no Google/Cloudflare traffic.
Run: python tests/keyword_browser.py [path-to-keyword-search.js]
Requires Playwright and Chromium. Mocked fetch deliberately settles cancelled
requests late to make stale-response races reproducible rather than timing-dependent.
"""
from pathlib import Path
import json
import sys
from playwright.sync_api import sync_playwright

SCRIPT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'keyword-search.js'
SETUP = r'''
var state={country:{properties:{name:'United States of America'}},region:'',lang:'en',newsRequestId:0};
var ui={globeWrap:document.getElementById('globe-wrap'),newsList:document.getElementById('newsList'),newsWindow:document.getElementById('newsWindow'),globeStatus:document.getElementById('globeStatus'),newsState:document.getElementById('newsState'),languageButtons:[]};
var JP_PREFECTURES=[['東京都','Tokyo'],['大阪府','Osaka']];
function rawName(f){return f?.properties?.name||'';}
function isJapan(){return rawName(state.country)==='Japan';}
function isUS(){return rawName(state.country).startsWith('United States');}
function setNewsState(message){ui.newsList.textContent='';ui.newsState.textContent=message;}
function renderStaticNews(articles){ui.newsState.textContent='';ui.newsList.textContent=articles.map(a=>a.title).join('|');}
function fetchNews(){if(state.country)renderStaticNews([{title:'ORDINARY NEWS'}]);return Promise.resolve();}
function t(key){return key;}
window.calls=[];
window.fetch=(url,opts={})=>new Promise((resolve,reject)=>{
 const call={url,body:JSON.parse(opts.body||'{}'),signal:opts.signal,resolve,reject};window.calls.push(call);
});
window.finish=(index,title='RESULT')=>{const c=calls[index];c.resolve({ok:true,status:200,json:async()=>({ok:true,country:c.body.country,region:c.body.region,keyword:c.body.keyword,article_count:1,articles:[{title,url:'https://example.org/news'}]})});};
window.fail=(index)=>calls[index].reject(new TypeError('Load failed'));
'''
HTML='<html><body><div id="globe-wrap" style="position:relative;height:420px"></div><div id="newsWindow"></div><div id="globeStatus"></div><div id="newsState"></div><div id="newsList"></div><button id="refreshNowBtn">Refresh</button><button id="backWorldBtn">World</button><button id="usBackWorldBtn">World</button></body></html>'

def main():
 results=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  def newpage():
   page=browser.new_page(viewport={'width':1024,'height':768},has_touch=True)
   page.set_content(HTML);page.add_script_tag(content=SETUP);page.add_script_tag(path=str(SCRIPT));return page
  def submit(page,word):
   page.locator('.keyword-input').fill(word);page.locator('.keyword-apply').click();page.wait_for_timeout(20)
  def check(name,actual,expected):results.append({'test':name,'actual':actual,'expected':expected,'pass':actual==expected})
  page=newpage()
  submit(page,'AI');submit(page,'election');submit(page,'AI')
  page.evaluate('finish(0,"OLD AI")');page.wait_for_timeout(20);submit(page,'AI')
  check('A → B → A: late A1 cleanup must not restart A2',page.evaluate('calls.length'),3)
  page.close()
  page=newpage();submit(page,'AI');submit(page,'')
  page.evaluate('finish(0,"OLD KEYWORD")');page.wait_for_timeout(20)
  check('Empty input + Search invalidates old keyword result',page.locator('#newsList').inner_text(),'ORDINARY NEWS');page.close()
  page=newpage();submit(page,'AI')
  page.evaluate("state.country=null;setNewsState('WORLD');document.getElementById('usBackWorldBtn').click();finish(0,'OLD COUNTRY')")
  page.wait_for_timeout(20);check('Back to world rejects late keyword response',page.locator('#newsList').inner_text(),'');page.close()
  page=newpage();submit(page,'AI');page.evaluate('fail(0)');page.wait_for_timeout(20)
  submit(page,'AI');page.evaluate('finish(1,"RECOVERED")');page.wait_for_timeout(20)
  check('Same-key retry after a network failure recovers',page.locator('#newsList').inner_text(),'RECOVERED');page.close()
  page=newpage();submit(page,'AI');submit(page,'AI')
  check('Duplicate Search shares one in-flight request',page.evaluate('calls.length'),1);page.close()
  page=newpage()
  for n in range(30):
   word=['AI','election','earthquake'][n%3]+str(n)
   page.evaluate("n=>{state.country={properties:{name:['Japan','Taiwan','United States of America'][n%3]}}}",n)
   submit(page,word);page.evaluate('n=>finish(n,"NEWS "+n)',n);page.wait_for_timeout(10)
  check('30 repeated country / Search changes return final results',page.locator('#newsList').inner_text(),'NEWS 29');page.close()
  browser.close()
 print(json.dumps({'script':str(SCRIPT),'results':results},indent=2,ensure_ascii=False))
 return 0 if all(r['pass'] for r in results) else 1
if __name__=='__main__':sys.exit(main())
