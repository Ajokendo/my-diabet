(function(w){function create(o){var key=o&&o.key||'dmFull',rk=key+':rev',rev=null;
function cur(){try{return localStorage.getItem(rk)}catch(e){return null}}
var api={failed:false,
load:function(){try{var s=localStorage.getItem(key);rev=cur();return s?JSON.parse(s):null}catch(e){return null}},
save:function(v){try{localStorage.setItem(key,JSON.stringify(v));rev=Date.now().toString(36)+Math.random().toString(36).slice(2,8);localStorage.setItem(rk,rev);api.failed=false;return true}catch(e){api.failed=true;return false}},
/* true, если данные на этом устройстве изменила другая вкладка или окно приложения */
stale:function(){return cur()!==rev},
clear:function(){try{localStorage.removeItem(key)}catch(e){}}};return api}w.DMStorage={create:create}})(window);
