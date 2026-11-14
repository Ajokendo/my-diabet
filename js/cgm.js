/* «Мой диабет» — показания сенсора (CGM).
 * xDrip+ на телефоне ребёнка отправляет показания на наш сервер (как в Nightscout),
 * а приложение раз в минуту забирает их и показывает на «Сегодня», в «Аналитике сахара» и в расчёте дозы.
 * Работает только при подключённой «Семье» (нужен общий дневник). */
(function(){
const ARROW={DoubleUp:'⇈',SingleUp:'↑',FortyFiveUp:'↗',Flat:'→',FortyFiveDown:'↘',SingleDown:'↓',DoubleDown:'⇊'};
const ARROW_RU={DoubleUp:'быстро растёт',SingleUp:'растёт',FortyFiveUp:'медленно растёт',Flat:'стабильно',FortyFiveDown:'медленно снижается',SingleDown:'снижается',DoubleDown:'быстро снижается'};
const FRESH_MIN=20;
let readings=[],device='',connected=null,timer=null,lastFetch=0,err='',connectHtml='';

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
    connected=j.connected;if(j.device)device=j.device;err='';
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
function chartSvg(hours,cw){
  const pred=window.DMPredict?DMPredict.now(readings):null,ext=pred&&pred.type?Math.min(pred.line[pred.line.length-1].t-Date.now(),hours*3600e3*0.25):0;
  const nowT=Date.now(),to=nowT+Math.max(0,ext),from=nowT-hours*3600e3,pts=readings.filter(x=>x.t>=from);
  const W=Math.max(300,Math.round(cw||640)),H=W<600?190:230,pl=0,pr=0,pt=14,pb=22,ymax=Math.max(16,...pts.map(x=>x.g+1)),X=t=>pl+(t-from)/(to-from)*(W-pl-pr),Y=g=>pt+(1-g/ymax)*(H-pt-pb);
  let grid='';for(let g=4;g<=ymax;g+=4)grid+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(g)}" y2="${Y(g)}" stroke="#e2e8f0"/><text x="${pl+3}" y="${Y(g)-3}" font-size="11" text-anchor="start" fill="#64748b" stroke="#fff" stroke-width="3" paint-order="stroke">${g}</text>`;
  {const step=(hours<=3?1:hours<=6?1:hours<=12?2:4)*3600e3,t0=new Date(from);t0.setMinutes(0,0,0);let t=t0.getTime();if(t<from)t+=3600e3;while(new Date(t).getHours()%(step/3600e3))t+=3600e3;for(;t<=to;t+=step){const x=X(t),d=new Date(t);if(x<=pl+4||x>=W-pr-4)continue;const an=x<22?'start':x>W-22?'end':'middle';grid+=`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt}" y2="${H-pb}" stroke="#e2e8f0"/>`;grid+=`<text x="${x.toFixed(1)}" y="${H-6}" font-size="11" text-anchor="${an}" fill="#64748b">${String(d.getHours()).padStart(2,'0')}:00</text>`}}
  const band=`<rect x="${pl}" y="${Y(10)}" width="${W-pl-pr}" height="${Y(3.9)-Y(10)}" fill="#dcfce7" opacity=".7"/>`;
  let path='',prev=null;pts.forEach(p=>{const gap=prev&&p.t-prev.t>15*60e3;path+=(path===''||gap?'M':'L')+X(p.t).toFixed(1)+','+Y(p.g).toFixed(1);prev=p});
  const dots=pts.filter(p=>p.g<3.9||p.g>10).map(p=>`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.g).toFixed(1)}" r="2.2" fill="${p.g<3.9?'#dc2626':'#f59e0b'}"/>`).join('');
  const fut=ext>0?`<line x1="${X(nowT).toFixed(1)}" x2="${X(nowT).toFixed(1)}" y1="${pt}" y2="${H-pb}" stroke="#94a3b8" stroke-dasharray="3 3"/>`+DMPredict.svg(pred,X,Y):'';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${band}${grid}<path d="${path}" fill="none" stroke="#0d9488" stroke-width="2"/>${dots}${fut}</svg>`;
}
function stats(hours){const from=Date.now()-hours*3600e3,p=readings.filter(x=>x.t>=from);if(!p.length)return null;const n=p.length,avg=p.reduce((s,x)=>s+x.g,0)/n;
  return {n,avg,low:p.filter(x=>x.g<3.9).length/n*100,inr:p.filter(x=>x.g>=3.9&&x.g<=10).length/n*100,high:p.filter(x=>x.g>10).length/n*100,min:Math.min(...p.map(x=>x.g)),max:Math.max(...p.map(x=>x.g))}}
let hoursSel=6,gmi=null,gmiAt=0;
/* Расчётный HbA1c (GMI, Bergenstal 2018): GMI % = 3,31 + 0,02392 × средняя глюкоза в мг/дл. Надёжен при 14+ днях данных и покрытии ≥70%. */
async function loadGmi(){if(!ready()||Date.now()-gmiAt<(gmi?30*60e3:20e3))return;gmiAt=Date.now();
  try{let since=Date.now()-14*864e5,r=[];for(let i=0;i<12;i++){const j=await api(`/v1/patients/${encodeURIComponent(C().patientId)}/cgm?since=${since}`);const p=j.readings||[];r=r.concat(p);if(p.length<5000)break;since=p[p.length-1].t}
    if(!r.length){gmi=null;return}
    const mean=r.reduce((a,x)=>a+x.g,0)/r.length,days=(Date.now()-r[0].t)/864e5,cover=Math.min(100,r.length/(Math.max(days,1/24)*288)*100);
    gmi={v:3.31+0.02392*mean*18.016,mean,days,cover,n:r.length,tbr:r.filter(x=>x.g<3.9).length/r.length*100,tbr54:r.filter(x=>x.g<3).length/r.length*100,tir:r.filter(x=>x.g>=3.9&&x.g<=10).length/r.length*100,tar:r.filter(x=>x.g>10).length/r.length*100,tar139:r.filter(x=>x.g>13.9).length/r.length*100,sd:Math.sqrt(r.reduce((a,x)=>a+(x.g-mean)**2,0)/r.length)};paintGlucose();try{window.renderDashKpi&&renderDashKpi()}catch(e){}try{window.medicalAuto&&medicalAuto()}catch(e){}}catch(e){}}
function gmiHtml(){if(!gmi)return '';const ok=gmi.days>=13.5&&gmi.cover>=70;
  return `<div class="notice" style="margin-top:10px;background:#f0fdfa;border-color:#99f6e4"><b>Расчётный HbA1c (GMI): ${gmi.v.toFixed(1)}%</b> · средняя глюкоза ${gmi.mean.toFixed(1)} ммоль/л за ${gmi.days<1?'менее суток':Math.floor(gmi.days)+' дн.'} (данных ${Math.round(gmi.cover)}%).<br><span class="muted">${ok?'Посчитано по данным сенсора за 14 дней. ':'Пока мало данных — показатель станет надёжным после 14 дней работы сенсора. '}Это оценка, а не лабораторный анализ: настоящий HbA1c сдают в лаборатории и записывают в «Анализы».</span></div>`}
function paintGlucose(){
  const box=document.getElementById('cgmCard');if(!box)return;const manual=document.querySelector('#dashboard .glucoseManual');
  const L=latest();
  if(!L){box.innerHTML=ready()&&connected?`<div class="muted" style="margin-bottom:8px">Сенсор подключён — ждём первые показания (обычно до 5 минут).</div>`:'';if(manual)manual.style.display='';return}
  if(manual)manual.style.display='none';
  const s=stats(hoursSel);const [cls,txt]=!L.fresh?['statusHigh','● Нет новых данных']:L.g<3.9?['statusLow','● Низкий']:L.g>10?['statusHigh','● Высокий']:['statusGood','● В норме'];
  box.innerHTML=`<div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div style="min-width:0;max-width:100%"><div class="muted">Глюкоза с сенсора · ${ago(L.age)}</div><div class="cgmNow" style="margin-top:4px"><b style="color:${L.g<3.9?'#dc2626':L.g>10?'#d97706':'var(--text)'}">${L.g.toFixed(1).replace('.',',')}</b><span class="cgmArrow">${L.arrow}</span><span class="muted">ммоль/л</span></div><div class="${cls} cgmStatus" style="margin-top:6px">${txt}${L.fresh&&L.trend?', '+L.trend:''}</div></div>
<div class="row cgmHours" style="gap:6px">${[3,6,12,24].map(h=>`<button class="btn ${h===hoursSel?'':'secondary'}" style="padding:6px 10px" onclick="DMCgm.hours(${h})">${h} ч</button>`).join('')}</div></div>
${L.fresh&&window.DMPredict?DMPredict.banner(DMPredict.now(readings)):''}<div class="cgmChartTap" onclick="window.DMCgmBig&&DMCgmBig.open(${hoursSel})" title="Открыть график крупно">${chartSvg(hoursSel,box.clientWidth)}<span class="cgmZoom">⤢ Крупно, за дни и недели</span></div>
${s?`<div class="kpi cgmKpi" style="margin-top:6px"><div class="mini"><span class="muted">Среднее<span class="onMobile"><br>&nbsp;</span></span><b>${s.avg.toFixed(1)}</b></div><div class="mini"><span class="muted">В диапазоне<span class="onMobile"><br></span> 3,9–10</span><b>${Math.round(s.inr)}%</b></div><div class="mini"><span class="muted">Ниже 3,9</span><b style="color:#dc2626">${Math.round(s.low)}%</b></div><div class="mini"><span class="muted">Выше 10</span><b style="color:#d97706">${Math.round(s.high)}%</b></div><div class="mini onMobile"><span class="muted">Мин</span><b>${s.min.toFixed(1)}</b></div><div class="mini onMobile"><span class="muted">Макс</span><b>${s.max.toFixed(1)}</b></div><div class="mini onDesktop"><span class="muted">Мин / макс</span><b>${s.min.toFixed(1)} / ${s.max.toFixed(1)}</b></div></div><div class="muted" style="font-size:13px;margin-top:6px">За последние ${hoursSel} ч · сахар в ммоль/л</div>`:''}
${L.fresh&&window.DMSafety?DMSafety.noteFor(L.g):''}${!L.fresh?`<div class="notice" style="margin-top:8px">Сенсор не присылает данные уже ${ago(L.age).replace(" назад","")}. Проверьте xDrip+ на телефоне сына и интернет.</div>`:''}`;
}

/* Расчёт дозы: подставляем свежий сахар с сенсора, если поле пустое */
function fillCalc(){const i=document.getElementById('iG');const L=latest();if(!i)return;if(!i.value&&L&&L.age<=15){i.value=L.g.toFixed(1);i.dataset.auto=i.value;i.title='Подставлено с сенсора ('+ago(L.age)+')'}
  let h=document.getElementById('iGHint');if(!h){h=document.createElement('div');h.id='iGHint';h.className='muted';h.style.marginTop='4px';i.after(h);i.addEventListener('input',()=>{try{fillCalc()}catch(e){}})}
  const col=/Up/.test(L?.d||'')?'#d97706':/Down/.test(L?.d||'')?'#dc2626':'inherit';h.innerHTML=L&&L.age<=60?`Сенсор: <b>${L.g.toFixed(1).replace('.',',')} ${L.arrow}</b> <span style="color:${col}">${L.trend||''}</span> · ${ago(L.age)}`+(i.dataset.auto?(i.value===i.dataset.auto?'<br><span class="iGNote">Подставлено с сенсора. Если мерили глюкометром — исправьте значение.</span>':(i.value?'<br><span class="iGNote">Введено вручную (глюкометр).</span>':'')):''):''}

/* Карточка в «Семье» — подключение xDrip+ */
async function connect(){
  if(connected&&!confirm('Создать новый ключ для сенсора?\n\nСтарый адрес перестанет работать: показания сенсора перестанут приходить, пока вы не впишете новый адрес в xDrip+ на телефоне, где он установлен.\n\nНажимайте «ОК», только если xDrip+ нужно подключить заново.'))return;
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
function ownerImp(){try{return !!(window.DMPhotoQuota&&DMPhotoQuota.family())}catch(e){return false}}
function paintFamily(){
  const host=document.getElementById('sync2');if(!host||!ready())return;let box=document.getElementById('cgmFamily');
  if(!box){box=document.createElement('div');box.id='cgmFamily';box.className='card';box.style.marginTop='14px';host.appendChild(box)}
  const L=latest();const canWrite=C().role!=='viewer';
  box.innerHTML=`<h3>Сенсор (xDrip+)</h3>
<p class="muted">xDrip+ на телефоне сына может отправлять показания сенсора в общий дневник. Тогда сахар в реальном времени видят все члены семьи.</p>
${L?`<p>Последнее показание: <b>${L.g.toFixed(1)} ${L.arrow}</b> ммоль/л, ${ago(L.age)}.</p>`:connected?'<p>Ключ создан, ждём первые показания.</p>':''}
${canWrite?`<button class="btn ${connected?'secondary':''}" style="width:100%;text-align:center" onclick="DMCgm.connect()">${connected?'Показать адрес заново<br><span style="font-weight:400;font-size:.88em">(создать новый ключ)</span>':'Подключить сенсор (xDrip+)'}</button>`:'<p class="muted">Подключить может только родитель или сам пациент.</p>'}
<div id="cgmConnect" style="margin-top:10px">${connectHtml}</div>
${canWrite?`<details style="margin-top:14px"${importOpen?' open':''}><summary><b>Загрузить прошлую историю из Nightscout</b></summary>
<p class="muted">Если xDrip+ раньше отправлял данные в другой Nightscout (например, на jino), ${ownerImp()?'историю за прошлые месяцы можно перенести сюда — для отчёта врачу и GMI.':'показания за последние 3 дня можно перенести сюда.'} Уже имеющиеся показания не меняются.</p>
<label>Адрес Nightscout</label><input id="nsUrl" class="input" placeholder="https://имя.nightscout-jino.ru" value="${esc(nsSaved())}">
<label style="margin-top:8px">API secret или токен (если сайт закрыт)</label><input id="nsSecret" class="input" type="password" autocomplete="off" placeholder="можно оставить пустым">
<div class="row" style="margin-top:8px;gap:8px"><select id="nsDays" class="select" style="max-width:180px"><option value="1">1 день</option><option value="3"${ownerImp()?'':' selected'}>3 дня</option>${ownerImp()?'<option value="7" selected>7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option>':''}</select><button class="btn" onclick="DMCgm.importNs()" ${importBusy?'disabled':''}>${importBusy?'Загрузка…':'Загрузить'}</button></div>
<div id="nsOut" style="margin-top:8px">${importMsg}</div></details>`:''}`;
}

/* Предупреждение «сенсор/xDrip+ молчит» — плашка вверху любого раздела + системное уведомление (пока приложение открыто) */
const STALE_MIN=20;
function staleDismissKey(){return 'dm-cgm-stale-ok:'+(C().patientId||'')}
function paintStale(){
  let bar=document.getElementById('cgmStale');const L=latest();
  const stale=ready()&&L&&L.age>STALE_MIN&&L.age<7*24*60;
  let dismissed=0;try{dismissed=+localStorage.getItem(staleDismissKey())||0}catch(e){}
  if(!stale||dismissed===L.t){if(bar)bar.remove();return}
  if(!bar){bar=document.createElement('div');bar.id='cgmStale';bar.className='cgmStale';document.body.appendChild(bar)}
  const canAsk=('Notification' in window)&&Notification.permission==='default';
  bar.innerHTML=`<div><b>Нет данных с сенсора ${ago(L.age).replace(' назад','')}</b><br><span>Последнее значение ${L.g.toFixed(1).replace('.',',')} ммоль/л. Проверьте телефон сына: xDrip+ запущен, Bluetooth и интернет включены.</span></div><div class="row" style="gap:6px;flex-wrap:nowrap">${canAsk?'<button class="btn small secondary" onclick="DMCgm.askNotify()">Уведомлять</button>':''}<button class="btn small secondary" onclick="DMCgm.staleOk()">Понятно</button></div>`;
  notifyStale(L);
}
function notifyStale(L){
  try{if(!('Notification' in window)||Notification.permission!=='granted')return;
    const k='dm-cgm-stale-n:'+(C().patientId||'');if(+localStorage.getItem(k)===L.t)return;localStorage.setItem(k,String(L.t));
    const opt={body:'Последнее значение '+L.g.toFixed(1)+' ммоль/л. Проверьте xDrip+, Bluetooth и интернет на телефоне сына.',tag:'cgm-stale',icon:'assets/icons/icon-192.png'};
    if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification('Мой диабет: нет данных с сенсора',opt)).catch(()=>new Notification('Мой диабет: нет данных с сенсора',opt));
    else new Notification('Мой диабет: нет данных с сенсора',opt);
  }catch(e){}
}
function staleOk(){const L=latest();try{if(L)localStorage.setItem(staleDismissKey(),String(L.t))}catch(e){}paintStale()}
async function askNotify(){try{await Notification.requestPermission()}catch(e){}paintStale()}

function paint(){try{paintStale()}catch(e){}try{window.renderDashKpi&&renderDashKpi()}catch(e){}try{paintGlucose();loadGmi()}catch(e){}try{fillCalc()}catch(e){}}
function start(){let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{try{paintGlucose()}catch(e){}},200)});loadCache();paint();refresh(true);clearInterval(timer);timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();else{try{paintStale()}catch(e){}}},60e3);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh(true)})}

function reportHtml(){if(!gmi)return '';const f=v=>Math.round(v)+'%';return `<div class="reportSection" style="margin-top:18px"><h2>Данные сенсора (CGM) за последние ${gmi.days<1?'сутки':Math.min(14,Math.floor(gmi.days))+' дн.'}</h2><p>Средняя глюкоза: <b>${gmi.mean.toFixed(1)} ммоль/л</b> · стандартное отклонение ${gmi.sd.toFixed(1)} · коэффициент вариации ${Math.round(gmi.sd/gmi.mean*100)}% · расчётный HbA1c (GMI): <b>${gmi.v.toFixed(1)}%</b> · полнота данных ${Math.round(gmi.cover)}%.</p><p>Время в диапазоне 3,9–10: <b>${f(gmi.tir)}</b> · ниже 3,9: ${f(gmi.tbr)} (из них ниже 3,0: ${f(gmi.tbr54)}) · выше 10: ${f(gmi.tar)} (из них выше 13,9: ${f(gmi.tar139)}).</p><p class="muted">Источник: сенсор через xDrip+. GMI — расчётная оценка, не лабораторный HbA1c.</p></div>`}
/* Данные сенсора за произвольный период — для отчёта врачу (сервер отдаёт до 5000 точек за запрос, поэтому листаем) */
const periodCache={};let periodPending=null;
function dayKey(t){const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const inflight={};
async function period(start,end){const key=start+'_'+end;const c=periodCached(start,end);if(c)return c;if(!ready())return null;if(inflight[key])return inflight[key];
  const from=new Date(start+'T00:00:00').getTime(),to=new Date(end+'T23:59:59').getTime();
  periodPending=(async()=>{let since=from-1,all=[];for(let i=0;i<40;i++){const j=await api(`/v1/patients/${encodeURIComponent(C().patientId)}/cgm?since=${since}`);const r=j.readings||[];all=all.concat(r);if(r.length<5000)break;since=r[r.length-1].t}
    const r=all.filter(x=>x.t>=from&&x.t<=to);if(!r.length){periodCache[key]={n:0,raw:[],at:Date.now()};return periodCache[key]}
    const n=r.length,mean=r.reduce((a,x)=>a+x.g,0)/n,sd=Math.sqrt(r.reduce((a,x)=>a+(x.g-mean)**2,0)/n),q=f=>r.filter(f).length/n*100;
    const byDay={};r.forEach(x=>{(byDay[dayKey(x.t)]??=[]).push(x.g)});const daily=Object.keys(byDay).sort().map(d=>({date:d,v:byDay[d].reduce((a,b)=>a+b,0)/byDay[d].length}));
    const spanDays=(to-Math.max(from,r[0].t))/864e5,cover=Math.min(100,n/(Math.max(spanDays,1/24)*288)*100);
    periodCache[key]={n,mean,sd,v:3.31+0.02392*mean*18.016,tir:q(x=>x.g>=3.9&&x.g<=10),tbr:q(x=>x.g<3.9),tbr54:q(x=>x.g<3),tar:q(x=>x.g>10),tar139:q(x=>x.g>13.9),min:Math.min(...r.map(x=>x.g)),max:Math.max(...r.map(x=>x.g)),days:daily.length,cover,daily,first:r[0].t,last:r[n-1].t,raw:r,at:Date.now()};return periodCache[key]})();
  inflight[key]=periodPending;try{return await periodPending}catch(e){periodCache[key]={error:e.message||String(e),at:Date.now()};return periodCache[key]}finally{periodPending=null;delete inflight[key]}}
function periodCached(start,end){const c=periodCache[start+'_'+end];if(!c)return null;if(Date.now()-(c.at||0)>10*60e3){delete periodCache[start+'_'+end];return null}return c}
/* Импорт истории из другого Nightscout — кусками по 3 дня, чтобы сервер успевал */
let importBusy=false,importMsg='',importOpen=false;
function nsSaved(){try{return localStorage.getItem('dm-ns-url')||''}catch(e){return ''}}
async function importNs(){if(importBusy)return;const url=(document.getElementById('nsUrl')?.value||'').trim(),secret=(document.getElementById('nsSecret')?.value||'').trim(),days=+(document.getElementById('nsDays')?.value||7);if(days>7&&!confirm('Загрузить историю сенсора за '+days+' дн.?\n\nЭто много записей. У бесплатного сервера есть дневной лимит: при большой загрузке синхронизация у всей семьи может остановиться до 06:00 следующего утра (показания сенсора тогда тоже не будут видны в приложении).\n\nЕсли нужно только заполнить недавний пробел, выберите 1–3 дня.'))return;
  if(!/^https?:\/\//i.test(url))return alert('Вставьте адрес Nightscout, начиная с https://');try{localStorage.setItem('dm-ns-url',url.replace(/\/\/[^@/]*@/,'//'))}catch(e){}
  importBusy=true;importOpen=true;let total=0,oldest=null;const step=3*864e5,end=Date.now(),start=end-days*864e5;const out=()=>{const o=document.getElementById('nsOut');if(o)o.innerHTML=importMsg};
  try{for(let to=end,i=0;to>start;to-=step,i++){const from=Math.max(start,to-step);importMsg=`Загружаю… ${Math.round(i*step/864e5)} из ${days} дней, найдено показаний: ${total.toLocaleString('ru-RU')}`;out();
      const j=await fetch(server()+`/v1/patients/${encodeURIComponent(C().patientId)}/cgm-import`,{method:'POST',headers:{'Authorization':'Bearer '+C().token,'Content-Type':'application/json'},body:JSON.stringify({url,secret,from,to})}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.error||('Ошибка '+r.status));return x});
      total+=j.found||0;if(j.first)oldest=Math.min(oldest||j.first,j.first)}
    importMsg=total?`<div class="notice" style="background:#f0fdfa;border-color:#99f6e4">Готово: перенесено показаний — <b>${total.toLocaleString('ru-RU')}</b>, самые ранние от ${new Date(oldest).toLocaleDateString('ru-RU')}. Они уже учитываются в отчёте врачу и аналитике.</div>`:'<div class="notice">В этом Nightscout за выбранный период показаний не нашлось. Проверьте адрес и ключ.</div>';
    Object.keys(periodCache).forEach(k=>delete periodCache[k]);gmiAt=0;
  }catch(e){importMsg=`<div class="notice">${esc(e.message)}${total?` (до ошибки перенесено ${total.toLocaleString('ru-RU')})`:''}</div>`}
  importBusy=false;paintFamily();try{loadGmi()}catch(e){}}
window.DMCgm={readings:()=>readings,importNs,gmi:()=>gmi,device:()=>device,isConnected:()=>connected,period,periodCached,ready,pending:()=>periodPending,staleOk,askNotify,reportHtml,refresh,connect,copy,paint,paintFamily,latest,hours(h){hoursSel=h;paintGlucose()},readings:()=>readings};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,300));else setTimeout(start,300);
})();
