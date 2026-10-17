const CACHE_NAME = 'world-news-globe-v13';
const SHELL = [
  './', './index.html',
  './styles.css?v=10', './japan-overlay.css?v=4', './us-overlay.css?v=4',
  './app-v2.js?v=9', './news-static.js?v=11', './japan-overlay.js?v=4',
  './us-overlay.js?v=5', './us-dc.js?v=1', './desktop-map-click-fix.js?v=1',
  './language-system.js?v=1', './client-state.js?v=3', './live-refresh.js?v=4',
  './keyword-search.js?v=20261017-1', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('world-news-globe-') && k !== CACHE_NAME).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(request.mode==='navigate') {
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(CACHE_NAME);
      return (await cache.match('./index.html')) || Response.error();
    }));
    return;
  }
  const isData=url.pathname.includes('/data/');
  const isCode=/\.(?:js|css)$/.test(url.pathname);
  if(isData || isCode){
    const key=isData?new Request(url.origin+url.pathname):request;
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try {
        const response=await fetch(request,isCode?{cache:'no-cache'}:undefined);
        if(!response.ok) throw new Error(`Asset HTTP ${response.status}`);
        event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
        return response;
      } catch {
        return (await cache.match(key)) || Response.error();
      }
    })());
    return;
  }
  // Exact version matching: ?v=new must never receive an old ?v=old script.
  event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(request)) || fetch(request)));
});
