/* «Мой диабет» — показания сенсора (CGM).
 * xDrip+ на телефоне ребёнка отправляет показания на наш сервер (как в Nightscout),
 * а приложение раз в минуту забирает их и показывает на «Сегодня», в «Аналитике сахара» и в расчёте дозы.
 * Работает только при подключённой «Семье» (нужен общий дневник). */
(function(){
const ARROW={DoubleUp:'⇈',SingleUp:'↑',FortyFiveUp:'↗',Flat:'→',FortyFiveDown:'↘',SingleDown:'↓',DoubleDown:'⇊'};
const ARROW_RU={DoubleUp:'быстро растёт',SingleUp:'растёт',FortyFiveUp:'медленно растёт',Flat:'стабильно',FortyFiveDown:'медленно снижается',SingleDown:'снижается',DoubleDown:'быстро снижается'};
const FRESH_MIN=20;
let readings=[],connected=null,timer=null,lastFetch=0,err='',connectHtml='';

function C(){return (window.db&&db.cloud2)||{}}
function server(){return (C().server||db.settings?.photo?.server||'https://my-diabet.ajokendo.workers.dev').replace(/\/$/,'')}
function cacheKey(){return 'dm-cgm:'+(C().patientId||'')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(cacheKey())||'null');if(x&&Array.isArray(x.r)){readings=x.r;connected=x.c}}catch(e){}}
function saveCache(){try{const from=Date.now()-36*3600e3;localStorage.setItem(cacheKey(),JSON.stringify({r:readings.filter(x=>x.t>from),c:connected}))}catch(e){}}
function ready(){const c=C();return !!(c.token&&c.patientId)}

async function api(path,method){
  const r=await fetch(server()+path,{method:method||'GET',headers:{'Authorization':'Bearer '+C().token,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(j.error||('Ошибка '+r.status));return j;
}

async function refresh(force){
  if(!ready())return;
  if(!force&&Date.now()-lastFetch<45e3)return;
  lastFetch=Date.now();
  const last=readings.length?readings[readings.length-1].t:Date.now()-36*3600e3;
  try{
    const j=await api(`/v1/patients/${encodeURIComponent(C().patientId)}/cgm?since=${last}`);
    connected=j.connected;err='';
    const seen=new Set(readings.map(x=>x.t));
    (j.readings||[]).forEach(x=>{if(!seen.has(x.t))readings.push(x)});
    readings.sort((a,b)=>a.t-b.t);const from=Date.now()-36*3600e3;readings=readings.filter(x=>x.t>from);
    saveCache();
  }catch(e){err=e.message||String(e)}
  paint();
}

function latest(){const x=readings[readings.length-1];if(!x)return null;const age=(Date.now()-x.t)/60000;return {...x,age,fresh:age<=FRESH_MIN,arrow:ARROW[x.d]||'',trend:ARROW_RU[x.d]||''}}
function ago(min){min=Math.round(min);if(min<1)return 'только что';if(min<60)return min+' мин назад';const h=Math.floor(min/60);return h+' ч '+(min%60)+' мин назад'}

/* Блок на «Сегодня»: показывает сенсор, если показание свежее ручной записи */
function paintDashboard(){
  const el=document.getElementById('sGlucose'),st=document.getElementById('glucoseStatus'),lb=document.getElementById('sGlucoseLabel');
  if(!el||!st)return;const L=latest();if(!L)return;
  const day=document.getElementById('day')?.value;const d0=new Date();const todayStr=(typeof today==='function')?today():d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
  if(day&&day!==todayStr)return; // смотрим другой день — оставляем ручные записи
  if(!L.fresh&&L.age>180)return;
  el.style.whiteSpace='nowrap';el.textContent=L.g.toFixed(1)+(L.arrow?' '+L.arrow:'');
  const [cls,txt]=L.g<3.9?['statusLow','● Низкий']:L.g>10?['statusHigh','● Высокий']:['statusGood','● В норме'];
  st.className=L.fresh?cls:'statusHigh';
  st.textContent=(L.fresh?txt+(L.trend?', '+L.trend:''):'● Нет новых данных')+' · '+ago(L.age);
  if(lb)lb.textContent='Глюкоза с сенсора';
}

/* График за 24 часа в «Аналитике сахара» */
function chartSvg(hours){
  const to=Date.now(),from=to-hours*3600e3,pts=readings.filter(x=>x.t>=from);
  const W=640,H=220,pl=30,pr=8,pt=8,pb=22,ymax=Math.max(16,...pts.map(x=>x.g+1)),X=t=>pl+(t-from)/(to-from)*(W-pl-pr),Y=g=>pt+(1-g/ymax)*(H-pt-pb);
  let grid='';for(let g=4;g<=ymax;g+=4)grid+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(g)}" y2="${Y(g)}" stroke="#e2e8f0"/><text x="${pl-4}" y="${Y(g)+4}" font-size="11" text-anchor="end" fill="#64748b">${g}</text>`;
  for(let h=0;h<=hours;h+=hours>12?4:2){const t=from+h*3600e3,d=new Date(t);grid+=`<text x="${X(t)}" y="${H-6}" font-size="11" text-anchor="middle" fill="#64748b">${String(d.getHours()).padStart(2,'0')}:00</text>`}
  const band=`<rect x="${pl}" y="${Y(10)}" width="${W-pl-pr}" height="${Y(3.9)-Y(10)}" fill="#dcfce7" opacity=".7"/>`;
  let path='',prev=null;pts.forEach(p=>{const gap=prev&&p.t-prev.t>15*60e3;path+=(path===''||gap?'M':'L')+X(p.t).toFixed(1)+','+Y(p.g).toFixed(1);prev=p});
  const dots=pts.filter(p=>p.g<3.9||p.g>10).map(p=>`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.g).toFixed(1)}" r="2.2" fill="${p.g<3.9?'#dc2626':'#f59e0b'}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${band}${grid}<path d="${path}" fill="none" stroke="#0d9488" stroke-width="2"/>${dots}</svg>`;
}
function stats(hours){const from=Date.now()-hours*3600e3,p=readings.filter(x=>x.t>=from);if(!p.length)return null;const n=p.length,avg=p.reduce((s,x)=>s+x.g,0)/n;
  return {n,avg,low:p.filter(x=>x.g<3.9).length/n*100,inr:p.filter(x=>x.g>=3.9&&x.g<=10).length/n*100,high:p.filter(x=>x.g>10).length/n*100,min:Math.min(...p.map(x=>x.g)),max:Math.max(...p.map(x=>x.g))}}
let hoursSel=6,gmi=null,gmiAt=0;
/* Расчётный HbA1c (GMI, Bergenstal 2018): GMI % = 3,31 + 0,02392 × средняя глюкоза в мг/дл. Надёжен при 14+ днях данных и покрытии ≥70%. */
async function loadGmi(){if(!ready()||Date.now()-gmiAt<(gmi?30*60e3:60e3))return;gmiAt=Date.now();
  try{const j=await api(`/v1/patients/${encodeURIComponent(C().patientId)}/cgm?since=${Date.now()-14*864e5}`);const r=j.readings||[];
    if(!r.length){gmi=null;return}
    const mean=r.reduce((a,x)=>a+x.g,0)/r.length,days=(Date.now()-r[0].t)/864e5,cover=Math.min(100,r.length/(Math.max(days,1/24)*288)*100);
    gmi={v:3.31+0.02392*mean*18.016,mean,days,cover,n:r.length};paintGlucose()}catch(e){}}
function gmiHtml(){if(!gmi)return '';const ok=gmi.days>=13.5&&gmi.cover>=70;
  return `<div class="notice" style="margin-top:10px;background:#f0fdfa;border-color:#99f6e4"><b>Расчётный HbA1c (GMI): ${gmi.v.toFixed(1)}%</b> · средняя глюкоза ${gmi.mean.toFixed(1)} ммоль/л за ${gmi.days<1?'менее суток':Math.floor(gmi.days)+' дн.'} (данных ${Math.round(gmi.cover)}%).<br><span class="muted">${ok?'Посчитано по данным сенсора за 14 дней. ':'Пока мало данных — показатель станет надёжным после 14 дней работы сенсора. '}Это оценка, а не лабораторный анализ: настоящий HbA1c сдают в лаборатории и записывают в «Анализы».</span></div>`}
function paintGlucose(){
  const sec=document.getElementById('glucose');if(!sec)return;let box=document.getElementById('cgmCard');
  if(!box){const grid=sec.querySelector('.grid');if(!grid)return;box=document.createElement('div');box.id='cgmCard';box.className='card s12';grid.prepend(box)}
  if(!ready()){box.innerHTML=`<h3>📡 Сенсор</h3><p class="muted">Чтобы видеть показания сенсора, подключите «Семью», затем в разделе «Семья» — «Подключить сенсор (xDrip+)».</p>`;return}
  const L=latest();
  if(!L){box.innerHTML=`<h3>📡 Сенсор</h3><p class="muted">${connected?'Ждём первые показания от xDrip+… Обычно они приходят в течение 5 минут после настройки.':'Сенсор ещё не подключён. Откройте «Семья» → «Подключить сенсор (xDrip+)».'}</p>${err?`<div class="notice">${esc(err)}</div>`:''}`;return}
  const s=stats(hoursSel);
  box.innerHTML=`<div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 style="margin:0">📡 Сенсор: <span style="font-size:1.3em">${L.g.toFixed(1)} ${L.arrow}</span> <small class="muted">ммоль/л · ${ago(L.age)}</small></h3>
<div class="row" style="gap:6px">${[3,6,12,24].map(h=>`<button class="btn ${h===hoursSel?'':'secondary'}" style="padding:6px 10px" onclick="DMCgm.hours(${h})">${h} ч</button>`).join('')}</div></div>
${chartSvg(hoursSel)}
${s?`<div class="kpi" style="margin-top:6px"><div class="mini"><span class="muted">Среднее</span><b>${s.avg.toFixed(1)}</b></div><div class="mini"><span class="muted">В диапазоне 3,9–10</span><b>${Math.round(s.inr)}%</b></div><div class="mini"><span class="muted">Ниже 3,9</span><b style="color:#dc2626">${Math.round(s.low)}%</b></div><div class="mini"><span class="muted">Выше 10</span><b style="color:#d97706">${Math.round(s.high)}%</b></div><div class="mini"><span class="muted">Мин / макс</span><b>${s.min.toFixed(1)} / ${s.max.toFixed(1)}</b></div></div>`:''}
${gmiHtml()}${!L.fresh?`<div class="notice" style="margin-top:8px">Сенсор не присылал данные ${ago(L.age)}. Проверьте xDrip+ на телефоне сына и интернет.</div>`:''}`;
}

/* Расчёт дозы: подставляем свежий сахар с сенсора, если поле пустое */
function fillCalc(){const i=document.getElementById('iG');const L=latest();if(i&&!i.value&&L&&L.age<=15){i.value=L.g.toFixed(1);i.title='Подставлено с сенсора ('+ago(L.age)+')'}}

/* Карточка в «Семье» — подключение xDrip+ */
async function connect(){
  const out=document.getElementById('cgmConnect');if(out)out.innerHTML='Создаю ключ…';
  try{const j=await api(`/v1/patients/${encodeURIComponent(C().patientId)}/cgm-key`,'POST');connected=true;saveCache();
    connectHtml=`<p><b>Адрес для xDrip+</b> (это ваш личный ключ, никому не пересылайте):</p>
<div class="row" style="gap:8px"><input id="cgmUrl" class="input" readonly value="${esc(j.url)}" style="font-family:monospace;font-size:13px"><button class="btn" onclick="DMCgm.copy()">Копировать</button></div>
<ol style="padding-left:18px;line-height:1.6;margin-top:10px"><li>Скопируйте адрес и перешлите его <b>себе</b> на телефон сына (например, в «Избранное» WhatsApp).</li>
<li>На телефоне сына в xDrip+: <b>☰ → Настройки → Загрузка в облако → Nightscout Sync (REST-API)</b>.</li>
<li>Включите <b>«Включено»</b>, нажмите <b>«Base URL»</b> и вставьте адрес.</li>
<li>Через 5–10 минут показания появятся здесь, в «Аналитике сахара» и на «Сегодня» у всей семьи.</li></ol>
<p class="muted">Если нажать «Подключить» ещё раз, старый адрес перестанет работать — тогда его нужно заменить и в xDrip+.</p>`;out.innerHTML=connectHtml;
  }catch(e){if(out)out.innerHTML=`<div class="notice">${esc(e.message)}</div>`}
}
function copy(){const i=document.getElementById('cgmUrl');if(!i)return;i.select();try{navigator.clipboard.writeText(i.value).catch(()=>document.execCommand('copy'))}catch(e){document.execCommand('copy')}}
function paintFamily(){
  const host=document.getElementById('sync2');if(!host||!ready())return;let box=document.getElementById('cgmFamily');
  if(!box){box=document.createElement('div');box.id='cgmFamily';box.className='card';box.style.marginTop='14px';host.appendChild(box)}
  const L=latest();const canWrite=C().role!=='viewer';
  box.innerHTML=`<h3>📡 Сенсор (xDrip+)</h3>
<p class="muted">xDrip+ на телефоне сына может отправлять показания сенсора в общий дневник. Тогда сахар в реальном времени видят все члены семьи.</p>
${L?`<p>Последнее показание: <b>${L.g.toFixed(1)} ${L.arrow}</b> ммоль/л, ${ago(L.age)}.</p>`:connected?'<p>Ключ создан, ждём первые показания.</p>':''}
${canWrite?`<button class="btn ${connected?'secondary':''}" onclick="DMCgm.connect()">${connected?'Показать адрес заново (создать новый ключ)':'Подключить сенсор (xDrip+)'}</button>`:'<p class="muted">Подключить может только родитель или сам пациент.</p>'}
<div id="cgmConnect" style="margin-top:10px">${connectHtml}</div>`;
}

function paint(){try{paintDashboard()}catch(e){}try{paintGlucose();loadGmi()}catch(e){}try{fillCalc()}catch(e){}}
function start(){loadCache();paint();refresh(true);clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60e3);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh(true)})}

window.DMCgm={refresh,connect,copy,paint,paintFamily,latest,hours(h){hoursSel=h;paintGlucose()},readings:()=>readings};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();
