/* My Diabetes — Family / multi-device domain foundation.
 * No cloud provider is embedded here. The module defines the stable data contract
 * that Android/iOS/desktop sync providers will implement later.
 */
(function(w){
  const VERSION='FAM-1.0';
  const ROLES={patient:'Пациент',guardian:'Родитель / опекун',trusted:'Доверенный член семьи',viewer:'Наблюдатель',doctor:'Врач'};
  const PERMISSIONS={
    patient:['patient.read','patient.write','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','medical.write','medical.parameters.write','reports.read','reports.write','family.manage','devices.manage'],
    guardian:['patient.read','patient.write','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','medical.write','medical.parameters.write','reports.read','reports.write','family.manage','devices.manage'],
    trusted:['patient.read','nutrition.write','glucose.write','activity.write','insulin.write','medical.read','reports.read'],
    viewer:['patient.read','nutrition.read','glucose.read','activity.read','insulin.read','medical.read','reports.read'],
    doctor:['patient.read','nutrition.read','glucose.read','activity.read','insulin.read','medical.read','reports.read']
  };
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function now(){return new Date().toISOString();}
  function id(prefix){return (prefix||'id')+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
  function makeFoundation(existing){
    const d=existing||{};
    d.identity=d.identity&&typeof d.identity==='object'?d.identity:{};
    d.identity.account=d.identity.account||{id:id('acct'),createdAt:now()};
    d.identity.currentUser=d.identity.currentUser||{id:id('user'),displayName:'Локальный пользователь',email:'',createdAt:now()};
    d.identity.activePatientId=d.identity.activePatientId||'patient-local-1';
    d.identity.installation=d.identity.installation||{id:id('inst'),platform:'web',createdAt:now(),lastSeenAt:now(),status:'active',label:'Это устройство'};
    d.patients=Array.isArray(d.patients)?d.patients:[];
    if(!d.patients.some(p=>p.id===d.identity.activePatientId)) d.patients.unshift({id:d.identity.activePatientId,displayName:d.profile?.name||'Пациент',createdAt:now(),status:'active'});
    d.family=d.family&&typeof d.family==='object'?d.family:{};
    d.family.members=Array.isArray(d.family.members)?d.family.members:[];
    d.family.invitations=Array.isArray(d.family.invitations)?d.family.invitations:[];
    d.family.roles=ROLES;
    d.family.permissions=PERMISSIONS;
    if(!d.family.members.some(m=>m.userId===d.identity.currentUser.id && m.patientId===d.identity.activePatientId)){
      d.family.members.unshift({id:id('member'),userId:d.identity.currentUser.id,patientId:d.identity.activePatientId,displayName:d.identity.currentUser.displayName,role:'patient',status:'active',permissions:PERMISSIONS.patient.slice(),createdAt:now()});
    }
    d.devices=Array.isArray(d.devices)?d.devices:[];
    if(!d.devices.some(x=>x.id===d.identity.installation.id)) d.devices.unshift({...clone(d.identity.installation),accountId:d.identity.account.id,userId:d.identity.currentUser.id});
    d.sync=d.sync&&typeof d.sync==='object'?d.sync:{};
    d.sync.provider=d.sync.provider||'local-placeholder';
    d.sync.status=d.sync.status||'local-only';
    d.sync.lastSyncAt=d.sync.lastSyncAt||null;
    d.sync.queue=Array.isArray(d.sync.queue)?d.sync.queue:[];
    d.sync.changeLog=Array.isArray(d.sync.changeLog)?d.sync.changeLog:[];
    d.sync.schemaVersion=1;
    return d;
  }
  function permissionsForRole(role){return (PERMISSIONS[role]||[]).slice();}
  function hasPermission(db,permission,patientId){
    const pid=patientId||db.identity?.activePatientId;
    const uid=db.identity?.currentUser?.id;
    const m=(db.family?.members||[]).find(x=>x.userId===uid&&x.patientId===pid&&x.status==='active');
    return !!(m&&m.permissions?.includes(permission));
  }
  function invite(db,{displayName,role,expiresDays=7,note=''}){
    const token=id('invite').replace(/-/g,'').toUpperCase();
    const inv={id:id('inv'),patientId:db.identity.activePatientId,createdBy:db.identity.currentUser.id,displayName:displayName||'Член семьи',role:role||'trusted',token,createdAt:now(),expiresAt:new Date(Date.now()+expiresDays*86400000).toISOString(),status:'pending',note};
    db.family.invitations.unshift(inv); return inv;
  }
  function revokeInvitation(db,invId){const x=db.family.invitations.find(i=>i.id===invId);if(x)x.status='revoked';}
  function acceptInvitation(db,invId,acceptingUser){
    const inv=db.family.invitations.find(i=>i.id===invId&&i.status==='pending');
    if(!inv)return {ok:false,error:'Приглашение не найдено или уже недействительно.'};
    if(new Date(inv.expiresAt)<new Date()){inv.status='expired';return {ok:false,error:'Срок действия приглашения истёк.'};}
    const u=acceptingUser||{id:id('user'),displayName:inv.displayName,email:''};
    db.family.members.push({id:id('member'),userId:u.id,patientId:inv.patientId,displayName:u.displayName||inv.displayName,role:inv.role,status:'active',permissions:permissionsForRole(inv.role),createdAt:now()});
    inv.status='accepted'; inv.acceptedAt=now(); inv.acceptedBy=u.id;
    return {ok:true};
  }
  function recordChange(db,entityType,entityId,operation,changedBy){
    const event={id:id('chg'),patientId:db.identity.activePatientId,entityType,entityId,operation,changedBy:changedBy||db.identity.currentUser.id,installationId:db.identity.installation.id,occurredAt:now(),status:'pending-sync'};
    db.sync.queue.push(clone(event)); db.sync.changeLog.unshift(clone(event));
    if(db.sync.changeLog.length>500)db.sync.changeLog.length=500;
    if(db.sync.queue.length>500)db.sync.queue.length=500;
    return event;
  }
  function revokeDevice(db,deviceId){const x=db.devices.find(d=>d.id===deviceId);if(x){x.status='revoked';x.revokedAt=now();return true;}return false;}
  function touchDevice(db){const idd=db.identity.installation.id;const x=db.devices.find(d=>d.id===idd);if(x){x.lastSeenAt=now();x.status='active';}return x;}
  w.DMFamily={VERSION,ROLES,PERMISSIONS,makeFoundation,permissionsForRole,hasPermission,invite,revokeInvitation,acceptInvitation,recordChange,revokeDevice,touchDevice};
})(window);
