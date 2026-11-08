// Cloudflare Worker «Мой диабет»: распознавание еды по фото + семейная синхронизация.
//
// Настройки воркера (Settings):
//   Секреты:   ANTHROPIC_API_KEY (для фото), PHOTO_ACCESS_CODE (код для фото, желательно).
//   Переменная (необязательно): ANTHROPIC_MODEL (по умолчанию claude-sonnet-5-5).
//   Binding:   D1 database, имя переменной DB (для синхронизации). Таблицы создаются сами.
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
  if(env.PHOTO_ACCESS_CODE&&req.headers.get('X-Access-Code')!==env.PHOTO_ACCESS_CODE)return J(401,{error:'Неверный код доступа.'});
  if(!env.ANTHROPIC_API_KEY)return J(503,{error:'Не задан ANTHROPIC_API_KEY.'});
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(x=>x&&x.data);if(!imgs.length)return J(400,{error:'Нет фото.'});
  const model=env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
  const content=imgs.map(x=>({type:'image',source:{type:'base64',media_type:x.mediaType||'image/jpeg',data:String(x.data).replace(/^data:[^,]+,/,'')}}));content.push({type:'text',text:buildPrompt(b)});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:1500,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)return J(502,{error:j?.error?.message||('Ошибка API '+r.status)});
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');const m=text.match(/\{[\s\S]*\}/);if(!m)return J(502,{error:'Ответ модели не в формате JSON.'});
  let out;try{out=JSON.parse(m[0])}catch{return J(502,{error:'Ответ модели не разобран.'})}
  out.items=(Array.isArray(out.items)?out.items:[]).map(x=>({name:String(x.name||''),catalogName:x.catalogName?String(x.catalogName):null,grams:Math.max(0,Math.round(+x.grams||0)),confidence:['low','medium','high'].includes(x.confidence)?x.confidence:'low',note:String(x.note||'')}));
  out.warnings=Array.isArray(out.warnings)?out.warnings.map(String):[];out.model=model;return J(200,out);
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
 "CREATE TABLE IF NOT EXISTS cgm_keys(key_hash TEXT PRIMARY KEY,patient_id TEXT NOT NULL,created_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS cgm(patient_id TEXT NOT NULL,ts INTEGER NOT NULL,mgdl REAL NOT NULL,direction TEXT,device TEXT,PRIMARY KEY(patient_id,ts))"
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
  const user=await authUser(req,env);if(!user)return J(401,{error:'Нужно войти заново.'});
  if(M==='POST'&&path==='/v1/auth/logout'){const h=req.headers.get('Authorization').slice(7);await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(h)).run();return J(200,{ok:true})}
  if(M==='GET'&&path==='/v1/me')return J(200,{user,patients:await patientsOf(env,user.id)});
  const pm=path.match(/^\/v1\/patients\/([^/]+)\/(members|invitations)$/);
  if(pm){const pid=decodeURIComponent(pm[1]),role=await roleIn(env,user.id,pid);if(!role)return J(403,{error:'Нет доступа.'});
    if(M==='GET'&&pm[2]==='members'){const r=await env.DB.prepare("SELECT m.id,m.role,m.display_name,m.created_at,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.patient_id=? AND m.status='active' ORDER BY m.created_at").bind(pid).all();return J(200,{members:r.results.map(x=>({id:x.id,role:x.role,roleLabel:ROLE_RU[x.role]||x.role,displayName:x.display_name,email:x.email,since:x.created_at}))})}
    if(M==='POST'&&pm[2]==='invitations'){if(!ROLES[role].invite)return J(403,{error:'Недостаточно прав для приглашения.'});const b=await body(req),r=ROLES[b.role]?b.role:'guardian',code=newCode(),exp=new Date(Date.now()+7*864e5).toISOString();await env.DB.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?,NULL)').bind(code,pid,r,String(b.displayName||'').slice(0,60),user.id,now(),exp,'pending').run();return J(201,{invitation:{code,role:r,roleLabel:ROLE_RU[r],expiresAt:exp}})}
  }
  const im=path.match(/^\/v1\/invitations\/([^/]+)\/accept$/);
  if(im&&M==='POST'){const code=decodeURIComponent(im[1]).trim().toUpperCase(),inv=await env.DB.prepare('SELECT * FROM invitations WHERE code=?').bind(code).first();
    if(!inv||inv.status!=='pending'||inv.expires_at<now())return J(400,{error:'Код приглашения неверный или устарел.'});
    const ex=await roleIn(env,user.id,inv.patient_id);
    const ops=[env.DB.prepare("UPDATE invitations SET status='accepted',accepted_by=? WHERE code=?").bind(user.id,code)];
    if(!ex)ops.push(env.DB.prepare('INSERT INTO members VALUES(?,?,?,?,?,?,?)').bind(uid('mem'),user.id,inv.patient_id,inv.role,inv.display_name||user.displayName,'active',now()));
    await env.DB.batch(ops);const p=await env.DB.prepare('SELECT id,display_name FROM patients WHERE id=?').bind(inv.patient_id).first();
    return J(200,{ok:true,patient:{id:p.id,displayName:p.display_name,role:ex||inv.role}});
  }
  const cm=path.match(/^\/v1\/patients\/([^/]+)\/(cgm|cgm-key)$/);
  if(cm){const role=await roleIn(env,user.id,cm[1]);if(!role)return J(403,{error:'Нет доступа к этому дневнику.'});
    if(cm[2]==='cgm-key'&&M==='POST'){if(!ROLES[role].write)return J(403,{error:'Нужны права на запись.'});
      const secret=[...rnd(16)].map(x=>'abcdefghijkmnpqrstuvwxyz23456789'[x%32]).join('');
      await env.DB.batch([env.DB.prepare('DELETE FROM cgm_keys WHERE patient_id=?').bind(cm[1]),env.DB.prepare('INSERT INTO cgm_keys VALUES(?,?,?)').bind(await sha1(secret),cm[1],now())]);
      const host=new URL(req.url).host;return J(200,{secret,url:`https://${secret}@${host}/api/v1/`})}
    if(cm[2]==='cgm'&&M==='GET'){const q=new URL(req.url).searchParams;const since=Math.max(+q.get('since')||0,Date.now()-14*864e5);
      const r=await env.DB.prepare('SELECT ts,mgdl,direction FROM cgm WHERE patient_id=? AND ts>? ORDER BY ts LIMIT 5000').bind(cm[1],since).all();
      const k=await env.DB.prepare('SELECT created_at FROM cgm_keys WHERE patient_id=?').bind(cm[1]).first();
      return J(200,{connected:!!k,readings:r.results.map(x=>({t:x.ts,g:Math.round(x.mgdl/18.016*10)/10,d:x.direction||''}))})}
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


/* ---------- Распознавание медицинских документов (выписки, заключения, анализы) ---------- */
const DOC_PROMPT=`Перед тобой медицинский документ пациента с сахарным диабетом (выписка из больницы, заключение эндокринолога, результаты анализов и т.п.), фото или PDF, возможно несколько страниц. Аккуратно перенеси данные из документа. Ничего не придумывай: если чего-то нет в документе — оставь пустую строку, null или пустой массив. Не давай медицинских советов и не меняй дозы.
Даты пиши в формате ГГГГ-ММ-ДД. Числа — числом (точка как десятичный разделитель).
Для анализов укажи code из списка, если подходит: hba1c (гликированный гемоглобин, %), cpep (С-пептид), vitd (витамин D 25-OH), glu (глюкоза венозная натощак), chol (холестерин общий), ldl (ЛПНП), tg (триглицериды), creat (креатинин), tsh (ТТГ); иначе code: "other".
Ответь ТОЛЬКО JSON без пояснений:
{"docType":"выписка|заключение|анализы|рецепт|другое","date":"ГГГГ-ММ-ДД или пусто","title":"короткое название документа","institution":"учреждение","doctor":"врач","hospitalization":{"from":"","to":"","department":""},"diagnoses":[{"text":"диагноз как в документе","icd":"код МКБ или пусто","main":true}],"labs":[{"date":"","name":"название как в документе","code":"hba1c|...|other","value":число,"unit":"","ref":"норма, если указана"}],"insulin":[{"name":"препарат","kind":"базальный|болюсный|другое","dose":"доза и схема как в документе"}],"otherMeds":["другие назначения"],"recommendations":["рекомендации врача, коротко"],"summary":"3–5 предложений простым языком: что это за документ и главное из него","unreadable":"что не удалось прочитать, если есть"}`;
async function medicalDoc(req,env){
  let b;try{b=await req.json()}catch{return J(400,{error:'Неверный запрос.'})}
  if(env.PHOTO_ACCESS_CODE&&req.headers.get('X-Access-Code')!==env.PHOTO_ACCESS_CODE)return J(401,{error:'Неверный код доступа.'});
  if(!env.ANTHROPIC_API_KEY)return J(503,{error:'Не задан ANTHROPIC_API_KEY.'});
  const files=(Array.isArray(b.files)?b.files:[]).slice(0,8).filter(x=>x&&x.data);if(!files.length)return J(400,{error:'Нет файлов.'});
  const model=env.ANTHROPIC_MODEL||'claude-sonnet-5-5';
  const content=files.map(x=>{const mt=String(x.mediaType||'image/jpeg'),data=String(x.data).replace(/^data:[^,]+,/,'');
    return mt==='application/pdf'?{type:'document',source:{type:'base64',media_type:'application/pdf',data}}:{type:'image',source:{type:'base64',media_type:mt,data}}});
  content.push({type:'text',text:DOC_PROMPT});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:4000,messages:[{role:'user',content}]})});
  const j=await r.json().catch(()=>({}));if(!r.ok)return J(502,{error:j?.error?.message||('Ошибка API '+r.status)});
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');const m=text.match(/\{[\s\S]*\}/);if(!m)return J(502,{error:'Ответ модели не в формате JSON.'});
  let o;try{o=JSON.parse(m[0])}catch{return J(502,{error:'Ответ модели не разобран.'})}
  const S=v=>String(v??'').trim(),A=v=>Array.isArray(v)?v:[];
  const out={docType:S(o.docType)||'другое',date:S(o.date),title:S(o.title),institution:S(o.institution),doctor:S(o.doctor),
    hospitalization:{from:S(o.hospitalization?.from),to:S(o.hospitalization?.to),department:S(o.hospitalization?.department)},
    diagnoses:A(o.diagnoses).map(d=>({text:S(d.text),icd:S(d.icd),main:!!d.main})).filter(d=>d.text),
    labs:A(o.labs).map(l=>({date:S(l.date),name:S(l.name),code:S(l.code)||'other',value:+l.value,unit:S(l.unit),ref:S(l.ref)})).filter(l=>l.name&&Number.isFinite(l.value)),
    insulin:A(o.insulin).map(x=>({name:S(x.name),kind:S(x.kind),dose:S(x.dose)})).filter(x=>x.name),
    otherMeds:A(o.otherMeds).map(S).filter(Boolean),recommendations:A(o.recommendations).map(S).filter(Boolean),summary:S(o.summary),unreadable:S(o.unreadable),model};
  return J(200,out);
}

/* ---------- Приём данных сенсора от xDrip+ (совместимо с Nightscout REST API v1) ---------- */
async function nightscout(req,env,path){
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

export default{async fetch(req,env){
  const path=new URL(req.url).pathname;
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  try{
    if(req.method==='GET'&&(path==='/'||path==='/health'))return J(200,{ok:true,service:'my-diabet food-photo',sync:!!env.DB});
    if(path==='/v1/food-photo'&&req.method==='POST')return await foodPhoto(req,env);
    if(path==='/v1/medical-doc'&&req.method==='POST')return await medicalDoc(req,env);
    if(path.startsWith('/api/v1/'))return await nightscout(req,env,path);
    if(path.startsWith('/v1/')||path.startsWith('/v2/'))return await sync(req,env,path);
    return J(404,{error:'Не найдено'});
  }catch(e){return J(500,{error:'Ошибка сервера: '+(e&&e.message||e)})}
}};
