(function(w){
 function download(text,name){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)}
 async function derive(p,s){var enc=new TextEncoder(),k=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(p)),{name:'AES-GCM'},false,['encrypt','decrypt']);return k}
 async function encryptEnvelope(env,p){var iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(p,iv),data=new TextEncoder().encode(JSON.stringify(env)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,data);return {format:'my-diabetes-encrypted-backup',version:1,iv:Array.from(iv),data:Array.from(new Uint8Array(ct))}}
 async function decryptEnvelope(raw,p){var iv=new Uint8Array(raw.iv),key=await derive(p,iv),ct=new Uint8Array(raw.data),pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv},key,ct);return JSON.parse(new TextDecoder().decode(pt))}
 w.DMBackup={download:download,hasCrypto:function(){return !!(w.crypto&&crypto.subtle)},encryptEnvelope:encryptEnvelope,decryptEnvelope:decryptEnvelope}
})(window);
