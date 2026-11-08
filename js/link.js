/* «Мой диабет» — вход на другом устройстве по QR-коду (как WhatsApp Web).
 * Новое устройство (обычно компьютер) показывает QR, телефон, где уже выполнен вход в «Семью», сканирует его
 * и подтверждает — новое устройство получает свой вход в тот же аккаунт и сразу синхронизируется. */
(function(){
let poll=null,stream=null,raf=0,scanning=false;
function C(){return (window.db&&db.cloud2)||(db.cloud2={})}
function server(){return (C().server||db.settings?.photo?.server||'https://my-diabet.ajokendo.workers.dev').replace(/\/$/,'')}
function load(src){return new Promise((ok,bad)=>{if(document.querySelector(`script[data-src="${src}"]`))return ok();const s=document.createElement('script');s.src=src;s.dataset.src=src;s.onload=ok;s.onerror=()=>bad(new Error('Не удалось загрузить компонент. Проверьте интернет.'));document.head.appendChild(s)})}
async function api(path,method,body,auth){const o={method,headers:{'Content-Type':'application/json'}};if(auth&&C().token)o.headers.Authorization='Bearer '+C().token;if(method!=='GET')o.body=JSON.stringify(body||{});
  const r=await fetch(server()+path,o);let j={};try{j=await r.json()}catch(e){}if(!r.ok){const e=new Error(j.error||('Ошибка '+r.status));e.status=r.status;throw e}return j}
function modal(html){close();const w=document.createElement('div');w.id='linkModal';w.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
  w.innerHTML=`<div class="card" style="max-width:440px;width:100%;max-height:92vh;overflow:auto;position:relative"><button class="btn secondary" style="position:absolute;top:10px;right:10px;padding:4px 10px" onclick="DMLink.close()">✕</button>${html}</div>`;document.body.appendChild(w);return w}
function close(){clearTimeout(poll);poll=null;stopCam();document.getElementById('linkModal')?.remove()}

/* ---- Новое устройство: показать QR и ждать подтверждения ---- */
async function showQr(){
  modal('<h3>Вход по QR-коду</h3><p class="muted">Готовлю код…</p>');
  try{await load('assets/vendor/qrcode.js');const j=await api('/v1/link/start','POST');
    const url=location.origin+location.pathname+'#link='+j.code;const q=qrcode(0,'M');q.addData(url);q.make();
    modal(`<h3>Вход по QR-коду</h3><div style="display:flex;justify-content:center;margin:10px 0">${q.createSvgTag({cellSize:6,margin:2,scalable:true}).replace('<svg ','<svg style="width:260px;height:260px" ')}</div>
<ol style="padding-left:18px;line-height:1.6"><li>Откройте «Мой диабет» на телефоне, где уже выполнен вход в «Семью».</li><li><b>☰ Все разделы → Семья → «💻 Подключить компьютер»</b>.</li><li>Наведите камеру телефона на этот код и подтвердите.</li></ol>
<p class="muted" id="linkState">Ждём подтверждения с телефона… Код действует 3 минуты.</p>`);
    const started=Date.now();
    const tick=async()=>{if(!document.getElementById('linkModal'))return;
      try{const r=await api('/v1/link/'+j.code,'GET');
        if(r.status==='approved'){close();C().server=server();if(!r.patient)return alert('Вход выполнен, но в аккаунте нет дневника.');window.DMSync.adopt(r,r.patient);alert('Готово! Это устройство подключено к дневнику «'+(r.patient.displayName||'')+'». Данные загружаются.');return}}
      catch(e){if(e.status===410){if(Date.now()-started<15*60e3)return showQr();const st=document.getElementById('linkState');if(st)st.textContent='Код устарел. Закройте окно и попробуйте ещё раз.';return}}
      poll=setTimeout(tick,2000)};
    poll=setTimeout(tick,2000);
  }catch(e){modal(`<h3>Вход по QR-коду</h3><div class="notice">${e.message}</div>`)}
}

/* ---- Телефон с входом: сканировать QR и подтвердить ---- */
function parse(text){const m=String(text||'').match(/[#&?]link=([A-Za-z0-9_-]{20,64})/)||String(text||'').match(/^([A-Za-z0-9_-]{32})$/);return m?m[1]:null}
async function approve(code){
  if(!C().token)return alert('Сначала войдите в «Семью» на этом телефоне.');
  if(!confirm('Подключить новое устройство к дневнику «'+(C().patientName||'')+'»?\n\nОно получит доступ ко всем записям, как вы. Подтверждайте только своё устройство.'))return;
  try{await api('/v1/link/'+code+'/approve','POST',{patientId:C().patientId},true);close();alert('Готово! Через несколько секунд дневник откроется на компьютере.')}
  catch(e){alert(e.message)}
}
function stopCam(){scanning=false;cancelAnimationFrame(raf);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
async function scan(){
  if(!C().token)return alert('Сначала войдите в «Семью» на этом телефоне.');
  modal(`<h3>Подключить компьютер</h3><p class="muted">На компьютере откройте <b>my-diabet.pages.dev</b> → «Семья» → «Войти по QR-коду» и наведите камеру на код.</p>
<video id="linkVideo" playsinline muted style="width:100%;border-radius:12px;background:#000;aspect-ratio:1/1;object-fit:cover"></video><p class="muted" id="linkScanState" style="margin-top:8px">Включаю камеру…</p>`);
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false})}
  catch(e){document.getElementById('linkScanState').textContent='Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера — или отсканируйте QR обычной камерой телефона.';return}
  const v=document.getElementById('linkVideo');v.srcObject=stream;await v.play().catch(()=>{});document.getElementById('linkScanState').textContent='Наведите камеру на QR-код на экране компьютера.';
  let det=null;if('BarcodeDetector' in window){try{det=new BarcodeDetector({formats:['qr_code']})}catch(e){det=null}}
  if(!det){try{await load('assets/vendor/jsQR.js')}catch(e){}}
  const c=document.createElement('canvas'),g=c.getContext('2d',{willReadFrequently:true});scanning=true;
  const step=async()=>{if(!scanning)return;
    try{let text=null;
      if(det){const r=await det.detect(v);if(r&&r[0])text=r[0].rawValue}
      else if(window.jsQR&&v.videoWidth){const k=Math.min(1,640/v.videoWidth);c.width=v.videoWidth*k;c.height=v.videoHeight*k;g.drawImage(v,0,0,c.width,c.height);const r=jsQR(g.getImageData(0,0,c.width,c.height).data,c.width,c.height);if(r)text=r.data}
      const code=text&&parse(text);if(code){stopCam();return approve(code)}}catch(e){}
    raf=requestAnimationFrame(step)};
  raf=requestAnimationFrame(step);
}

/* QR отсканирован обычной камерой телефона — приложение открылось по ссылке с #link=… */
function fromHash(){const code=parse(location.hash);if(!code)return;history.replaceState(null,'',location.pathname+location.search);
  if(C().token)setTimeout(()=>approve(code),600);else alert('Этот QR-код нужно сканировать на телефоне, где уже выполнен вход в «Семью»: «Семья» → «💻 Подключить компьютер».')}

window.DMLink={showQr,scan,close,approve};
window.addEventListener('hashchange',fromHash);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(fromHash,800));else setTimeout(fromHash,800);
})();
