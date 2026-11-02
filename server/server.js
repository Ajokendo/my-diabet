#!/usr/bin/env node
'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const PORT=Number(process.env.PORT||8787);
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(DATA_DIR,{recursive:true});
const DB_FILE=path.join(DATA_DIR,'db.json');
let db={users:{},sessions:{},refreshTokens:{},patients:{},members:{},invitations:{},devices:{},snapshots:{},records:{},changes:{},cursors:{},audit:{}};
try{db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));}catch{}
for(const k of Object.keys({users:1,sessions:1,refreshTokens:1,patients:1,members:1,invitations:1,devices:1,snapshots:1,records:1,changes:1,cursors:1,audit:1}))db[k]??={};
function persist(){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}
function id(p){return p+'_'+crypto.randomBytes(12).toString('hex');}
function now(){return new Date().toISOString();}
function json(res,status,obj){const s=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(s),'Cache-Control':'no-store'});res.end(s);}
function readBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6){req.destroy();reject(new Error('payload too large'))}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(new Error('invalid json'))}});req.on('error',reject)})}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){const hash=crypto.scryptSync(String(password),salt,64).toString('hex');return {salt,hash};}
function verifyPassword(password,u){return crypto.timingSafeEqual(Buffer.from(hashPassword(password,u.salt).hash,'hex'),Buffer.from(u.passwordHash,'hex'));}
function token(){return crypto.randomBytes(32).toString('base64url');}
function tokenHash(t){return crypto.createHash('sha256').update(String(t)).digest('hex');}
function audit(actorId,patientId,action,entityType,entityId,meta={}){const ev={id:id('aud'),actorId:actorId||null,patientId:patientId||null,action,entityType:entityType||null,entityId:entityId||null,meta:safeClone(meta),createdAt:now()};db.audit[ev.id]=ev;return ev;}
function issueSession(userId,installationId){const access=token(),refresh=token(),issued=Date.now();db.sessions[tokenHash(access)]={id:id('ses'),userId,installationId:installationId||null,createdAt:new Date(issued).toISOString(),expiresAt:new Date(issued+15*60*1000).toISOString()};db.refreshTokens[tokenHash(refresh)]={id:id('ref'),userId,installationId:installationId||null,createdAt:new Date(issued).toISOString(),expiresAt:new Date(issued+30*864e5).toISOString(),revokedAt:null};return {accessToken:access,refreshToken:refresh,expiresIn:900};}
function auth(req){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const raw=h.slice(7),s=db.sessions[tokenHash(raw)];if(!s||new Date(s.expiresAt)<new Date()){if(s)delete db.sessions[tokenHash(raw)];return null}const user=db.users[s.userId];if(!user)return null;if(s.installationId){const d=db.devices[s.installationId];if(!d||d.status==='revoked')return null}return {...s,user};}
function membership(userId,patientId){return Object.values(db.members).find(m=>m.userId===userId&&m.patientId===patientId&&m.status==='active');}
function can(userId,patientId,perm){const m=membership(userId,patientId);return !!(m&&m.permissions.includes(perm));}
const ROLE_PERMS={patient:['patient.read','patient.write','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','medical.write','medical.parameters.write','reports.read','reports.write','family.manage','devices.manage'],guardian:['patient.read','patient.write','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','medical.write','medical.parameters.write','reports.read','reports.write','family.manage','devices.manage'],trusted:['patient.read','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','reports.read'],viewer:['patient.read','nutrition.read','glucose.read','activity.read','insulin.read','medical.read','reports.read'],doctor:['patient.read','nutrition.read','glucose.read','activity.read','insulin.read','medical.read','reports.read']};
function route(req){return new URL(req.url,'http://localhost').pathname;}
function recordKey(pid,type,rid){return pid+'|'+type+'|'+rid;}
function safeClone(v){return v===undefined?null:JSON.parse(JSON.stringify(v));}
function canWriteRecord(userId,pid,type){
  if(can(userId,pid,'patient.write')) return true;
  if(['medical.calculation','medical.actualInsulin','glucose.cgm','glucose.reading'].includes(type)) return can(userId,pid,'medical.write')||can(userId,pid,'glucose.write');
  return false;
}
function isImmutableType(type){return ['medical.calculation','medical.actualInsulin','glucose.cgm','glucose.reading'].includes(type);}
function appendChange(pid,rec,operation,actorId,installationId){
  const seq=Number(db.cursors[pid]||0)+1; db.cursors[pid]=seq;
  const ch={sequence:seq,id:id('chg'),patientId:pid,recordType:rec.recordType,recordId:rec.recordId,operation,version:rec.version||1,payload:rec.deleted?null:safeClone(rec.payload),deleted:!!rec.deleted,changedAt:now(),changedBy:actorId,installationId:installationId||null};
  db.changes[ch.id]=ch; return ch;
}
function applyRecordChange(actor,pid,e){
  if(!e||!e.recordType||!e.recordId) return {status:400,error:'recordType and recordId are required'};
  if(!canWriteRecord(actor.user.id,pid,e.recordType)) return {status:403,error:'Нет права записи этой записи.'};
  const k=recordKey(pid,String(e.recordType),String(e.recordId));
  const existing=db.records[k];
  const op=e.operation||'upsert';
  const immutable=e.immutable===true||isImmutableType(e.recordType);
  if(existing && e.clientEventId && existing.lastClientEventId===e.clientEventId) return {status:200,duplicate:true,record:existing};
  if(op==='create' && existing){
    if(immutable && JSON.stringify(existing.payload)===JSON.stringify(e.payload)) return {status:200,duplicate:true,record:existing};
    return {status:409,error:'record_exists',serverRecord:existing};
  }
  if(existing && e.baseVersion!=null && Number(e.baseVersion)!==Number(existing.version)) return {status:409,error:'record_conflict',serverRecord:existing};
  if(immutable && existing && JSON.stringify(existing.payload)!==JSON.stringify(e.payload)) return {status:409,error:'immutable_record_conflict',serverRecord:existing};
  const next={patientId:pid,recordType:String(e.recordType),recordId:String(e.recordId),version:existing?existing.version+1:1,payload:safeClone(e.payload),deleted:op==='delete',immutable,updatedAt:now(),updatedBy:actor.user.id,lastClientEventId:e.clientEventId||null};
  db.records[k]=next; const ch=appendChange(pid,next,next.deleted?'delete':'upsert',actor.user.id,e.installationId); audit(actor.user.id,pid,next.deleted?'record.deleted':'record.upserted',next.recordType,next.recordId,{version:next.version,immutable}); return {status:200,record:next,change:ch};
}
function changesAfter(pid,cursor,limit){const n=Number(cursor||0);return Object.values(db.changes).filter(c=>c.patientId===pid&&c.sequence>n).sort((a,b)=>a.sequence-b.sequence).slice(0,Math.min(Number(limit||500),1000));}

async function handler(req,res){
  const method=req.method||'GET', p=route(req);
  if(method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});return res.end()}
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
  try{
    if(method==='GET'&&p==='/health')return json(res,200,{ok:true,service:'my-diabetes-sync',time:now(),version:'SYNC-SERVER-3.0-SECURE-AUTH'});
    if(method==='POST'&&p==='/v1/auth/register'){
      const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
      if(!email||!email.includes('@')||password.length<8)return json(res,400,{error:'Введите корректный email и пароль не короче 8 символов.'});
      if(Object.values(db.users).some(u=>u.email===email))return json(res,409,{error:'Аккаунт с таким email уже существует.'});
      const hp=hashPassword(password),u={id:id('usr'),email,displayName:String(b.displayName||email.split('@')[0]).trim(),passwordHash:hp.hash,salt:hp.salt,createdAt:now()};db.users[u.id]=u;
      const patient={id:id('pat'),displayName:String(b.patientName||u.displayName).trim()||'Пациент',createdAt:now(),status:'active'};db.patients[patient.id]=patient;
      const m={id:id('mem'),userId:u.id,patientId:patient.id,displayName:u.displayName,role:'patient',permissions:ROLE_PERMS.patient.slice(),status:'active',createdAt:now()};db.members[m.id]=m;
      const issued=issueSession(u.id,null);db.snapshots[patient.id]={revision:0,snapshot:null,updatedAt:null,updatedBy:u.id};audit(u.id,patient.id,'account.created','account',u.id,{patientId:patient.id});persist();
      return json(res,201,{...issued,user:{id:u.id,email:u.email,displayName:u.displayName},patients:[patient],activePatientId:patient.id});
    }
    if(method==='POST'&&p==='/v1/auth/login'){
      const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),u=Object.values(db.users).find(x=>x.email===email);
      if(!u||!verifyPassword(password,u))return json(res,401,{error:'Неверный email или пароль.'});
      const issued=issueSession(u.id,null);audit(u.id,null,'auth.login','session',null,{});persist();
      const patients=Object.values(db.members).filter(m=>m.userId===u.id&&m.status==='active').map(m=>db.patients[m.patientId]);
      return json(res,200,{...issued,user:{id:u.id,email:u.email,displayName:u.displayName},patients,activePatientId:patients[0]?.id||null});
    }
    if(method==='POST'&&p==='/v1/auth/refresh'){
      const b=await readBody(req),rt=String(b.refreshToken||''),rh=tokenHash(rt),r=db.refreshTokens[rh];
      if(!r||r.revokedAt||new Date(r.expiresAt)<new Date())return json(res,401,{error:'Refresh token недействителен или истёк.'});
      r.revokedAt=now();const issued=issueSession(r.userId,r.installationId);audit(r.userId,null,'auth.refresh','session',r.id,{});persist();return json(res,200,issued);
    }
    const a=auth(req);if(!a)return json(res,401,{error:'Требуется авторизация.'});
    if(method==='POST'&&p==='/v1/auth/logout'){
      const h=req.headers.authorization||'';if(h.startsWith('Bearer '))delete db.sessions[tokenHash(h.slice(7))];
      audit(a.user.id,null,'auth.logout','session',a.id,{});persist();return json(res,200,{ok:true});
    }

    if(method==='GET'&&p==='/v1/me')return json(res,200,{user:{id:a.user.id,email:a.user.email,displayName:a.user.displayName},patients:Object.values(db.members).filter(m=>m.userId===a.user.id&&m.status==='active').map(m=>({patient:db.patients[m.patientId],membership:m}))});
    if(method==='POST'&&p==='/v1/installations'){const b=await readBody(req),pid=String(b.patientId||''),iid=String(b.installationId||id('inst'));if(pid&&!can(a.user.id,pid,'patient.read'))return json(res,403,{error:'Нет доступа к пациенту.'});if(db.devices[iid]?.status==='revoked')return json(res,403,{error:'Устройство отозвано.'});const d={id:iid,patientId:pid||null,userId:a.user.id,platform:String(b.platform||'unknown'),label:String(b.label||'Устройство'),status:'active',lastSeenAt:now(),createdAt:db.devices[iid]?.createdAt||now()};db.devices[iid]=d;const issued=issueSession(a.user.id,iid);audit(a.user.id,pid,'device.registered','installation',iid,{platform:d.platform});persist();return json(res,201,{installation:d,...issued});}
    const pm=p.match(/^\/v1\/patients\/([^/]+)\/(members|devices|invitations|snapshot)$/);
    if(pm){const pid=pm[1],kind=pm[2];if(!can(a.user.id,pid,'patient.read'))return json(res,403,{error:'Нет доступа к пациенту.'});
      if(method==='GET'&&kind==='members')return json(res,200,{members:Object.values(db.members).filter(m=>m.patientId===pid)});
      if(method==='GET'&&kind==='devices')return json(res,200,{devices:Object.values(db.devices).filter(d=>d.patientId===pid&&d.status!=='revoked')});
      if(method==='GET'&&kind==='snapshot'){const s=db.snapshots[pid]||{revision:0,snapshot:null};return json(res,200,s);}
      if(method==='POST'&&kind==='invitations'){
        if(!can(a.user.id,pid,'family.manage'))return json(res,403,{error:'Недостаточно прав для приглашения.'});
        const b=await readBody(req),role=ROLE_PERMS[b.role]?b.role:'trusted',tok=token(),inv={id:id('inv'),patientId:pid,createdBy:a.user.id,displayName:String(b.displayName||'Член семьи'),email:String(b.email||'').trim().toLowerCase(),role,tokenHash:tokenHash(tok),createdAt:now(),expiresAt:new Date(Date.now()+7*864e5).toISOString(),status:'pending'};db.invitations[inv.id]=inv;audit(a.user.id,pid,'family.invite_created','invitation',inv.id,{role});persist();return json(res,201,{invitation:{id:inv.id,patientId:pid,displayName:inv.displayName,email:inv.email,role,expiresAt:inv.expiresAt,acceptToken:tok}});
      }
    }
    const devMatch=p.match(/^\/v1\/patients\/([^/]+)\/devices\/([^/]+)$/);if(devMatch&&method==='DELETE'){const pid=devMatch[1],did=devMatch[2];if(!can(a.user.id,pid,'devices.manage'))return json(res,403,{error:'Недостаточно прав.'});const d=db.devices[did];if(d){d.status='revoked';d.revokedAt=now();for(const k of Object.keys(db.sessions)){if(db.sessions[k].installationId===did)delete db.sessions[k];}for(const k of Object.keys(db.refreshTokens)){if(db.refreshTokens[k].installationId===did)db.refreshTokens[k].revokedAt=now();}audit(a.user.id,pid,'device.revoked','installation',did,{});persist();}return json(res,200,{ok:true});}
    const invMatch=p.match(/^\/v1\/invitations\/([^/]+)\/accept$/);if(invMatch&&method==='POST'){
      const inv=Object.values(db.invitations).find(i=>i.tokenHash===tokenHash(invMatch[1])&&i.status==='pending');if(!inv||new Date(inv.expiresAt)<new Date())return json(res,400,{error:'Приглашение недействительно или истекло.'});
      const existing=membership(a.user.id,inv.patientId);if(existing){inv.status='accepted';inv.acceptedBy=a.user.id;inv.acceptedAt=now();persist();return json(res,200,{ok:true,membership:existing});}
      const m={id:id('mem'),userId:a.user.id,patientId:inv.patientId,displayName:a.user.displayName,role:inv.role,permissions:ROLE_PERMS[inv.role].slice(),status:'active',createdAt:now()};db.members[m.id]=m;inv.status='accepted';inv.acceptedBy=a.user.id;inv.acceptedAt=now();audit(a.user.id,inv.patientId,'family.invite_accepted','membership',m.id,{role:m.role});persist();return json(res,200,{ok:true,membership:m});
    }

    if(method==='POST'&&p==='/v2/sync/push'){
      const b=await readBody(req),pid=String(b.patientId||''),events=Array.isArray(b.events)?b.events:[];
      if(!can(a.user.id,pid,'patient.write'))return json(res,403,{error:'Нет права записи в пациента.'});
      if(events.length>500)return json(res,413,{error:'Слишком много событий за один запрос.'});
      const accepted=[],conflicts=[];
      for(const e of events){const r=applyRecordChange(a,pid,e);if(r.status===200)accepted.push({clientEventId:e.clientEventId||null,record:r.record,change:r.change||null,duplicate:!!r.duplicate});else conflicts.push({clientEventId:e.clientEventId||null,...r});}
      persist();
      return json(res,200,{ok:conflicts.length===0,accepted,conflicts,cursor:Number(db.cursors[pid]||0)});
    }
    if(method==='POST'&&p==='/v2/sync/pull'){
      const b=await readBody(req),pid=String(b.patientId||'');if(!can(a.user.id,pid,'patient.read'))return json(res,403,{error:'Нет доступа.'});
      const cursor=Number(b.cursor||0),limit=Math.min(Number(b.limit||500),1000),changes=changesAfter(pid,cursor,limit),nextCursor=changes.length?changes[changes.length-1].sequence:cursor;
      return json(res,200,{ok:true,cursor:nextCursor,hasMore:changes.length===limit,changes});
    }
    if(method==='POST'&&p==='/v2/sync/bootstrap'){
      const b=await readBody(req),pid=String(b.patientId||''),snapshot=b.snapshot;
      if(!can(a.user.id,pid,'patient.write'))return json(res,403,{error:'Нет права записи в пациента.'});
      if(!snapshot||typeof snapshot!=='object')return json(res,400,{error:'snapshot is required'});
      // Bootstrap is one-time and intentionally explicit. Arrays with stable ids become individual records.
      const arrays=['diary','activity','recipes','medical.calculationLog','medical.actualInsulinLog'];
      const created=[];
      function getPath(o,path){return path.split('.').reduce((x,k)=>x&&x[k],o)}
      for(const type of arrays){const arr=getPath(snapshot,type)||[];for(const item of arr){if(!item||!item.id)continue;const parts=type.split('.');const rt=parts.length>1?parts.join('.'):type;const e={recordType:rt,recordId:String(item.id),operation:'create',payload:item,immutable:isImmutableType(rt),clientEventId:'bootstrap-'+rt+'-'+item.id};const r=applyRecordChange(a,pid,e);if(r.status===200)created.push(r.record)}}
      persist(); return json(res,200,{ok:true,created:created.length,cursor:Number(db.cursors[pid]||0)});
    }
    if(method==='POST'&&p==='/v1/sync/push'){
      const b=await readBody(req),pid=String(b.patientId||'');if(!can(a.user.id,pid,'patient.write'))return json(res,403,{error:'Нет права записи в пациента.'});
      const cur=db.snapshots[pid]||{revision:0,snapshot:null};const base=Number(b.baseRevision??-1);
      if(base!==cur.revision)return json(res,409,{error:'conflict',serverRevision:cur.revision,serverSnapshot:cur.snapshot});
      const snap=b.snapshot;if(!snap||typeof snap!=='object')return json(res,400,{error:'snapshot is required'});
      cur.revision++;cur.snapshot=snap;cur.updatedAt=now();cur.updatedBy=a.user.id;db.snapshots[pid]=cur;
      const iid=String(b.installationId||'');if(iid){db.devices[iid]={id:iid,patientId:pid,userId:a.user.id,platform:b.platform||'unknown',label:b.deviceLabel||'Устройство',lastSeenAt:now(),status:'active'};}
      persist();return json(res,200,{ok:true,revision:cur.revision,updatedAt:cur.updatedAt});
    }
    if(method==='POST'&&p==='/v1/sync/pull'){
      const b=await readBody(req),pid=String(b.patientId||'');if(!can(a.user.id,pid,'patient.read'))return json(res,403,{error:'Нет доступа.'});const s=db.snapshots[pid]||{revision:0,snapshot:null};return json(res,200,{ok:true,revision:s.revision,snapshot:s.snapshot,updatedAt:s.updatedAt});
    }
    return json(res,404,{error:'Not found'});
  }catch(e){console.error(e);return json(res,500,{error:'Server error',detail:process.env.NODE_ENV==='development'?e.message:undefined});}
}
http.createServer(handler).listen(PORT,()=>console.log(`My Diabetes sync server listening on http://localhost:${PORT}`));
