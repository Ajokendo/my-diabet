// Cloudflare Worker «Мой диабет»: распознавание еды по фото + семейная синхронизация.
//
// Настройки воркера (Settings):
//   Секреты:   ANTHROPIC_API_KEY (для фото), PHOTO_ACCESS_CODE (код для фото, желательно).
//   Переменная (необязательно): ANTHROPIC_MODEL (по умолчанию claude-sonnet-5-5).
//   Binding:   D1 database, имя переменной DB (для синхронизации). Таблицы создаются сами.
//   Переменные (необязательно): OWNER_EMAILS — почты (через запятую) вашей семьи: распознавание фото без лимита
//              и создание кодов. Если не задано — без лимита первая созданная семья.
//              FREE_PHOTOS — бесплатных распознаваний для новой семьи (по умолчанию 10).
//              PHOTO_CONTACT — куда писать за кодом (показывается в приложении), например «WhatsApp +996 …».
//   Триггер (необязательно): Cron «*/10 * * * *» — уведомление «нет данных с сенсора».
const REFS={card:'банковская карта 85,6 × 54 мм',plate:'тарелка/пиала, внешний диаметр {d} мм',none:null};
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Access-Code, Authorization, api-secret','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS'};
const J=(s,o)=>new Response(JSON.stringify(o),{status:s,headers:{...CORS,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function buildPrompt(b){
  const names=(Array.isArray(b.catalog)?b.catalog:[]).slice(0,800).map(String);
  let ref=REFS[b.reference?.type]||null;
  if(ref&&b.reference.type==='plate')ref=ref.replace('{d}',String(Math.round(+b.reference.diameterMm||0)));
  return `Ты помогаешь человеку с сахарным диабетом оценить еду на фото. Фото 1 — вид сверху${b.images?.length>1?', фото 2 — вид сбоку (по нему оценивай высоту и толщину слоя)':''}.
${ref?`На фото есть ориентир известного размера: ${ref}. Найди его и используй как масштаб для оценки размеров и объёма еды.`:'Ориентира размера нет — оценивай по типичным размерам посуды и приборов и ставь уверенность не выше "medium".'}
Важно для глубокой посуды (миски, пиалы, кастрюльки, стеклянная посуда): по фото сверху глубина не видна — оценивай уровень жидкости/еды по фото сбоку, учитывай толщину стенок и что посуда сужается ко дну; если фото сбоку нет — ставь уверенность "low" и не завышай объём. Для супов указывай массу без посуды.
Задача: перечисли отдельные блюда/продукты, для каждого оцени массу в граммах (объём × типичная плотность этого блюда).
Как считать объём: сначала по ориентиру измерь размеры в мм (длина, ширина, высота). Для округлых предметов (фрукты, овощи, котлеты, булочки, горки еды) используй формулу эллипсоида V = 3,14/6 × длина × ширина × высота (мм³; раздели на 1000 — получишь см³). Для плоских слоёв — площадь × толщина. Посчитай арифметику аккуратно и приведи её в note (размеры → объём → масса).
Учитывай перспективу: предмет выше стола ближе к камере и кажется крупнее карты, лежащей на столе, — не завышай размеры.
Проверка здравого смысла: сравни результат с типичной массой одной штуки (например, хурма 120–200 г, яблоко 150–200 г, мандарин 60–90 г, банан без кожуры 100–130 г, куриное яйцо 50–60 г, кусок хлеба 25–35 г). Если оценка расходится с типичной больше чем в 1,5 раза — перепроверь размеры и объясни расхождение в note.
Сопоставь каждое с ОДНИМ названием из каталога ниже (точная строка). Если подходящего нет — catalogName: null и предложи своё название в name.
Не считай калории и углеводы — это сделает приложение по своей базе. Не давай советов по инсулину.
Ответь ТОЛЬКО JSON без пояснений:
{"referenceFound":true|false,"items":[{"name":"что видно","catalogName":"строка из каталога или null","grams":число,"confidence":"low|medium|high","note":"коротко: на что опиралась оценка"}],"warnings":["например: часть еды не видна, соус может содержать сахар"]}
Каталог: ${names.join('; ')}`;
}

/* ---------- Распознавание фото ---------- */
async function foodPhoto(req,env){
  let b;try{b=await req.json()}catch{return J(400,{error:'Неверный запрос.'})}
  const gate=await photoGate(req,env,b);if(gate.err)return gate.err;
  if(!env.ANTHROPIC_API_KEY)return J(503,{error:'Не задан ANTHROPIC_API_KEY.'});
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(x=>x&&x.data);if(!imgs.length)return J(400,{error:'Нет фото.'});
  const model=env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
  const content=imgs.map(x=>({type:'image',source:{type:'base64',media_type:x.mediaType||'image/jpeg',data:String(x.data).replace(/^data:[^,]+,/,'')}}));content.push({type:'text',text:buildPrompt(b)});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:1500,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)return J(502,{error:j?.error?.message||('Ошибка API '+r.status)});
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');const m=text.match(/\{[\s\S]*\}/);if(!m)return J(502,{error:'Ответ модели не в формате JSON.'});
  let out;try{out=JSON.parse(m[0])}catch{return J(502,{error:'Ответ модели не разобран.'})}
  out.items=(Array.isArray(out.items)?out.items:[]).map(x=>({name:String(x.name||''),catalogName:x.catalogName?String(x.catalogName):null,grams:Math.max(0,Math.round(+x.grams||0)),confidence:['low','medium','high'].includes(x.confidence)?x.confidence:'low',note:String(x.note||'')}));
  out.warnings=Array.isArray(out.warnings)?out.warnings.map(String):[];out.model=model;
  if(gate.pid){try{await quotaSpend(env,gate.pid);out.quota=await quota(env,gate.pid)}catch(e){}}
  return J(200,out);
}

/* ---------- Синхронизация ---------- */
const SCHEMA=[
 "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,display_name TEXT,pw_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY,display_name TEXT,created_at TEXT NOT NULL,seq INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,patient_id TEXT NOT NULL,role TEXT NOT NULL,display_name TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,patient_id))",
 "CREATE TABLE IF NOT EXISTS invitations(code TEXT PRIMARY KEY,patient_id TEXT NOT NULL,role TEXT NOT NULL,display_name TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL,accepted_by TEXT)",
 "CREATE TABLE IF NOT EXISTS records(patient_id TEXT NOT NULL,rtype TEXT NOT NULL,rid TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT,deleted INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,updated_by TEXT,seq INTEGER NOT NULL,PRIMARY KEY(patient_id,rtype,rid))",
 "CREATE INDEX IF NOT EXISTS records_seq ON records(patient_id,seq)",
 "CREATE TABLE IF NOT EXISTS links(code_hash TEXT PRIMARY KEY,status TEXT NOT NULL,user_id TEXT,patient_id TEXT,token TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS cgm_keys(key_hash TEXT PRIMARY KEY,patient_id TEXT NOT NULL,created_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS cgm(patient_id TEXT NOT NULL,ts INTEGER NOT NULL,mgdl REAL NOT NULL,direction TEXT,device TEXT,PRIMARY KEY(patient_id,ts))",
 "CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT)",
 "CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY,patient_id TEXT NOT NULL,user_id TEXT NOT NULL,sub TEXT NOT NULL,prefs TEXT,state TEXT,created_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS photo_quota(patient_id TEXT PRIMARY KEY,free_used INTEGER NOT NULL DEFAULT 0,paid_left INTEGER NOT NULL DEFAULT 0,total_used INTEGER NOT NULL DEFAULT 0,updated_at TEXT)",
 "CREATE TABLE IF NOT EXISTS photo_codes(code TEXT PRIMARY KEY,photos INTEGER NOT NULL,note TEXT,created_by TEXT,created_at TEXT NOT NULL,used_by TEXT,used_at TEXT)"
];
let schemaReady=false;
async function ensureSchema(env){if(schemaReady)return;await env.DB.batch(SCHEMA.map(s=>env.DB.prepare(s)));schemaReady=true}
const now=()=>new Date().toISOString();
const rnd=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a};
const b64u=a=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hex=a=>[...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');
const uid=p=>p+'_'+hex(rnd(12));
async function sha1(s){return hex(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(s)))}
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function pbkdf2(pw,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},k,256))}
function safeEq(a,b){if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
const ROLES={guardian:{write:true,invite:true},patient:{write:true,invite:true},viewer:{write:false,invite:false}};
const ROLE_RU={guardian:'Родитель',patient:'Пациент',viewer:'Только просмотр'};
const CODE_ALPH='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode=()=>[...rnd(8)].map(x=>CODE_ALPH[x%CODE_ALPH.length]).join('');

async function issueSession(env,userId){const t=b64u(rnd(32));await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await sha256(t),userId,now(),new Date(Date.now()+180*864e5).toISOString()).run();return t}
async function authUser(req,env){const h=req.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return null;const s=await env.DB.prepare('SELECT s.user_id,s.expires_at,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').bind(await sha256(h.slice(7))).first();if(!s||s.expires_at<now())return null;return {id:s.user_id,email:s.email,displayName:s.display_name}}
async function patientsOf(env,userId){const r=await env.DB.prepare("SELECT p.id,p.display_name,m.role FROM members m JOIN patients p ON p.id=m.patient_id WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at").bind(userId).all();return r.results.map(x=>({id:x.id,displayName:x.display_name,role:x.role}))}
async function roleIn(env,userId,pid){const m=await env.DB.prepare("SELECT role FROM members WHERE user_id=? AND patient_id=? AND status='active'").bind(userId,pid).first();return m?m.role:null}
async function body(req){try{return await req.json()}catch{return {}}}


/* ---------- Web Push (уведомления на телефон, в т.ч. iPhone с приложением на экране «Домой») ---------- */
const enc=s=>new TextEncoder().encode(s);
const cat=(...a)=>{const n=a.reduce((x,y)=>x+y.length,0),o=new Uint8Array(n);let i=0;for(const x of a){o.set(x,i);i+=x.length}return o};
const ub64=s=>{s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o};
let VAPID=null;
async function vapid(env){
  if(VAPID)return VAPID;
  let row=await env.DB.prepare("SELECT v FROM kv WHERE k='vapid'").first();
  if(!row){const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const jwk=await crypto.subtle.exportKey('jwk',kp.privateKey),pub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey));
    await env.DB.prepare("INSERT OR IGNORE INTO kv VALUES('vapid',?)").bind(JSON.stringify({jwk,pub:b64u(pub)})).run();
    row=await env.DB.prepare("SELECT v FROM kv WHERE k='vapid'").first()}
  const v=JSON.parse(row.v);VAPID={pub:v.pub,key:await crypto.subtle.importKey('jwk',v.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign'])};return VAPID}
async function hkdf(salt,ikm,info,len){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,len*8))}
async function pushEncrypt(sub,text){
  const ua=ub64(sub.keys.p256dh),auth=ub64(sub.keys.auth);
  const as=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const asPub=new Uint8Array(await crypto.subtle.exportKey('raw',as.publicKey));
  const uaKey=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},as.privateKey,256));
  const ikm=await hkdf(auth,shared,cat(enc('WebPush: info\0'),ua,asPub),32);
  const salt=rnd(16),cek=await hkdf(salt,ikm,enc('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(salt,ikm,enc('Content-Encoding: nonce\0'),12);
  const k=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},k,cat(enc(text),new Uint8Array([2]))));
  return cat(salt,new Uint8Array([0,0,16,0]),new Uint8Array([65]),asPub,ct)}
async function pushSend(env,row,payload,urgent){
  const sub=JSON.parse(row.sub),V=await vapid(env),aud=new URL(sub.endpoint).origin;
  const h=b64u(enc(JSON.stringify({typ:'JWT',alg:'ES256'}))),c=b64u(enc(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+12*3600,sub:'https://my-diabet.pages.dev'})));
  const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},V.key,enc(h+'.'+c)));
  const body=await pushEncrypt(sub,JSON.stringify(payload));
  const r=await fetch(sub.endpoint,{method:'POST',headers:{'TTL':urgent?'600':'1800','Urgency':urgent?'high':'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','Authorization':`vapid t=${h}.${c}.${b64u(sig)}, k=${V.pub}`},body});
  if(r.status===404||r.status===410)await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(row.endpoint).run();
  return r.status}
const PREF_DEF={low:3.9,high:13,lowOn:true,highOn:true,fallOn:true,staleOn:true,repeat:30,quietOn:false,quietFrom:'23:00',quietTo:'07:00',sound:true,tz:'Asia/Bishkek'};
function localMin(tz){try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).split(':');return (+p[0]%24)*60+(+p[1])}catch(e){const d=new Date();return d.getUTCHours()*60+d.getUTCMinutes()}}
function inQuiet(P){if(!P.quietOn)return false;const m=localMin(P.tz),a=(s=>{const[x,y]=String(s).split(':');return(+x||0)*60+(+y||0)})(P.quietFrom),b=(s=>{const[x,y]=String(s).split(':');return(+x||0)*60+(+y||0)})(P.quietTo);return a<=b?(m>=a&&m<b):(m>=a||m<b)}
const ARR={DoubleUp:'⇈',SingleUp:'↑',FortyFiveUp:'↗',Flat:'→',FortyFiveDown:'↘',SingleDown:'↓',DoubleDown:'⇊'};
async function checkAlerts(env,pid,stale){
  const subs=(await env.DB.prepare('SELECT * FROM push_subs WHERE patient_id=?').bind(pid).all()).results;if(!subs.length)return;
  const L=await env.DB.prepare('SELECT ts,mgdl,direction FROM cgm WHERE patient_id=? ORDER BY ts DESC LIMIT 1').bind(pid).first();if(!L)return;
  const pat=await env.DB.prepare('SELECT display_name FROM patients WHERE id=?').bind(pid).first(),who=(pat&&pat.display_name)||'';
  const age=(Date.now()-L.ts)/60000,g=Math.round(L.mgdl/18.016*10)/10,gs=String(g).replace('.',','),arr=ARR[L.direction]||'';
  for(const row of subs){
    const P={...PREF_DEF,...JSON.parse(row.prefs||'{}')},S=JSON.parse(row.state||'{}'),t=Date.now(),out=[];
    const cond={};
    if(stale){cond.stale=P.staleOn&&age>=30&&age<12*60}
    else if(age<=15){
      cond.urgent=g<3.0;cond.low=P.lowOn&&!cond.urgent&&g<P.low;cond.high=P.highOn&&g>P.high&&!inQuiet(P);
      cond.fall=P.fallOn&&(L.direction==='DoubleDown'||(L.direction==='SingleDown'&&g<7))&&!cond.low&&!cond.urgent&&!inQuiet(P);cond.stale=false}
    else continue;
    for(const [type,on] of Object.entries(cond)){
      if(!on){if(S[type])delete S[type];continue}
      const rep=(type==='urgent'?10:type==='stale'?60:Math.max(10,+P.repeat||30))*60e3;
      if(S[type]&&t-S[type]<rep)continue;S[type]=t;
      const tm=new Intl.DateTimeFormat('ru-RU',{timeZone:P.tz||'Asia/Bishkek',hour:'2-digit',minute:'2-digit'}).format(new Date(L.ts));
      const T={urgent:`СРОЧНО: очень низкий сахар ${gs} ${arr}`,low:`Низкий сахар: ${gs} ${arr}`,high:`Высокий сахар: ${gs} ${arr}`,fall:`Сахар быстро падает: ${gs} ${arr}`,stale:`Нет данных с сенсора ${Math.round(age)} мин`}[type];
      const B=type==='stale'?`${who?who+': ':''}последнее значение ${gs} ммоль/л в ${tm}. Проверьте телефон с сенсором: Bluetooth и интернет.`:`${who?who+' · ':''}${tm}. Проверьте и действуйте по плану врача.`;
      out.push({type,payload:{title:T,body:B,tag:'dm-'+type,urgent:type==='urgent'||type==='low',sound:!!P.sound,url:'./'}});
    }
    for(const o of out)try{await pushSend(env,row,o.payload,o.payload.urgent)}catch(e){}
    await env.DB.prepare('UPDATE push_subs SET state=? WHERE endpoint=?').bind(JSON.stringify(S),row.endpoint).run();
  }
}
async function staleSweep(env){await ensureSchema(env);const r=(await env.DB.prepare('SELECT DISTINCT patient_id FROM push_subs').all()).results;for(const x of r)try{await checkAlerts(env,x.patient_id,true)}catch(e){}}

/* ---------- Распознавание фото: лимит на семью и коды пополнения ---------- */
async function isOwnerFamily(env,pid){
  const list=String(env.OWNER_EMAILS||'').split(/[,; ]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(list.length){const r=await env.DB.prepare("SELECT u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.patient_id=? AND m.status='active'").bind(pid).all();return r.results.some(x=>list.includes(String(x.email).toLowerCase()))}
  const f=await env.DB.prepare('SELECT id FROM patients ORDER BY created_at LIMIT 1').first();return !!f&&f.id===pid}
async function isOwnerUser(env,user){
  const list=String(env.OWNER_EMAILS||'').split(/[,; ]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(list.length)return list.includes(String(user.email).toLowerCase());
  const f=await env.DB.prepare('SELECT id FROM patients ORDER BY created_at LIMIT 1').first();if(!f)return false;
  const m=await env.DB.prepare("SELECT role FROM members WHERE patient_id=? AND user_id=? AND status='active'").bind(f.id,user.id).first();return !!m&&m.role!=='viewer'}
async function quota(env,pid){
  const free=Math.max(0,+(env.FREE_PHOTOS??10)||0);
  const q=await env.DB.prepare('SELECT * FROM photo_quota WHERE patient_id=?').bind(pid).first()||{free_used:0,paid_left:0,total_used:0};
  if(await isOwnerFamily(env,pid))return {unlimited:true,left:null,used:q.total_used,contact:env.PHOTO_CONTACT||''};
  const freeLeft=Math.max(0,free-q.free_used);
  return {unlimited:false,left:freeLeft+q.paid_left,freeLeft,paidLeft:q.paid_left,free,used:q.total_used,contact:env.PHOTO_CONTACT||''}}
async function quotaSpend(env,pid){
  const Q=await quota(env,pid);
  if(Q.unlimited)return env.DB.prepare("INSERT INTO photo_quota(patient_id,total_used,updated_at) VALUES(?,1,?) ON CONFLICT(patient_id) DO UPDATE SET total_used=total_used+1,updated_at=excluded.updated_at").bind(pid,now()).run();
  if(Q.freeLeft>0)return env.DB.prepare("INSERT INTO photo_quota(patient_id,free_used,total_used,updated_at) VALUES(?,1,1,?) ON CONFLICT(patient_id) DO UPDATE SET free_used=free_used+1,total_used=total_used+1,updated_at=excluded.updated_at").bind(pid,now()).run();
  return env.DB.prepare("UPDATE photo_quota SET paid_left=MAX(paid_left-1,0),total_used=total_used+1,updated_at=? WHERE patient_id=?").bind(now(),pid).run()}
/* Кто распознаёт: вошедший в «Семью» (лимит семьи) или старый способ — общий код доступа */
async function photoGate(req,env,b){
  const pid=String(b.patientId||'');
  if(env.DB&&pid&&(req.headers.get('Authorization')||'').startsWith('Bearer ')){
    await ensureSchema(env);const user=await authUser(req,env);
    if(user&&await roleIn(env,user.id,pid)){const Q=await quota(env,pid);if(!Q.unlimited&&Q.left<=0)return {err:J(402,{error:'Распознавания по фото закончились. Введите код, чтобы продолжить.',quota:Q})};return {pid}}
  }
  if(env.PHOTO_ACCESS_CODE&&req.headers.get('X-Access-Code')===env.PHOTO_ACCESS_CODE)return {pid:null};
  if(!env.PHOTO_ACCESS_CODE&&!env.DB)return {pid:null};
  return {err:J(401,{error:'Чтобы распознавать фото, войдите в «Семью» (раздел «Ещё» → «Семья»).'})}}
const PCODE=()=>'F-'+[...rnd(8)].map(x=>CODE_ALPH[x%CODE_ALPH.length]).join('').replace(/(.{4})(.{4})/,'$1-$2');

async function sync(req,env,path){
  if(!env.DB)return J(503,{error:'База синхронизации не подключена (D1 binding DB).'});
  await ensureSchema(env);
  const M=req.method;
  if(M==='POST'&&path==='/v1/auth/register'){
    const b=await body(req),email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||''),name=String(b.displayName||'').trim()||email.split('@')[0];
    if(!email.includes('@')||pw.length<8)return J(400,{error:'Введите email и пароль не короче 8 символов.'});
    if(await env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first())return J(409,{error:'Аккаунт с таким email уже есть — войдите.'});
    const salt=hex(rnd(16)),u={id:uid('usr'),email,displayName:name};
    const ops=[env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').bind(u.id,email,name,await pbkdf2(pw,salt),salt,now())];
    let patients=[];
    if(b.createPatient!==false){const pid=uid('pat'),pname=String(b.patientName||name).trim()||'Пациент';ops.push(env.DB.prepare('INSERT INTO patients(id,display_name,created_at,seq) VALUES(?,?,?,0)').bind(pid,pname,now()),env.DB.prepare('INSERT INTO members VALUES(?,?,?,?,?,?,?)').bind(uid('mem'),u.id,pid,b.role==='guardian'?'guardian':'patient',name,'active',now()));patients=[{id:pid,displayName:pname,role:b.role==='guardian'?'guardian':'patient'}]}
    await env.DB.batch(ops);
    return J(201,{token:await issueSession(env,u.id),user:u,patients});
  }
  if(M==='POST'&&path==='/v1/auth/login'){
    const b=await body(req),email=String(b.email||'').trim().toLowerCase(),u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if(!u||!safeEq(await pbkdf2(String(b.password||''),u.salt),u.pw_hash))return J(401,{error:'Неверный email или пароль.'});
    return J(200,{token:await issueSession(env,u.id),user:{id:u.id,email:u.email,displayName:u.display_name},patients:await patientsOf(env,u.id)});
  }
  /* Вход на другом устройстве по QR-коду (как WhatsApp Web): компьютер показывает код, телефон с входом подтверждает */
  if(M==='POST'&&path==='/v1/link/start'){const code=b64u(rnd(24));await env.DB.prepare("INSERT INTO links VALUES(?,'pending',NULL,NULL,NULL,?,?)").bind(await sha256(code),now(),new Date(Date.now()+180e3).toISOString()).run();
    if(Math.random()<0.1)await env.DB.prepare('DELETE FROM links WHERE expires_at<?').bind(new Date(Date.now()-600e3).toISOString()).run();return J(200,{code,expiresIn:180})}
  const lm=path.match(/^\/v1\/link\/([A-Za-z0-9_-]{20,64})$/);
  if(M==='GET'&&lm){const h=await sha256(lm[1]);const r=await env.DB.prepare('SELECT * FROM links WHERE code_hash=?').bind(h).first();
    if(!r||r.expires_at<now()&&r.status!=='approved')return J(410,{error:'Код устарел. Обновите QR-код.'});
    if(r.status!=='approved')return J(200,{status:'pending'});
    await env.DB.prepare('DELETE FROM links WHERE code_hash=?').bind(h).run();
    const u=await env.DB.prepare('SELECT id,email,display_name FROM users WHERE id=?').bind(r.user_id).first();
    const pts=await patientsOf(env,r.user_id);const pt=pts.find(x=>x.id===r.patient_id)||pts[0]||null;
    return J(200,{status:'approved',token:r.token,user:{id:u.id,email:u.email,displayName:u.display_name},patients:pts,patient:pt})}
  const user=await authUser(req,env);if(!user)return J(401,{error:'Нужно войти заново.'});
  const la=path.match(/^\/v1\/link\/([A-Za-z0-9_-]{20,64})\/approve$/);
  if(M==='POST'&&la){const b=await body(req);const h=await sha256(la[1]);const r=await env.DB.prepare('SELECT * FROM links WHERE code_hash=?').bind(h).first();
    if(!r||r.status!=='pending'||r.expires_at<now())return J(410,{error:'QR-код устарел. Обновите его на компьютере и отсканируйте снова.'});
    const pid=String(b.patientId||'');if(pid&&!(await roleIn(env,user.id,pid)))return J(403,{error:'Нет доступа к этому дневнику.'});
    const t=await issueSession(env,user.id);await env.DB.prepare("UPDATE links SET status='approved',user_id=?,patient_id=?,token=? WHERE code_hash=?").bind(user.id,pid||null,t,h).run();return J(200,{ok:true})}

  if(M==='POST'&&path==='/v1/auth/logout'){const h=req.headers.get('Authorization').slice(7);await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(h)).run();return J(200,{ok:true})}
  if(M==='GET'&&path==='/v1/me')return J(200,{user,patients:await patientsOf(env,user.id)});
  if(M==='POST'&&path==='/v1/auth/password'){const b=await body(req),np=String(b.password||'');if(np.length<8)return J(400,{error:'Пароль должен быть не короче 8 символов.'});
    const salt=hex(rnd(16));await env.DB.prepare('UPDATE users SET pw_hash=?,salt=? WHERE id=?').bind(await pbkdf2(np,salt),salt,user.id).run();return J(200,{ok:true})}
  const mm=path.match(/^\/v1\/patients\/([^/]+)\/members\/([^/]+)$/);
  if(mm&&M==='POST'){const pid=decodeURIComponent(mm[1]),mid=decodeURIComponent(mm[2]),role=await roleIn(env,user.id,pid);if(!role)return J(403,{error:'Нет доступа.'});
    const m=await env.DB.prepare("SELECT id,user_id,role FROM members WHERE id=? AND patient_id=? AND status='active'").bind(mid,pid).first();if(!m)return J(404,{error:'Участник не найден.'});
    const self=m.user_id===user.id;if(!self&&!ROLES[role].invite)return J(403,{error:'Менять других участников может только родитель или пациент.'});
    const b=await body(req),name=b.displayName!=null?String(b.displayName).trim().slice(0,60):null,nr=b.role&&ROLES[b.role]?b.role:null;
    if(b.remove){if(!self&&!ROLES[role].invite)return J(403,{error:'Удалять участников может только родитель или пациент.'});
      const w3=await env.DB.prepare("SELECT COUNT(*) n FROM members WHERE patient_id=? AND status='active' AND role IN ('guardian','patient') AND id<>?").bind(pid,mid).first();if(!w3||!w3.n)return J(400,{error:'Нельзя удалить последнего участника с правом записи.'});
      await env.DB.prepare("UPDATE members SET status='removed' WHERE id=?").bind(mid).run();return J(200,{ok:true,removed:true,self})}
    if(nr&&!ROLES[role].invite)return J(403,{error:'Недостаточно прав, чтобы менять роль.'});
    if(nr==='viewer'&&m.role!=='viewer'){const w2=await env.DB.prepare("SELECT COUNT(*) n FROM members WHERE patient_id=? AND status='active' AND role IN ('guardian','patient') AND id<>?").bind(pid,mid).first();if(!w2||!w2.n)return J(400,{error:'В дневнике должен остаться хотя бы один участник с правом записи.'})}
    const ops=[];if(name)ops.push(env.DB.prepare('UPDATE members SET display_name=? WHERE id=?').bind(name,mid));if(nr)ops.push(env.DB.prepare('UPDATE members SET role=? WHERE id=?').bind(nr,mid));if(name&&self)ops.push(env.DB.prepare('UPDATE users SET display_name=? WHERE id=?').bind(name,user.id));
    if(ops.length)await env.DB.batch(ops);return J(200,{ok:true,self})}
  const pm=path.match(/^\/v1\/patients\/([^/]+)\/(members|invitations)$/);
  if(pm){const pid=decodeURIComponent(pm[1]),role=await roleIn(env,user.id,pid);if(!role)return J(403,{error:'Нет доступа.'});
    if(M==='GET'&&pm[2]==='members'){const r=await env.DB.prepare("SELECT m.id,m.user_id,m.role,m.display_name,m.created_at,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.patient_id=? AND m.status='active' ORDER BY m.created_at").bind(pid).all();return J(200,{members:r.results.map(x=>({id:x.id,me:x.user_id===user.id,role:x.role,roleLabel:ROLE_RU[x.role]||x.role,displayName:x.display_name,email:x.email,since:x.created_at}))})}
    if(M==='POST'&&pm[2]==='invitations'){if(!ROLES[role].invite)return J(403,{error:'Недостаточно прав для приглашения.'});const b=await body(req),r=ROLES[b.role]?b.role:'guardian',code=newCode(),exp=new Date(Date.now()+7*864e5).toISOString();await env.DB.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?,NULL)').bind(code,pid,r,String(b.displayName||'').slice(0,60),user.id,now(),exp,'pending').run();return J(201,{invitation:{code,role:r,roleLabel:ROLE_RU[r],expiresAt:exp}})}
  }
  const im=path.match(/^\/v1\/invitations\/([^/]+)\/accept$/);
  if(im&&M==='POST'){const code=decodeURIComponent(im[1]).trim().toUpperCase(),inv=await env.DB.prepare('SELECT * FROM invitations WHERE code=?').bind(code).first();
    if(!inv||inv.status!=='pending'||inv.expires_at<now())return J(400,{error:'Код приглашения неверный или устарел.'});
    const ex=await roleIn(env,user.id,inv.patient_id);
    const ops=[env.DB.prepare("UPDATE invitations SET status='accepted',accepted_by=? WHERE code=?").bind(user.id,code)];
    if(!ex){ops.push(env.DB.prepare('DELETE FROM members WHERE user_id=? AND patient_id=?').bind(user.id,inv.patient_id));ops.push(env.DB.prepare('INSERT INTO members VALUES(?,?,?,?,?,?,?)').bind(uid('mem'),user.id,inv.patient_id,inv.role,inv.display_name||user.displayName,'active',now()))}
    await env.DB.batch(ops);const p=await env.DB.prepare('SELECT id,display_name FROM patients WHERE id=?').bind(inv.patient_id).first();
    return J(200,{ok:true,patient:{id:p.id,displayName:p.display_name,role:ex||inv.role}});
  }
  if(path==='/v1/push/key'&&M==='GET')return J(200,{key:(await vapid(env)).pub});
  const pq=path.match(/^\/v1\/patients\/([^/]+)\/(push|push-test|photo-quota|photo-code)$/);
  if(pq){const pid=pq[1],role=await roleIn(env,user.id,pid);if(!role)return J(403,{error:'Нет доступа к этому дневнику.'});
    if(pq[2]==='push'&&M==='POST'){const b=await body(req),sub=b.subscription;
      if(b.remove){await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(String(b.endpoint||'')).run();return J(200,{ok:true})}
      if(!sub||!sub.endpoint||!sub.keys||!sub.keys.p256dh||!sub.keys.auth||!/^https:\/\//.test(sub.endpoint))return J(400,{error:'Нет подписки на уведомления.'});
      const prefs={...PREF_DEF,...(b.prefs||{})};
      await env.DB.prepare('INSERT INTO push_subs(endpoint,patient_id,user_id,sub,prefs,state,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET patient_id=excluded.patient_id,user_id=excluded.user_id,sub=excluded.sub,prefs=excluded.prefs').bind(sub.endpoint,pid,user.id,JSON.stringify(sub),JSON.stringify(prefs),'{}',now()).run();
      return J(200,{ok:true})}
    if(pq[2]==='push-test'&&M==='POST'){const b=await body(req);const row=await env.DB.prepare('SELECT * FROM push_subs WHERE endpoint=?').bind(String(b.endpoint||'')).first();if(!row)return J(404,{error:'Этот телефон не подписан. Включите уведомления ещё раз.'});
      const P={...PREF_DEF,...JSON.parse(row.prefs||'{}')};const st=await pushSend(env,row,{title:'Мой диабет: проверка',body:'Уведомления работают. Так будут приходить сигналы о сахаре.',tag:'dm-test',urgent:false,sound:!!P.sound,url:'./'},false);
      return st>=200&&st<300?J(200,{ok:true}):J(502,{error:'Сервис уведомлений ответил '+st})}
    if(pq[2]==='photo-quota'&&M==='GET'){const Q=await quota(env,pid);Q.owner=await isOwnerUser(env,user);return J(200,Q)}
    if(pq[2]==='photo-code'&&M==='POST'){const b=await body(req),code=String(b.code||'').trim().toUpperCase().replace(/\s+/g,'');
      const c=await env.DB.prepare('SELECT * FROM photo_codes WHERE code=?').bind(code).first();
      if(!c)return J(404,{error:'Код не найден. Проверьте, нет ли опечатки.'});if(c.used_by)return J(409,{error:'Этот код уже использован.'});
      await env.DB.batch([env.DB.prepare('UPDATE photo_codes SET used_by=?,used_at=? WHERE code=? AND used_by IS NULL').bind(pid,now(),code),
        env.DB.prepare("INSERT INTO photo_quota(patient_id,paid_left,updated_at) VALUES(?,?,?) ON CONFLICT(patient_id) DO UPDATE SET paid_left=paid_left+excluded.paid_left,updated_at=excluded.updated_at").bind(pid,c.photos,now())]);
      return J(200,{ok:true,added:c.photos,quota:await quota(env,pid)})}
  }
  if(path==='/v1/admin/photo-codes'){if(!await isOwnerUser(env,user))return J(403,{error:'Создавать коды может только автор приложения.'});
    if(M==='POST'){const b=await body(req),n=Math.min(Math.max(+b.count||1,1),20),ph=Math.min(Math.max(+b.photos||50,1),5000),note=String(b.note||'').slice(0,80),out=[];
      for(let i=0;i<n;i++){const code=PCODE();out.push(code);await env.DB.prepare('INSERT INTO photo_codes(code,photos,note,created_by,created_at) VALUES(?,?,?,?,?)').bind(code,ph,note,user.id,now()).run()}
      return J(200,{codes:out,photos:ph})}
    const r=await env.DB.prepare('SELECT c.code,c.photos,c.note,c.created_at,c.used_at,p.display_name FROM photo_codes c LEFT JOIN patients p ON p.id=c.used_by ORDER BY c.created_at DESC LIMIT 60').all();
    const fam=await env.DB.prepare('SELECT p.display_name,q.total_used,q.free_used,q.paid_left FROM photo_quota q JOIN patients p ON p.id=q.patient_id ORDER BY q.updated_at DESC LIMIT 40').all();
    return J(200,{codes:r.results,families:fam.results})}
  const cm=path.match(/^\/v1\/patients\/([^/]+)\/(cgm|cgm-key|cgm-import)$/);
  if(cm){const role=await roleIn(env,user.id,cm[1]);if(!role)return J(403,{error:'Нет доступа к этому дневнику.'});
    if(cm[2]==='cgm-key'&&M==='POST'){if(!ROLES[role].write)return J(403,{error:'Нужны права на запись.'});
      const secret=[...rnd(16)].map(x=>'abcdefghijkmnpqrstuvwxyz23456789'[x%32]).join('');
      await env.DB.batch([env.DB.prepare('DELETE FROM cgm_keys WHERE patient_id=?').bind(cm[1]),env.DB.prepare('INSERT INTO cgm_keys VALUES(?,?,?)').bind(await sha1(secret),cm[1],now())]);
      const host=new URL(req.url).host;return J(200,{secret,url:`https://${secret}@${host}/api/v1/`})}
    if(cm[2]==='cgm-import'&&M==='POST'){if(!ROLES[role].write)return J(403,{error:'Нужны права на запись.'});
      /* Импорт истории из чужого Nightscout: клиент присылает адрес, ключ и кусок периода (до ~7 дней), сервер забирает и сохраняет. Свои записи не перезаписываются. */
      const b=await body(req);let base=String(b.url||'').trim().replace(/\/+$/,'').replace(/\/api\/v1.*$/,'');
      let tok='';try{const U=new URL(base);if(U.protocol!=='https:'&&U.protocol!=='http:')throw 0;if(U.username){tok=decodeURIComponent(U.username);U.username='';U.password=''}base=U.toString().replace(/\/+$/,'')}catch(e){return J(400,{error:'Неверный адрес Nightscout.'})}
      const secret=String(b.secret||tok||'').trim(),from=Math.round(+b.from||0),to=Math.round(+b.to||Date.now());if(!from||to<=from||to-from>15*864e5)return J(400,{error:'Неверный период.'});
      const q=`${base}/api/v1/entries/sgv.json?count=6000&find[date][$gte]=${from}&find[date][$lt]=${to}`+(secret&&/-[0-9a-f]{8,}$/i.test(secret)?`&token=${encodeURIComponent(secret)}`:'');
      const h={'Accept':'application/json'};if(secret&&!/-[0-9a-f]{8,}$/i.test(secret))h['api-secret']=await sha1(secret);
      let r;try{r=await fetch(q,{headers:h})}catch(e){return J(502,{error:'Nightscout не отвечает: '+(e.message||e)})}
      if(r.status===401||r.status===403)return J(401,{error:'Nightscout не пустил: нужен API secret или токен для чтения.'});
      if(!r.ok)return J(502,{error:'Nightscout ответил ошибкой '+r.status});
      let arr;try{arr=await r.json()}catch(e){return J(502,{error:'Nightscout вернул не JSON. Проверьте адрес.'})}
      const rows=(Array.isArray(arr)?arr:[]).filter(e=>e&&+e.sgv>=20&&+e.sgv<=600&&+e.date>=from&&+e.date<to);
      for(let i=0;i<rows.length;i+=500)await env.DB.batch(rows.slice(i,i+500).map(e=>env.DB.prepare('INSERT OR IGNORE INTO cgm VALUES(?,?,?,?,?)').bind(cm[1],Math.round(+e.date),+e.sgv,String(e.direction||''),String(e.device||'').slice(0,60))));
      return J(200,{found:rows.length,first:rows.length?Math.min(...rows.map(e=>+e.date)):null})}
    if(cm[2]==='cgm'&&M==='GET'){const q=new URL(req.url).searchParams;const since=Math.max(+q.get('since')||0,Date.now()-200*864e5);
      const r=await env.DB.prepare('SELECT ts,mgdl,direction FROM cgm WHERE patient_id=? AND ts>? ORDER BY ts LIMIT 5000').bind(cm[1],since).all();
      const k=await env.DB.prepare('SELECT created_at FROM cgm_keys WHERE patient_id=?').bind(cm[1]).first();
      let dev=null;try{dev=await env.DB.prepare('SELECT device FROM cgm WHERE patient_id=? ORDER BY ts DESC LIMIT 1').bind(cm[1]).first()}catch(e){}
      return J(200,{connected:!!k,device:dev?.device||'',readings:r.results.map(x=>({t:x.ts,g:Math.round(x.mgdl/18.016*10)/10,d:x.direction||''}))})}
  }
  if(M==='POST'&&(path==='/v2/sync/push'||path==='/v2/sync/pull')){
    const b=await body(req),pid=String(b.patientId||''),role=await roleIn(env,user.id,pid);if(!role)return J(403,{error:'Нет доступа к пациенту.'});
    if(path==='/v2/sync/push'){
      if(!ROLES[role].write)return J(403,{error:'Только просмотр.'});
      const ev=(Array.isArray(b.events)?b.events:[]).slice(0,300).filter(e=>e&&e.recordType&&e.recordId!=null);
      if(!ev.length)return J(200,{accepted:[]});
      const p=await env.DB.prepare('UPDATE patients SET seq=seq+? WHERE id=? RETURNING seq').bind(ev.length,pid).first();let seq=p.seq-ev.length;const t=now(),ops=[],acc=[];
      for(const e of ev){seq++;const del=e.operation==='delete'?1:0,payload=del?null:JSON.stringify(e.payload??null);if(payload&&payload.length>200000)continue;
        ops.push(env.DB.prepare('INSERT INTO records(patient_id,rtype,rid,version,payload,deleted,updated_at,updated_by,seq) VALUES(?,?,?,1,?,?,?,?,?) ON CONFLICT(patient_id,rtype,rid) DO UPDATE SET version=version+1,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at,updated_by=excluded.updated_by,seq=excluded.seq').bind(pid,String(e.recordType),String(e.recordId),payload,del,t,user.id,seq));
        acc.push({clientEventId:e.clientEventId||null,recordType:String(e.recordType),recordId:String(e.recordId),sequence:seq});}
      if(ops.length)await env.DB.batch(ops);return J(200,{accepted:acc,cursor:seq});
    }
    const cur=Number(b.cursor||0),lim=Math.min(Number(b.limit||500),1000);
    const r=await env.DB.prepare('SELECT rtype,rid,version,payload,deleted,updated_at,updated_by,seq FROM records WHERE patient_id=? AND seq>? ORDER BY seq LIMIT ?').bind(pid,cur,lim).all();
    const changes=r.results.map(x=>({recordType:x.rtype,recordId:x.rid,version:x.version,payload:x.payload?JSON.parse(x.payload):null,deleted:!!x.deleted,updatedAt:x.updated_at,updatedBy:x.updated_by,sequence:x.seq}));
    return J(200,{changes,cursor:changes.length?changes[changes.length-1].sequence:cur,hasMore:changes.length===lim});
  }
  return J(404,{error:'Не найдено'});
}


/* Терпимый разбор JSON от модели: убирает ```-обёртку и лишние запятые, а если ответ оборван — закрывает скобки на последнем целом элементе */
function parseLoose(text){
  let t=String(text||'').replace(/```(?:json)?/gi,'');const i=t.indexOf('{');if(i<0)return null;t=t.slice(i);
  const tryP=x=>{try{return JSON.parse(x)}catch{return undefined}};
  let r=tryP(t.slice(0,t.lastIndexOf('}')+1));if(r!==undefined)return r;
  const nc=x=>x.replace(/,\s*([}\]])/g,'$1');r=tryP(nc(t.slice(0,t.lastIndexOf('}')+1)));if(r!==undefined)return r;
  // оборванный ответ: идём по строке, запоминаем позиции запятых вне строк и стек скобок в этих точках
  const cuts=[];let st=[],inS=false,esc=false;
  for(let k=0;k<t.length;k++){const c=t[k];
    if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}
    if(c==='"')inS=true;else if(c==='{'||c==='[')st.push(c);else if(c==='}'||c===']')st.pop();else if(c===','&&st.length)cuts.push([k,st.slice()])}
  for(let n=cuts.length-1,tries=0;n>=0&&tries<300;n--,tries++){const [k,s2]=cuts[n];const close=s2.slice().reverse().map(c=>c==='{'?'}':']').join('');r=tryP(nc(t.slice(0,k)+close));if(r!==undefined)return r}
  return null;
}

/* ---------- Распознавание медицинских документов (выписки, заключения, анализы) ---------- */
const DOC_ONE='{"docType":"выписка|заключение|анализы|рецепт|другое","date":"ГГГГ-ММ-ДД или пусто","title":"короткое название документа","institution":"учреждение","doctor":"врач","pages":[номера страниц из присланных, начиная с 1],"hospitalization":{"from":"","to":"","department":""},"patient":{"name":"ФИО пациента как в документе","birthDate":"ГГГГ-ММ-ДД","sex":"м|ж|пусто","weightKg":число или null,"heightCm":число или null},"diagnoses":[{"text":"диагноз как в документе","icd":"код МКБ или пусто","main":true}],"labs":[{"date":"","name":"название как в документе","code":"hba1c|...|other","value":число,"unit":"","ref":"норма, если указана"}],"insulin":[{"name":"препарат","kind":"базальный|болюсный|другое","dose":"доза и схема как в документе"}],"otherMeds":["другие назначения"],"recommendations":["рекомендации врача, коротко"],"summary":"3–5 предложений простым языком: что это за документ и главное из него","unreadable":"что не удалось прочитать, если есть"}';
const DOC_PROMPT=`Перед тобой страницы медицинских документов пациента с сахарным диабетом: выписки из больницы, заключения эндокринолога, бланки анализов и т.п. (фото или PDF, страницы пронумерованы по порядку, начиная с 1). Фото могут быть повёрнуты, сняты под углом, с печатями поверх текста — читай внимательно.
Среди страниц может быть НЕСКОЛЬКО разных документов (разные даты, учреждения, бланки лабораторий). Раздели их: каждый документ — отдельный элемент массива documents. Страницы одного документа объединяй.
Аккуратно перенеси данные. Ничего не придумывай: чего нет в документе — пустая строка, null или пустой массив. Не давай медицинских советов и не меняй дозы.
Даты — ГГГГ-ММ-ДД. Числа — числом с точкой. В бланках анализов бери дату взятия/выполнения анализа, значение, единицы и референсный интервал (норму); показатели вне нормы не пропускай.
Для анализов укажи code, если подходит: hba1c (гликированный гемоглобин, %), cpep (С-пептид), vitd (витамин D 25-OH), glu (глюкоза венозная натощак), chol (холестерин общий), ldl (ЛПНП), tg (триглицериды), creat (креатинин), tsh (ТТГ); иначе "other".
Пиши кратко: summary — до 3 предложений, рекомендации — коротко. Ответь ТОЛЬКО JSON без пояснений и без markdown-обёртки: {"documents":[${DOC_ONE}]}`;
async function medicalDoc(req,env){
  let b;try{b=await req.json()}catch{return J(400,{error:'Неверный запрос.'})}
  if(env.PHOTO_ACCESS_CODE&&req.headers.get('X-Access-Code')!==env.PHOTO_ACCESS_CODE)return J(401,{error:'Неверный код доступа.'});
  if(!env.ANTHROPIC_API_KEY)return J(503,{error:'Не задан ANTHROPIC_API_KEY.'});
  const files=(Array.isArray(b.files)?b.files:[]).slice(0,12).filter(x=>x&&x.data);if(!files.length)return J(400,{error:'Нет файлов.'});
  const model=env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
  const content=files.map(x=>{const mt=String(x.mediaType||'image/jpeg'),data=String(x.data).replace(/^data:[^,]+,/,'');
    return mt==='application/pdf'?{type:'document',source:{type:'base64',media_type:'application/pdf',data}}:{type:'image',source:{type:'base64',media_type:mt,data}}});
  content.push({type:'text',text:`Всего страниц: ${files.length}.\n`+DOC_PROMPT});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:32000,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)return J(502,{error:j?.error?.message||('Ошибка API '+r.status)});
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
  const o=parseLoose(text);if(!o)return J(502,{error:'Не удалось разобрать ответ модели'+(j.stop_reason==='max_tokens'?' — документов слишком много за раз, попробуйте по 3–4 страницы.':'.')+' Попробуйте ещё раз.',stop:j.stop_reason,tail:text.slice(-300)});
  const truncated=j.stop_reason==='max_tokens';
  const S=v=>String(v??'').trim(),A=v=>Array.isArray(v)?v:[];
  const one=o=>({docType:S(o.docType)||'другое',date:S(o.date),title:S(o.title),institution:S(o.institution),doctor:S(o.doctor),pages:A(o.pages).map(Number).filter(n=>n>=1&&n<=files.length),
    hospitalization:{from:S(o.hospitalization?.from),to:S(o.hospitalization?.to),department:S(o.hospitalization?.department)},
    diagnoses:A(o.diagnoses).map(d=>({text:S(d.text),icd:S(d.icd),main:!!d.main})).filter(d=>d.text),
    labs:A(o.labs).map(l=>({date:S(l.date),name:S(l.name),code:S(l.code)||'other',value:+l.value,unit:S(l.unit),ref:S(l.ref)})).filter(l=>l.name&&Number.isFinite(l.value)),
    insulin:A(o.insulin).map(x=>({name:S(x.name),kind:S(x.kind),dose:S(x.dose)})).filter(x=>x.name),
    otherMeds:A(o.otherMeds).map(S).filter(Boolean),recommendations:A(o.recommendations).map(S).filter(Boolean),summary:S(o.summary),unreadable:S(o.unreadable)});
  const docs=(Array.isArray(o.documents)?o.documents:[o]).map(one);
  return J(200,{documents:docs,model,truncated});
}

/* ---------- Приём данных сенсора от xDrip+ (совместимо с Nightscout REST API v1) ---------- */
async function nightscout(req,env,path,ctx){
  if(!env.DB)return J(503,{error:'D1 не подключена'});await ensureSchema(env);
  const u=new URL(req.url);let key=(req.headers.get('api-secret')||u.searchParams.get('secret')||'').trim().toLowerCase();
  const tok=u.searchParams.get('token');if(!key&&tok)key=await sha1(tok);
  const k=key?await env.DB.prepare('SELECT patient_id FROM cgm_keys WHERE key_hash=?').bind(key).first():null;
  const p=path.replace(/\.json$/,'');
  if(p==='/api/v1/status')return J(200,{status:'ok',name:'my-diabet',version:'15.0.0',apiEnabled:true,careportalEnabled:false,authorized:!!k,settings:{units:'mmol'}});
  if(p==='/api/v1/verifyauth')return J(k?200:401,{message:k?{canRead:true,canWrite:true,isAdmin:true,message:'OK'}:{message:'UNAUTHORIZED'}});
  if(!k)return J(401,{status:401,message:'Неверный ключ (API secret).'});
  const pid=k.patient_id,M=req.method;
  if((p==='/api/v1/entries'||p==='/api/v1/entries/sgv')&&M==='POST'){
    let b=await body(req);if(!Array.isArray(b))b=[b];
    const rows=b.filter(e=>e&&(e.type==='sgv'||e.sgv!=null)&&+e.sgv>=20&&+e.sgv<=600&&+(e.date||Date.parse(e.dateString||''))>0).slice(0,2000);
    if(rows.length)await env.DB.batch(rows.map(e=>env.DB.prepare('INSERT OR REPLACE INTO cgm VALUES(?,?,?,?,?)').bind(pid,Math.round(+(e.date||Date.parse(e.dateString))),+e.sgv,String(e.direction||''),String(e.device||'').slice(0,60))));
    if(Math.random()<0.02)await env.DB.prepare('DELETE FROM cgm WHERE ts<?').bind(Date.now()-180*864e5).run();
    if(rows.length){const job=checkAlerts(env,pid,false).catch(()=>{});if(ctx&&ctx.waitUntil)ctx.waitUntil(job);else await job}
    return J(200,rows);
  }
  if((p==='/api/v1/entries'||p==='/api/v1/entries/sgv'||p==='/api/v1/entries/current')&&M==='GET'){
    const n=Math.min(+u.searchParams.get('count')||(p.endsWith('current')?1:10),1000);
    const r=await env.DB.prepare('SELECT ts,mgdl,direction,device FROM cgm WHERE patient_id=? ORDER BY ts DESC LIMIT ?').bind(pid,n).all();
    return J(200,r.results.map(x=>({_id:pid+'-'+x.ts,type:'sgv',sgv:x.mgdl,date:x.ts,dateString:new Date(x.ts).toISOString(),direction:x.direction,device:x.device})));
  }
  // лечение, статус устройства и прочее xDrip+ тоже отправляет — принимаем и не храним
  if(M==='POST'||M==='PUT')return J(200,[]);
  return J(200,[]);
}

export default{async scheduled(ev,env,ctx){if(env.DB)ctx.waitUntil(staleSweep(env))},
async fetch(req,env,ctx){
  const path=new URL(req.url).pathname;
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  try{
    if(req.method==='GET'&&(path==='/'||path==='/health'))return J(200,{ok:true,service:'my-diabet food-photo',sync:!!env.DB});
    if(path==='/v1/food-photo'&&req.method==='POST')return await foodPhoto(req,env);
    if(path==='/v1/medical-doc'&&req.method==='POST')return await medicalDoc(req,env);
    if(path.startsWith('/api/v1/'))return await nightscout(req,env,path,ctx);
    if(path.startsWith('/v1/')||path.startsWith('/v2/'))return await sync(req,env,path);
    return J(404,{error:'Не найдено'});
  }catch(e){return J(500,{error:'Ошибка сервера: '+(e&&e.message||e)})}
}};
