// Service worker «Мой диабет»: приложение открывается без интернета.
// Код и данные (html/js/css/каталог) — сначала сеть, при отсутствии сети — кэш, чтобы обновления приходили сразу.
// Фото продуктов — сначала кэш. Запросы к другим сайтам (распознавание фото) не кэшируются.
const CACHE='dm-v3';
const SHELL=['./','index.html','css/app.css','js/medhints.js','js/daynote.js','js/app.js','js/sync.js','js/datefmt.js','js/predict.js','js/cgm.js','js/cgmbig.js','js/cgmtrends.js','js/alerts.js','js/photoquota.js','js/safety.js','js/measures.js','js/addfood.js','js/guide.js','js/disclaimer.js','js/cgmsources.js','js/docs.js','js/report-pdf.js','js/link.js','assets/vendor/html2canvas.min.js','assets/vendor/jspdf.umd.min.js','data/catalog.js','core/domain.js','core/family.js','adapters/runtime.js','adapters/storage.js','adapters/backup.js','adapters/cloud.js','manifest.webmanifest','assets/icons/icon-192.png','assets/foods/_fallback.jpg'];
// Фоновая подкачка фото: страница присылает список, качаем по 4 штуки, пропуская уже сохранённые.
self.addEventListener('message',e=>{const d=e.data||{};if(d.type!=='prefetch'||!Array.isArray(d.urls))return;
  e.waitUntil(caches.open(CACHE).then(async c=>{const q=d.urls.slice();const keep=new Set(q.map(u=>new URL(u,self.registration.scope).href));
    const run=async()=>{while(q.length){const u=q.shift();try{if(!(await c.match(u))){const r=await fetch(u);if(r.ok)await c.put(u,r)}}catch(_){}}};
    await Promise.all([run(),run(),run(),run()]);
    // убираем старые версии фото, которых больше нет в каталоге
    for(const k of await c.keys()){if(k.url.includes('/assets/foods/')&&!k.url.includes('_fallback')&&!keep.has(k.url))await c.delete(k)}
  }))});
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

// Уведомления о сахаре (Web Push): сервер присылает зашифрованное сообщение, показываем его даже при закрытом приложении.
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={title:'Мой диабет',body:e.data?e.data.text():''}}
  const opt={body:d.body||'',tag:d.tag||'dm',renotify:true,requireInteraction:!!d.urgent,silent:d.sound===false,icon:'assets/icons/icon-192.png',badge:'assets/icons/icon-192.png',vibrate:d.urgent?[400,200,400,200,400]:[200,100,200],data:{url:d.url||'./'}};
  e.waitUntil(self.registration.showNotification(d.title||'Мой диабет',opt))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.startsWith(self.registration.scope)&&'focus' in c)return c.focus()}return self.clients.openWindow(url)}))});
