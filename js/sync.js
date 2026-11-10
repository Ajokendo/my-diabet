/* «Мой диабет» — семейная синхронизация через Cloudflare Worker + D1.
 * Данные пациента делятся на записи (профиль, настройки, меню по дням, замеры, анализы, инсулин…).
 * Изменённые записи отправляются на сервер, чужие изменения забираются оттуда. При одновременной
 * правке одной и той же записи остаётся последняя отправленная версия.
 * Состояние синхронизации хранится в db.cloud2 и в localStorage (снимок отправленного) и само не синхронизируется. */
(function(){
const DEFAULT_SERVER='https://my-diabet.ajokendo.workers.dev';
const SHADOW_PREFIX='dm-sync2-shadow:';
let busy=false,timer=null,lastError='';

function C(){db.cloud2=db.cloud2||{};return db.cloud2}
function server(){return (C().server||db.settings?.photo?.server||DEFAULT_SERVER).replace(/\/$/,'')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hash(v){const s=JSON.stringify(v??null);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+s.length}
function rid(){return 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function shadowKey(){return SHADOW_PREFIX+(C().patientId||'')}
function loadShadow(){try{return JSON.parse(localStorage.getItem(shadowKey())||'{}')}catch(e){return {}}}
function saveShadow(s){try{localStorage.setItem(shadowKey(),JSON.stringify(s))}catch(e){}}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}

async function api(path,body,method){
  const c=C(),o={method:method||'POST',headers:{'Content-Type':'application/json'}};
  if(c.token)o.headers.Authorization='Bearer '+c.token;
  if(o.method!=='GET')o.body=JSON.stringify(body||{});
  let r;try{r=await fetch(server()+path,o)}catch(e){const er=new Error('Нет связи с сервером. Проверьте интернет.');er.offline=true;throw er}
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok){const er=new Error(j.error||('Ошибка '+r.status));er.status=r.status;throw er}
  return j;
}

/* ---- Данные пациента → записи ---- */
const COLLECTIONS={diary:()=>db.diary,activity:()=>db.activity,recipes:()=>db.recipes,labs:()=>db.labs,docs:()=>db.docs,ins:()=>db.medical?.actualInsulinLog,calc:()=>db.medical?.calculationLog};
function records(){
  const m={},put=(t,id,v)=>{m[t+'|'+id]=v};
  ['diary','activity'].forEach(k=>(db[k]||[]).forEach(x=>{if(x&&!x.id)x.id=rid()}));
  put('profile','1',db.profile||{});put('settings','1',db.settings||{});put('ratios','1',db.ratios||{});
  put('favorites','1',db.favorites||{});put('preferences','1',db.preferences||{});put('waterLog','1',db.waterLog||{});
  const med=clone(db.medical||{});delete med.calculationLog;delete med.actualInsulinLog;delete med.safetyEvents;put('medical','1',med);
  for(const [t,get] of Object.entries(COLLECTIONS))(get()||[]).forEach(x=>{if(x&&x.id!=null)put(t,x.id,x)});
  (db.foods||[]).forEach(f=>{if(/^u\d/.test(String(f.id)))put('food',f.id,f)});
  Object.entries(db.menus||{}).forEach(([day,v])=>put('menu',day,v));
  return m;
}
function listFor(t){
  if(t==='ins'||t==='calc'){db.medical=db.medical||{};const k=t==='ins'?'actualInsulinLog':'calculationLog';if(!Array.isArray(db.medical[k]))db.medical[k]=[];return db.medical[k]}
  if(!Array.isArray(db[t]))db[t]=[];return db[t];
}
function apply(ch){
  const t=ch.recordType,id=ch.recordId,p=ch.payload,del=ch.deleted;
  if(['profile','settings','ratios','favorites','preferences','waterLog'].includes(t)){if(!del)db[t]=p||{};return}
  if(t==='medical'){if(!del){const keep={calculationLog:db.medical?.calculationLog,actualInsulinLog:db.medical?.actualInsulinLog,safetyEvents:db.medical?.safetyEvents};db.medical={...(p||{}),...keep}}return}
  if(t==='menu'){db.menus=db.menus||{};if(del)delete db.menus[id];else db.menus[id]=p;return}
  if(t==='food'){db.foods=db.foods||[];const i=db.foods.findIndex(f=>String(f.id)===id);if(del){if(i>=0)db.foods.splice(i,1)}else if(i>=0)db.foods[i]=p;else db.foods.push(p);return}
  if(COLLECTIONS[t]){const a=listFor(t),i=a.findIndex(x=>String(x?.id)===id);if(del){if(i>=0)a.splice(i,1)}else if(i>=0)a[i]=p;else a.push(p)}
}

/* ---- Синхронизация ---- */
async function pullAll(shadow,markApplied){
  const c=C();let more=true,applied=0;
  while(more){const j=await api('/v2/sync/pull',{patientId:c.patientId,cursor:c.cursor||0,limit:500});
    for(const ch of j.changes||[]){apply(ch);applied++;const k=ch.recordType+'|'+ch.recordId;if(ch.deleted)delete shadow[k];else markApplied.add(k)}
    c.cursor=j.cursor||c.cursor||0;more=!!j.hasMore}
  return applied;
}
async function syncNow(manual){
  const c=C();if(!c.token||!c.patientId)return;if(busy){if(manual)setTimeout(()=>syncNow(true),800);return}
  busy=true;lastError='';render();
  try{
    let shadow=loadShadow(),applied=0;const touched=new Set();
    if(!c.initialized){c.cursor=0;shadow={};applied+=await pullAll(shadow,touched);const cur=records();touched.forEach(k=>{if(k in cur)shadow[k]=hash(cur[k])});c.initialized=true;saveShadow(shadow);storage.save(db)}
    if(c.role!=='viewer'){
      const cur=records(),ev=[];
      for(const [k,v] of Object.entries(cur)){const h=hash(v);if(shadow[k]!==h){const [t,...r]=k.split('|');ev.push({recordType:t,recordId:r.join('|'),operation:'upsert',payload:v,clientEventId:k+'@'+h,_h:h})}}
      for(const k of Object.keys(shadow))if(!(k in cur)){const [t,...r]=k.split('|');ev.push({recordType:t,recordId:r.join('|'),operation:'delete',clientEventId:k+'@del',_h:null})}
      for(let i=0;i<ev.length;i+=250){const part=ev.slice(i,i+250);const j=await api('/v2/sync/push',{patientId:c.patientId,events:part.map(({_h,...e})=>e)});
        const ok=new Set((j.accepted||[]).map(a=>a.recordType+'|'+a.recordId));part.forEach(e=>{const k=e.recordType+'|'+e.recordId;if(ok.has(k)){if(e._h)shadow[k]=e._h;else delete shadow[k]}});saveShadow(shadow)}
    }
    const t2=new Set();applied+=await pullAll(shadow,t2);
    if(t2.size){const cur=records();t2.forEach(k=>{if(k in cur)shadow[k]=hash(cur[k])})}
    saveShadow(shadow);c.lastSyncAt=new Date().toISOString();storage.save(db);
    if(applied)refreshUi();
  }catch(e){lastError=e.message||String(e);if(e.status===401){c.token=null;storage.save(db);lastError='Сессия закончилась — войдите снова.'}if(manual)alert(lastError)}
  finally{busy=false;render()}
}
function pending(){const c=C();if(!c.token||!c.initialized)return 0;const s=loadShadow(),cur=records();let n=0;for(const [k,v] of Object.entries(cur))if(s[k]!==hash(v))n++;for(const k of Object.keys(s))if(!(k in cur))n++;return n}
function schedule(ms){clearTimeout(timer);if(C().token)timer=setTimeout(()=>syncNow(false),ms??1500)}
function refreshUi(){try{if(typeof syncCatalog==='function')syncCatalog(db)}catch(e){}try{loadDay()}catch(e){}try{const a=document.querySelector('.section.active')?.id;if(a&&a!=='dashboard'&&a!=='menu'&&a!=='account')show(a)}catch(e){}}

/* ---- Аккаунт, приглашения ---- */
function wipeLocal(){db.menus={};db.diary=[];db.activity=[];db.labs=[];db.docs=[];db.waterLog={};db.medical=db.medical||{};db.medical.actualInsulinLog=[];db.medical.calculationLog=[];db.foods=(db.foods||[]).filter(f=>!/^u\d/.test(String(f.id)))}
function hasLocalData(){return Object.values(db.menus||{}).some(a=>Array.isArray(a)?a.length:Object.values(a||{}).some(x=>x?.length))||(db.diary||[]).length||(db.labs||[]).length||((db.medical||{}).actualInsulinLog||[]).length}
function startSession(j,patient,joining){
  const c=C();c.token=j.token||c.token;c.user=j.user||c.user;c.server=server();
  if(patient){if(c.patientId!==patient.id){c.cursor=0;c.initialized=false}c.patientId=patient.id;c.patientName=patient.displayName;c.role=patient.role}
  if(joining&&!c.initialized&&hasLocalData()&&confirm('На этом телефоне уже есть записи. Заменить их общим дневником семьи?\n\nОК — заменить (рекомендуется для телефона родителя).\nОтмена — объединить записи этого телефона с общими.'))wipeLocal();
  if(c.user&&db.identity?.currentUser){db.identity.currentUser.displayName=c.user.displayName;db.identity.currentUser.email=c.user.email}
  storage.save(db);render();if(c.patientId)syncNow(false);
}
async function register(){
  const name=v('s2Name'),email=v('s2Email'),pw=v('s2Pw'),mode=v('s2Mode'),code=v('s2Code');
  if(!email||pw.length<8)return alert('Введите email и пароль не короче 8 символов.');
  if(mode==='join'&&!code)return alert('Введите код приглашения.');
  try{C().server=v('s2Server')||server();
    const j=await api('/v1/auth/register',{displayName:name,email,password:pw,patientName:db.profile?.name||name,createPatient:mode!=='join'});
    C().token=j.token;C().user=j.user;
    if(mode==='join'){const a=await api('/v1/invitations/'+encodeURIComponent(code)+'/accept',{});startSession(j,a.patient,true)}
    else startSession(j,j.patients[0],false);
  }catch(e){alert(e.message)}
}
async function login(){
  const email=v('s2Email'),pw=v('s2Pw'),code=v('s2Code');if(!email||!pw)return alert('Введите email и пароль.');
  try{C().server=v('s2Server')||server();const j=await api('/v1/auth/login',{email,password:pw});C().token=j.token;C().user=j.user;
    let p=j.patients[0];if(code){const a=await api('/v1/invitations/'+encodeURIComponent(code)+'/accept',{});p=a.patient}
    if(!p)return alert('Аккаунт есть, но дневника в нём нет. Введите код приглашения и нажмите «Войти» ещё раз.'),render();
    startSession(j,p,true);
  }catch(e){alert(e.message)}
}
async function acceptCode(){const code=v('s2JoinCode');if(!code)return;try{const a=await api('/v1/invitations/'+encodeURIComponent(code)+'/accept',{});startSession({},a.patient,true);alert('Готово: вы подключены к дневнику «'+a.patient.displayName+'».')}catch(e){alert(e.message)}}
async function invite(){
  try{const j=await api('/v1/patients/'+encodeURIComponent(C().patientId)+'/invitations',{displayName:v('s2InvName'),role:v('s2InvRole')});
    const code=j.invitation.code,txt=`Приглашение в «Мой диабет» (дневник: ${C().patientName}).\n1) Откройте ${location.origin+location.pathname.replace(/index\.html$/,"")} и установите приложение.\n2) Раздел «Семья» → «Я подключаюсь по коду» → введите код: ${code}\nКод действует 7 дней.`;
    document.getElementById('s2InvOut').innerHTML=`<div class="notice" style="margin-top:10px"><div class="muted">Код приглашения (${esc(j.invitation.roleLabel)}, 7 дней):</div><div style="font-size:30px;font-weight:900;letter-spacing:3px;margin:6px 0">${code}</div><textarea class="input" rows="5" style="width:100%" readonly id="s2InvTxt">${esc(txt)}</textarea><button class="btn small" style="margin-top:6px" onclick="DMSync.copyInvite()">Скопировать текст</button> <a class="btn small secondary" target="_blank" href="https://wa.me/?text=${encodeURIComponent(txt)}">Отправить в WhatsApp</a></div>`;
  }catch(e){alert(e.message)}
}
function copyInvite(){const t=document.getElementById('s2InvTxt');t.select();try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand('copy')}}
let memberList=[];const RANK={patient:0,guardian:1,viewer:2};
async function members(){const el=document.getElementById('s2Members');if(!el||!C().token||!C().patientId)return;try{const j=await api('/v1/patients/'+encodeURIComponent(C().patientId)+'/members',null,'GET');memberList=(j.members||[]).map((m,i)=>({m,i})).sort((a,b)=>(RANK[a.m.role]??9)-(RANK[b.m.role]??9)||a.i-b.i).map(x=>x.m);const canEdit=C().role!=='viewer';
  el.innerHTML=memberList.map(m=>`<div class="mini" style="margin:6px 0" id="mem_${esc(m.id)}"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="flex:1;min-width:0"><b>${esc(m.displayName||m.email)}${m.me?' <span class="muted" style="font-weight:400">(вы)</span>':''}</b><span class="pill">${esc(m.roleLabel)}</span><br><span class="muted" style="overflow-wrap:anywhere">${esc(m.email)}</span></div>${canEdit||m.me?`<button class="btn small secondary" style="flex:none" onclick="DMSync.editMember('${esc(m.id)}')">Изменить</button>`:''}</div></div>`).join('')}catch(e){el.innerHTML='<span class="muted">'+esc(e.message)+'</span>'}}
async function removeMember(id){const m=memberList.find(x=>x.id===id);if(!m)return;if(!confirm(m.me?'Выйти из этого дневника? Вы перестанете видеть его данные на всех своих устройствах.':`Удалить «${m.displayName||m.email}» (${m.email}) из дневника? Этот аккаунт перестанет видеть данные. Вернуть можно новым кодом приглашения.`))return;
  try{await api('/v1/patients/'+encodeURIComponent(C().patientId)+'/members/'+encodeURIComponent(id),{remove:true});if(m.me){const c=C();db.cloud2={server:c.server};storage.save(db)}render()}catch(e){alert(e.message)}}
async function changePassword(){const p1=prompt('Новый пароль (не короче 8 символов):');if(!p1)return;if(p1.length<8)return alert('Пароль должен быть не короче 8 символов.');const p2=prompt('Повторите новый пароль:');if(p1!==p2)return alert('Пароли не совпадают.');
  try{await api('/v1/auth/password',{password:p1});alert('Пароль изменён. Запишите его: им можно входить на других устройствах ('+(C().user?.email||'')+').')}catch(e){alert(e.message)}}
function editMember(id){const m=memberList.find(x=>x.id===id);const box=document.getElementById('mem_'+id);if(!m||!box)return;const canRole=C().role!=='viewer';
  box.innerHTML=`<div class="two"><div><label>Имя в дневнике</label><input id="memName" class="input" value="${esc(m.displayName||'')}" placeholder="например, Ата"></div>${canRole?`<div><label>Права</label><select id="memRole" class="select"><option value="guardian">Родитель — видит и вносит</option><option value="patient">Пациент — видит и вносит</option><option value="viewer">Только просмотр</option></select></div>`:''}</div><div class="row" style="gap:8px;margin-top:8px"><button class="btn small" onclick="DMSync.saveMember('${esc(id)}')">Сохранить</button><button class="btn small secondary" onclick="DMSync.members()">Отмена</button>${canRole||m.me?`<button class="btn small danger" style="margin-left:auto" onclick="DMSync.removeMember('${esc(id)}')">Удалить из дневника</button>`:''}</div>`;
  const r=document.getElementById('memRole');if(r)r.value=m.role}
async function saveMember(id){const m=memberList.find(x=>x.id===id);const name=v('memName'),role=document.getElementById('memRole')?.value;const b={};if(name&&name!==m.displayName)b.displayName=name;if(role&&role!==m.role)b.role=role;if(!Object.keys(b).length)return members();
  try{await api('/v1/patients/'+encodeURIComponent(C().patientId)+'/members/'+encodeURIComponent(id),b);if(m.me){if(b.displayName&&C().user)C().user.displayName=b.displayName;if(b.role)C().role=b.role;storage.save(db)}render()}catch(e){alert(e.message)}}
function logout(){if(!confirm('Выйти из семейного аккаунта? Записи на этом телефоне останутся, но перестанут синхронизироваться.'))return;const c=C();api('/v1/auth/logout',{}).catch(()=>{});db.cloud2={server:c.server};storage.save(db);render()}
function v(id){return (document.getElementById(id)?.value||'').trim()}

/* ---- Экран ---- */
function render(){
  const el=document.getElementById('sync2');if(!el)return;const c=C();
  if(!c.token||!c.patientId){
    el.innerHTML=`<div class="grid"><div class="card s7"><h3>Подключить семью</h3>
<p class="muted">Один общий дневник на всех: сын ведёт записи, родители видят их у себя и тоже могут вносить. Нужен интернет; без него приложение работает как раньше и отправит изменения позже.</p>
<label>Кто вы</label><select id="s2Mode" class="select" onchange="DMSync.modeUi()"><option value="own">Это мой дневник — создаю общий дневник</option><option value="join">Я подключаюсь по коду приглашения</option></select>
<div id="s2CodeBox" style="display:none;margin-top:8px"><label>Код приглашения</label><input id="s2Code" class="input" placeholder="например, 9ML2RE97" style="text-transform:uppercase"></div>
<div class="two" style="margin-top:8px"><div><label>Ваше имя</label><input id="s2Name" class="input" placeholder="Имя"></div><div><label>Email</label><input id="s2Email" type="email" class="input" placeholder="name@example.com" autocomplete="username"></div></div>
<label style="margin-top:8px">Пароль (не короче 8 символов)</label><input id="s2Pw" type="password" class="input" autocomplete="current-password">
<div class="row" style="margin-top:12px;gap:8px"><button class="btn" onclick="DMSync.register()">Создать аккаунт</button><button class="btn secondary" onclick="DMSync.login()">У меня уже есть аккаунт — войти</button></div>
<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0"><button class="btn" style="width:100%" onclick="DMLink.showQr()">📱 Войти по QR-коду с телефона</button><p class="muted" style="font-size:13px;margin-top:6px">Для компьютера или нового телефона: без email и пароля, как в WhatsApp Web.</p></div>
<details style="margin-top:10px"><summary class="muted">Сервер</summary><input id="s2Server" class="input" value="${esc(server())}"></details></div>
<div class="card s5"><h3>Как подключить семью</h3><ol style="padding-left:18px;line-height:1.6"><li>На телефоне <b>сына</b>: «Это мой дневник» → «Создать аккаунт». Его записи станут общими.</li><li>Там же — «Пригласить» → код → отправить маме и папе.</li><li>На телефонах родителей: «Я подключаюсь по коду» → код → «Создать аккаунт».</li></ol><p class="muted">Пароль хранится на сервере только в зашифрованном виде.</p></div></div>`;
    return;
  }
  const n=pending();
  el.innerHTML=`<div class="grid"><div class="card s6"><h3>Общий дневник: ${esc(c.patientName||'')}</h3>
<div class="kpi"><div class="mini"><span class="muted">Вы</span><b>${esc(c.user?.displayName||c.user?.email||'')}</b></div><div class="mini"><span class="muted">Последняя синхронизация</span><b>${c.lastSyncAt?new Date(c.lastSyncAt).toLocaleString('ru-RU'):'—'}</b></div><div class="mini"><span class="muted">Ждут отправки</span><b>${busy?'…':n}</b></div></div>
${lastError?`<div class="notice" style="margin-top:8px">${esc(lastError)}</div>`:''}
<div class="row" style="margin-top:12px;gap:8px"><button class="btn" onclick="DMSync.syncNow(true)" ${busy?'disabled':''}>${busy?'Синхронизация…':'🔄 Синхронизировать сейчас'}</button><button class="btn secondary" onclick="DMLink.scan()">💻 Подключить компьютер</button><button class="btn secondary" onclick="DMSync.changePassword()">🔑 Сменить пароль</button><button class="btn secondary" onclick="DMSync.logout()">Выйти</button></div><div class="muted" style="margin-top:6px">Вход: ${esc(c.user?.email||'')}</div>
<h3 style="margin-top:18px">Участники</h3><div id="s2Members" class="muted">Загрузка…</div></div>
<div class="card s6"><h3>Пригласить в дневник</h3>${c.role==='viewer'?'<p class="muted">У вас доступ только для просмотра.</p>':`<div class="two"><div><label>Кого</label><input id="s2InvName" class="input" placeholder="например, Мама"></div><div><label>Права</label><select id="s2InvRole" class="select"><option value="guardian">Родитель — видит и вносит</option><option value="patient">Пациент — видит и вносит</option><option value="viewer">Только просмотр (например, врач)</option></select></div></div><button class="btn" style="margin-top:10px" onclick="DMSync.invite()">Создать код приглашения</button><div id="s2InvOut"></div>`}
<h3 style="margin-top:18px">Подключиться к другому дневнику</h3><div class="row" style="gap:8px"><input id="s2JoinCode" class="input" placeholder="код" style="max-width:180px;text-transform:uppercase"><button class="btn secondary" onclick="DMSync.acceptCode()">Подключиться</button></div></div></div>`;
  members();
  try{window.DMCgm&&DMCgm.paintFamily();window.DMCgm&&DMCgm.refresh()}catch(e){}
}
function modeUi(){document.getElementById('s2CodeBox').style.display=v('s2Mode')==='join'?'':'none'}

window.DMSync={members,editMember,saveMember,removeMember,changePassword,adopt:(j,p)=>startSession(j,p,true),syncNow,register,login,logout,invite,acceptCode,copyInvite,render,modeUi,pending};
/* Автосинхронизация: после каждого сохранения, при открытии и раз в минуту, когда приложение на экране. */
const origSave=window.save;window.save=function(){const r=origSave.apply(this,arguments);schedule();return r};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(300)});
window.addEventListener('online',()=>schedule(300));
setInterval(()=>{if(document.visibilityState==='visible')schedule(0)},60000);
const origShow=window.show;window.show=function(id){const r=origShow.apply(this,arguments);if(id==='account')render();return r};
if(db.cloud)db.cloud.authenticated=false;
schedule(1200);
})();
