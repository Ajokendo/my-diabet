/* «Мой диабет» — authenticated cloud sync adapter for the development Sync Server. */
(function(w){
  const KEY='my-diabetes-cloud-session-v1';
  function loadSession(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
  function saveSession(v){try{v?localStorage.setItem(KEY,JSON.stringify(v)):localStorage.removeItem(KEY)}catch(e){}}
  async function request(base,path,options){const o=options||{};o.headers=Object.assign({'Content-Type':'application/json'},o.headers||{});const s=loadSession();if(s?.token)o.headers.Authorization='Bearer '+s.token;const r=await fetch(base.replace(/\/$/,'')+path,o);let j={};try{j=await r.json()}catch{}if(!r.ok){const e=new Error(j.error||('HTTP '+r.status));e.status=r.status;e.body=j;throw e}return j}
  function create(baseUrl){let base=String(baseUrl||'http://localhost:8787');return {
    async register(displayName,email,password,patientName){const j=await request(base,'/v1/auth/register',{method:'POST',body:JSON.stringify({displayName,email,password,patientName})});saveSession(j);return j},
    async login(email,password){const j=await request(base,'/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})});saveSession(j);return j},
    logout(){saveSession(null)}, session:loadSession,
    async me(){return request(base,'/v1/me')},
    async invite(patientId,displayName,role,email){return request(base,'/v1/patients/'+encodeURIComponent(patientId)+'/invitations',{method:'POST',body:JSON.stringify({displayName,role,email})})},
    async accept(token){return request(base,'/v1/invitations/'+encodeURIComponent(token)+'/accept',{method:'POST',body:'{}'})},
    async members(patientId){return request(base,'/v1/patients/'+encodeURIComponent(patientId)+'/members')},
    async devices(patientId){return request(base,'/v1/patients/'+encodeURIComponent(patientId)+'/devices')},
    async push(patientId,snapshot,baseRevision,meta){return request(base,'/v1/sync/push',{method:'POST',body:JSON.stringify({patientId,snapshot,baseRevision,installationId:meta?.installationId,platform:meta?.platform,deviceLabel:meta?.deviceLabel})})},
    async pull(patientId){return request(base,'/v1/sync/pull',{method:'POST',body:JSON.stringify({patientId})})},
    async pushChanges(patientId,events){return request(base,'/v2/sync/push',{method:'POST',body:JSON.stringify({patientId,events})})},
    async pullChanges(patientId,cursor,limit){return request(base,'/v2/sync/pull',{method:'POST',body:JSON.stringify({patientId,cursor,limit})})},
    async bootstrap(patientId,snapshot){return request(base,'/v2/sync/bootstrap',{method:'POST',body:JSON.stringify({patientId,snapshot})})},
    async health(){const r=await fetch(base+'/health');return r.json()}
  }}
  w.DMCloud={VERSION:'CLOUD-1.0',create,loadSession,clearSession:()=>saveSession(null)};
})(window);
