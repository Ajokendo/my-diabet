// Service worker «Мой диабет»: приложение открывается без интернета.
// Код и данные (html/js/css/каталог) — сначала сеть, при отсутствии сети — кэш, чтобы обновления приходили сразу.
// Фото продуктов — сначала кэш. Запросы к другим сайтам (распознавание фото) не кэшируются.
const CACHE='dm-v1';
const SHELL=['./','index.html','css/app.css','js/app.js','data/catalog.js','core/domain.js','core/family.js','adapters/runtime.js','adapters/storage.js','adapters/backup.js','adapters/cloud.js','manifest.webmanifest','assets/icons/icon-192.png','assets/foods/_fallback.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  if(u.pathname.includes('/assets/foods/')){
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res})));return;
  }
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(hit=>hit||caches.match('index.html'))));
});
