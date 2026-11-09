/* «Мой диабет» — медицинские документы: выписки, заключения, бланки анализов.
 * Страницы снимаются камерой или выбираются файлами (фото/PDF), отправляются на сервер распознавания,
 * модель делит их на отдельные документы и переносит данные в структуру. Человек проверяет и сохраняет.
 * Распознанные данные синхронизируются с семьёй (запись «docs»), анализы попадают в «Анализы», всё — в отчёт врачу.
 * Копии страниц (по желанию) хранятся только на этом телефоне, в IndexedDB, и не синхронизируются. */
(function(){
let pages=[],results=null,busy=false,batchId='';
const TYPES=['выписка','заключение','анализы','рецепт','другое'];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function P(){return (db.settings&&db.settings.photo)||{}}
function base(){return (P().server||'https://my-diabet.ajokendo.workers.dev').replace(/\/$/,'')}
function docs(){if(!Array.isArray(db.docs))db.docs=[];return db.docs}
function fmt(d){if(!d)return '';const [y,m,dd]=String(d).split('-');return dd&&m?`${dd}.${m}.${y}`:d}
function persist(){try{window.save()}catch(e){}}

/* ---- копии страниц на этом телефоне (IndexedDB) ---- */
function idb(){return new Promise((ok,bad)=>{const r=indexedDB.open('dm-docs',1);r.onupgradeneeded=()=>r.result.createObjectStore('pages');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)})}
async function putPages(id,arr){const d=await idb();return new Promise((ok,bad)=>{const t=d.transaction('pages','readwrite');t.objectStore('pages').put(arr,id);t.oncomplete=ok;t.onerror=()=>bad(t.error)})}
async function getPages(id){const d=await idb();return new Promise((ok)=>{const t=d.transaction('pages','readonly'),q=t.objectStore('pages').get(id);q.onsuccess=()=>ok(q.result||null);q.onerror=()=>ok(null)})}
async function delPages(id){try{const d=await idb();d.transaction('pages','readwrite').objectStore('pages').delete(id)}catch(e){}}

function shrink(file,max){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);ok(c.toDataURL('image/jpeg',0.85))};img.onerror=()=>bad(new Error('Не удалось открыть '+file.name));img.src=URL.createObjectURL(file)})}
function readPdf(file){return new Promise((ok,bad)=>{if(file.size>9e6)return bad(new Error('PDF больше 9 МБ — сфотографируйте страницы или сожмите файл.'));const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>bad(new Error('Не удалось прочитать '+file.name));r.readAsDataURL(file)})}

async function add(input){
  const fs=[...(input.files||[])];input.value='';
  for(const f of fs){if(pages.length>=12){alert('Не больше 12 страниц за раз. Распознайте эти и добавьте остальные следующим шагом.');break}
    try{pages.push(f.type==='application/pdf'?{mediaType:'application/pdf',data:await readPdf(f),name:f.name}:{mediaType:'image/jpeg',data:await shrink(f,2000),name:f.name})}catch(e){alert(e.message)}}
  drawPages();
}
function removePage(i){pages.splice(i,1);drawPages()}
function drawPages(){const el=document.getElementById('docPrev');if(!el)return;
  el.innerHTML=pages.length?`<div class="muted" style="width:100%">Страниц: <b>${pages.length}</b></div>`+pages.map((p,i)=>`<div style="position:relative">${p.mediaType==='application/pdf'?`<span class="pill" style="display:inline-block;height:80px;line-height:80px">📄 ${esc(p.name)}</span>`:`<img src="${p.data}" style="height:90px;border-radius:8px;border:1px solid #e2e8f0">`}<button onclick="DMDocs.removePage(${i})" style="position:absolute;top:-6px;right:-6px;border:0;border-radius:50%;width:24px;height:24px;background:#dc2626;color:#fff;font-weight:700">×</button><div style="text-align:center;font-size:12px" class="muted">${i+1}</div></div>`).join(''):'';
  const go=document.getElementById('docGo');if(go)go.disabled=!pages.length}

async function recognize(){
  if(!pages.length)return alert('Сначала сфотографируйте страницы или выберите файлы.');
  if(busy)return;busy=true;const out=document.getElementById('docResult');out.innerHTML=`<p class="muted">Читаю ${pages.length>1?pages.length+' страниц':'документ'}… обычно 20–90 секунд. Не закрывайте приложение.</p>`;
  try{const r=await fetch(base()+'/v1/medical-doc',{method:'POST',headers:{'Content-Type':'application/json','X-Access-Code':P().code||''},body:JSON.stringify({files:pages.map(p=>({mediaType:p.mediaType,data:p.data.split(',')[1]}))})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Ошибка '+r.status));
    results=(j.documents||(j.docType?[j]:[]));batchId='b'+Date.now();if(!results.length)throw new Error('В присланных страницах не найдено документов.');review();if(j.truncated)out.insertAdjacentHTML('afterbegin','<div class="notice">Страниц было много, и часть данных могла не поместиться в ответ. Проверьте последний документ; если чего-то не хватает — распознайте его страницы отдельно.</div>')}
  catch(e){const net=/Failed to fetch|NetworkError|Load failed/i.test(String(e.message||e));out.innerHTML=`<div class="notice">${net?'Нет связи с сервером распознавания. Проверьте интернет.':esc(e.message)}${/код доступа/i.test(e.message)?'<br>Код доступа вводится в разделе «Фото» → «Настройки сервера и код доступа».':''}</div>`}
  finally{busy=false}
}
function reviewOne(o,k){const id=s=>`d${k}_${s}`;
  return `<div class="card" style="border:2px solid #14b8a6;margin-top:10px">
<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Документ ${results.length>1?(k+1)+' из '+results.length:''}</h3><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="${id('use')}" checked> сохранить</label></div>
${o.pages&&o.pages.length?`<div class="muted" style="font-size:13px">Страницы: ${o.pages.join(', ')}</div>`:''}
<div class="two"><div><label>Тип</label><select id="${id('type')}" class="select">${TYPES.map(t=>`<option ${t===o.docType?'selected':''}>${t}</option>`).join('')}</select></div><div><label>Дата документа</label><input id="${id('date')}" type="date" class="input" value="${esc(o.date)}"></div></div>
<label>Название</label><input id="${id('title')}" class="input" value="${esc(o.title||o.docType)}">
<div class="two"><div><label>Учреждение</label><input id="${id('inst')}" class="input" value="${esc(o.institution)}"></div><div><label>Врач</label><input id="${id('doc')}" class="input" value="${esc(o.doctor)}"></div></div>
${o.hospitalization&&(o.hospitalization.from||o.hospitalization.to)?`<p>🏥 <b>Госпитализация:</b> ${fmt(o.hospitalization.from)} — ${fmt(o.hospitalization.to)} ${esc(o.hospitalization.department)}</p>`:''}
${o.diagnoses.length?`<h4>Диагнозы</h4><ul>${o.diagnoses.map(d=>`<li>${d.main?'<b>':''}${esc(d.text)}${d.main?'</b>':''}${d.icd?` <span class="muted">(${esc(d.icd)})</span>`:''}</li>`).join('')}</ul>`:''}
${o.labs.length?`<h4>Анализы — добавить в «Анализы» (${o.labs.length})</h4><div style="overflow:auto"><table class="table"><tr><th></th><th>Показатель</th><th>Значение</th><th>Дата</th></tr>${o.labs.map((l,i)=>`<tr><td><input type="checkbox" id="${id('l'+i)}" checked></td><td>${esc(l.name)}<br><select id="${id('lc'+i)}" class="select" style="padding:4px;font-size:13px">${LAB_TYPES.map(t=>`<option value="${t[0]}" ${t[0]===(LAB_TYPES.some(x=>x[0]===l.code)?l.code:'other')?'selected':''}>${t[1]}</option>`).join('')}</select></td><td><input id="${id('lv'+i)}" class="input" style="width:80px" value="${l.value}"> ${esc(l.unit)}${l.ref?`<div class="muted" style="font-size:12px">норма: ${esc(l.ref)}</div>`:''}</td><td><input id="${id('ld'+i)}" type="date" class="input" value="${esc(l.date||o.date)}"></td></tr>`).join('')}</table></div>`:''}
${o.insulin.length?`<h4>Инсулинотерапия по документу</h4><ul>${o.insulin.map(x=>`<li><b>${esc(x.name)}</b> ${x.kind?`(${esc(x.kind)})`:''} — ${esc(x.dose)}</li>`).join('')}</ul><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${id('ins')}"> Записать схему в «Медицинские данные» → «Инсулинотерапия»</label><p class="muted" style="font-size:13px">Коэффициенты для расчёта дозы не меняются — их вы настраиваете сами по назначению врача.</p>`:''}
${o.otherMeds.length?`<h4>Другие назначения</h4><ul>${o.otherMeds.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
${o.recommendations.length?`<h4>Рекомендации</h4><ul>${o.recommendations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
<label>Кратко</label><textarea id="${id('sum')}" class="input" rows="4">${esc(o.summary)}</textarea>
${o.unreadable?`<div class="notice" style="margin-top:8px">Не удалось прочитать: ${esc(o.unreadable)}</div>`:''}</div>`}
function review(){
  const out=document.getElementById('docResult');
  out.innerHTML=`<h3 style="margin-top:12px">Проверьте, что распознано${results.length>1?` — найдено документов: ${results.length}`:''}</h3><p class="muted">Исправьте ошибки и снимите галочки с того, что не нужно сохранять.</p>`+results.map(reviewOne).join('')+
`<label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" id="docKeep" checked> Сохранить копии страниц на этом телефоне (чтобы потом показать врачу)</label>
<div class="row" style="gap:8px;margin-top:12px"><button class="btn" onclick="DMDocs.save()">Сохранить всё</button><button class="btn secondary" onclick="DMDocs.cancel()">Отмена</button></div>`;
}
async function save(){
  if(!results)return;const v=id=>document.getElementById(id)?.value?.trim()||'',on=id=>!!document.getElementById(id)?.checked;
  db.labs=db.labs||[];let added=0,saved=0;const keep=on('docKeep');
  if(keep){try{await putPages(batchId,pages.filter(p=>p.mediaType!=='application/pdf').map(p=>p.data))}catch(e){}}
  results.forEach((o,k)=>{const id=s=>`d${k}_${s}`;if(!on(id('use')))return;
    const doc={id:'doc'+Date.now()+'_'+k,docType:v(id('type')),date:v(id('date')),title:v(id('title')),institution:v(id('inst')),doctor:v(id('doc')),hospitalization:o.hospitalization,patient:o.patient||null,diagnoses:o.diagnoses,labs:[],insulin:o.insulin,otherMeds:o.otherMeds,recommendations:o.recommendations,summary:v(id('sum')),createdAt:new Date().toISOString(),pagesRef:keep?{batch:batchId,pages:o.pages||[],device:navigator.userAgent.slice(0,60)}:null};
    o.labs.forEach((l,i)=>{const val=parseFloat(String(v(id('lv'+i))).replace(',','.'));const date=v(id('ld'+i))||doc.date;const code=v(id('lc'+i))||'other';
      doc.labs.push({...l,value:Number.isFinite(val)?val:l.value,date,code});
      if(!on(id('l'+i))||!Number.isFinite(val)||!date)return;
      const t=LAB_TYPES.find(x=>x[0]===code)||LAB_TYPES[LAB_TYPES.length-1];
      if(db.labs.some(x=>x.date===date&&x.type===t[0]&&+x.value===val&&(t[0]!=='other'||x.name===l.name)))return;
      db.labs.push({id:'lab'+Date.now()+'_'+k+'_'+i,date,type:t[0],name:t[0]==='other'?l.name:t[1],value:val,unit:l.unit||t[2],note:'из документа: '+(doc.title||doc.docType)+(l.ref?' · норма '+l.ref:'')});added++});
    if(on(id('ins'))){db.medical=db.medical||{};const ic=(k,n)=>{try{return window.insulinCode?insulinCode(k,n):''}catch(e){return ''}};const b=o.insulin.find(x=>/базал/i.test(x.kind||'')||ic('basal',x.name)),u=o.insulin.find(x=>/болюс/i.test(x.kind||'')||ic('bolus',x.name));if(b&&ic('basal',b.name))db.medical.basal=ic('basal',b.name);if(u&&ic('bolus',u.name))db.medical.bolus=ic('bolus',u.name);const sch=o.insulin.map(x=>x.name+(x.dose?' — '+x.dose:'')).join('; ');if(sch)db.medical.ins=sch;if(b&&u&&(!db.medical.regimen||db.medical.regimen==='Не указано'))db.medical.regimen='Многократные инъекции (MDI)'}
    docs().push(doc);saved++});
  persist();results=null;pages=[];drawPages();
  document.getElementById('docResult').innerHTML=`<div class="notice" style="background:#f0fdfa;border-color:#99f6e4">Сохранено документов: ${saved}.${added?` В «Анализы» добавлено показателей: ${added}.`:''}</div>`;
  render();try{renderLabs()}catch(e){}
}
function cancel(){results=null;document.getElementById('docResult').innerHTML=''}
function del(id){if(!confirm('Удалить этот документ из истории? Анализы, уже добавленные в «Анализы», останутся.'))return;const d=docs().find(x=>x.id===id);db.docs=docs().filter(x=>x.id!==id);
  if(d&&d.pagesRef&&!docs().some(x=>x.pagesRef&&x.pagesRef.batch===d.pagesRef.batch))delPages(d.pagesRef.batch);persist();render()}
async function openPages(id){const d=docs().find(x=>x.id===id);if(!d||!d.pagesRef)return;const all=await getPages(d.pagesRef.batch);
  if(!all||!all.length)return alert('Копии страниц хранятся только на том телефоне, где документ фотографировали.');
  const list=(d.pagesRef.pages&&d.pagesRef.pages.length?d.pagesRef.pages.map(n=>all[n-1]).filter(Boolean):all);
  const w=document.createElement('div');w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;overflow:auto;padding:12px';
  w.innerHTML=`<button class="btn" style="position:sticky;top:0;float:right" onclick="this.parentNode.remove()">Закрыть ✕</button>`+list.map(src=>`<img src="${src}" style="width:100%;margin:8px 0;border-radius:6px;background:#fff">`).join('');document.body.appendChild(w)}

function docHtml(d,forReport){
  return `<div class="${forReport?'':'card'}" style="${forReport?'border-top:1px solid #e2e8f0;padding:8px 0':'margin:10px 0'}">
<div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><div><span class="pill">${esc(d.docType)}</span> <b>${fmt(d.date)||'без даты'}</b> · ${esc(d.title)}<div class="muted" style="font-size:13px">${esc([d.institution,d.doctor].filter(Boolean).join(' · '))}</div></div>${forReport?'':`<button class="btn secondary" style="padding:4px 10px" onclick="DMDocs.del('${d.id}')">✕</button>`}</div>
${d.hospitalization&&(d.hospitalization.from||d.hospitalization.to)?`<div>🏥 Госпитализация: ${fmt(d.hospitalization.from)} — ${fmt(d.hospitalization.to)} ${esc(d.hospitalization.department||'')}</div>`:''}
${(d.diagnoses||[]).length?`<div style="margin-top:4px"><b>Диагноз:</b> ${d.diagnoses.map(x=>esc(x.text)+(x.icd?` (${esc(x.icd)})`:'')).join('; ')}</div>`:''}
${d.summary?`<p style="margin:6px 0">${esc(d.summary)}</p>`:''}
${forReport?'':`${d.pagesRef?`<button class="btn secondary" style="padding:6px 10px;margin:4px 0" onclick="DMDocs.openPages('${d.id}')">🖼 Копия документа</button>`:''}<details><summary class="muted">Подробнее</summary>
${(d.labs||[]).length?`<b>Анализы:</b><ul>${d.labs.map(l=>`<li>${esc(l.name)}: ${l.value} ${esc(l.unit)}${l.ref?` (норма ${esc(l.ref)})`:''}${l.date?' · '+fmt(l.date):''}</li>`).join('')}</ul>`:''}
${(d.insulin||[]).length?`<b>Инсулин:</b><ul>${d.insulin.map(x=>`<li>${esc(x.name)} — ${esc(x.dose)}</li>`).join('')}</ul>`:''}
${(d.otherMeds||[]).length?`<b>Другие назначения:</b><ul>${d.otherMeds.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
${(d.recommendations||[]).length?`<b>Рекомендации:</b><ul>${d.recommendations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</details>`}</div>`;
}
function render(){
  const sec=document.getElementById('labs');if(!sec)return;let box=document.getElementById('docsCard');
  if(!box){box=document.createElement('div');box.id='docsCard';box.className='card';box.style.marginBottom='14px';const anchor=sec.querySelector(':scope>.secLead')||sec.querySelector(':scope>.stickyHead');anchor?anchor.after(box):sec.prepend(box)}
  const list=docs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const keepRes=document.getElementById('docResult')?.innerHTML||'';
  box.innerHTML=`<h3>Документы и история болезни</h3>
<p class="muted">Сфотографируйте выписку, заключение врача или бланки анализов — по одной странице, сколько нужно (до 12), — или выберите готовые фото и PDF. Можно сразу несколько разных документов: приложение само их разделит, прочитает и разложит по разделам.</p>
<div class="row" style="gap:8px;flex-wrap:wrap">
<label class="btn" style="cursor:pointer">📷 Сфотографировать страницу<input type="file" accept="image/*" capture="environment" style="display:none" onchange="DMDocs.add(this)"></label>
<label class="btn secondary" style="cursor:pointer">📁 Выбрать фото или PDF<input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="DMDocs.add(this)"></label></div>
<p class="muted" style="font-size:13px;margin:6px 0 0">Снимайте при хорошем свете, лист целиком, без бликов. Повёрнутые бланки — не страшно.</p>
<div id="docPrev" class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap"></div>
<button class="btn" id="docGo" style="margin-top:10px;width:100%" onclick="DMDocs.recognize()" ${pages.length?'':'disabled'}>🔍 Распознать</button>
<p class="muted" style="font-size:12px;margin-top:6px">Страницы отправляются на ваш сервер распознавания (тот же, что для фото еды) и читаются моделью Claude. Сохраняется только то, что вы подтвердите.</p>
<div id="docResult">${keepRes}</div>
<h3 style="margin-top:16px">История ${list.length?`<small class="muted">(${list.length})</small>`:''}</h3>
${list.length?list.map(d=>docHtml(d)).join(''):'<p class="muted">Пока нет документов.</p>'}`;
  drawPages();
}
function reportHtml(){const list=docs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));if(!list.length)return '';
  return `<div class="reportSection" style="margin-top:18px"><h2>История болезни (по документам)</h2>${list.map(d=>docHtml(d,true)).join('')}</div>`}

window.DMDocs={add,removePage,recognize,save,cancel,del,openPages,render,reportHtml};
const hook=()=>{const o=window.show;if(typeof o!=='function'||o.__docs)return;const w=function(id){const r=o.apply(this,arguments);if(id==='labs')setTimeout(render,30);return r};w.__docs=true;window.show=w};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
