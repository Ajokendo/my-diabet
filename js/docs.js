/* «Мой диабет» — медицинские документы: выписки, заключения, анализы.
 * Фото или PDF отправляются на наш сервер распознавания (тот же, что для фото еды), модель переносит
 * данные в структуру, человек проверяет и сохраняет. Сами снимки не хранятся — только распознанные данные.
 * Документы синхронизируются с семьёй (запись «docs»), анализы попадают в «Анализы», всё — в отчёт врачу. */
(function(){
let files=[],result=null,busy=false;
const TYPES=['выписка','заключение','анализы','рецепт','другое'];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function P(){return (db.settings&&db.settings.photo)||{}}
function base(){return (P().server||'https://my-diabet.ajokendo.workers.dev').replace(/\/$/,'')}
function docs(){if(!Array.isArray(db.docs))db.docs=[];return db.docs}
function fmt(d){if(!d)return '';const [y,m,dd]=d.split('-');return dd&&m?`${dd}.${m}.${y}`:d}

function shrink(file,max=1800){return new Promise((ok,bad)=>{const img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);ok({mediaType:'image/jpeg',data:c.toDataURL('image/jpeg',0.85),name:file.name})};img.onerror=()=>bad(new Error('Не удалось открыть '+file.name));img.src=URL.createObjectURL(file)})}
function readPdf(file){return new Promise((ok,bad)=>{if(file.size>9e6)return bad(new Error('PDF больше 9 МБ — сфотографируйте страницы или сожмите файл.'));const r=new FileReader();r.onload=()=>ok({mediaType:'application/pdf',data:r.result,name:file.name});r.onerror=()=>bad(new Error('Не удалось прочитать '+file.name));r.readAsDataURL(file)})}

async function pick(input){
  const fs=[...(input.files||[])].slice(0,8);const prev=document.getElementById('docPrev');
  try{files=await Promise.all(fs.map(f=>f.type==='application/pdf'?readPdf(f):shrink(f)));}catch(e){alert(e.message);files=[]}
  if(prev)prev.innerHTML=files.map(f=>f.mediaType==='application/pdf'?`<span class="pill">📄 ${esc(f.name)}</span>`:`<img src="${f.data}" style="height:80px;border-radius:8px;border:1px solid #e2e8f0">`).join(' ');
}
async function recognize(){
  if(!files.length)return alert('Сначала выберите фото страниц или PDF.');
  if(busy)return;busy=true;const out=document.getElementById('docResult');out.innerHTML='<p class="muted">Читаю документ… обычно 20–60 секунд.</p>';
  try{const r=await fetch(base()+'/v1/medical-doc',{method:'POST',headers:{'Content-Type':'application/json','X-Access-Code':P().code||''},body:JSON.stringify({files:files.map(f=>({mediaType:f.mediaType,data:f.data.split(',')[1]}))})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Ошибка '+r.status));result=j;review();}
  catch(e){const net=/Failed to fetch|NetworkError|Load failed/i.test(String(e.message||e));out.innerHTML=`<div class="notice">${net?'Нет связи с сервером распознавания. Проверьте интернет.':esc(e.message)}${/код доступа/i.test(e.message)?'<br>Код доступа вводится в разделе «Фото» → «Настройки сервера и код доступа».':''}</div>`}
  finally{busy=false}
}
function review(){
  const o=result,out=document.getElementById('docResult');const labOpts=LAB_TYPES.map(t=>t[0]);
  out.innerHTML=`<div class="card" style="border:2px solid #14b8a6;margin-top:10px"><h3>Проверьте, что распознано</h3>
<p class="muted">Исправьте ошибки и снимите галочки с того, что не нужно сохранять.</p>
<div class="two"><div><label>Тип</label><select id="dType" class="select">${TYPES.map(t=>`<option ${t===o.docType?'selected':''}>${t}</option>`).join('')}</select></div><div><label>Дата документа</label><input id="dDate" type="date" class="input" value="${esc(o.date)}"></div></div>
<label>Название</label><input id="dTitle" class="input" value="${esc(o.title||o.docType)}">
<div class="two"><div><label>Учреждение</label><input id="dInst" class="input" value="${esc(o.institution)}"></div><div><label>Врач</label><input id="dDoc" class="input" value="${esc(o.doctor)}"></div></div>
${o.hospitalization&&(o.hospitalization.from||o.hospitalization.to)?`<p><b>Госпитализация:</b> ${fmt(o.hospitalization.from)} — ${fmt(o.hospitalization.to)} ${esc(o.hospitalization.department)}</p>`:''}
${o.diagnoses.length?`<h4>Диагнозы</h4><ul>${o.diagnoses.map(d=>`<li>${d.main?'<b>':''}${esc(d.text)}${d.main?'</b>':''}${d.icd?` <span class="muted">(${esc(d.icd)})</span>`:''}</li>`).join('')}</ul>`:''}
${o.labs.length?`<h4>Анализы — добавить в «Анализы»</h4><div style="overflow:auto"><table class="table"><tr><th></th><th>Показатель</th><th>Значение</th><th>Дата</th></tr>${o.labs.map((l,i)=>`<tr><td><input type="checkbox" id="dl${i}" checked></td><td>${esc(l.name)}<br><select id="dlc${i}" class="select" style="padding:4px;font-size:13px">${LAB_TYPES.map(t=>`<option value="${t[0]}" ${t[0]===(labOpts.includes(l.code)?l.code:'other')?'selected':''}>${t[1]}</option>`).join('')}</select></td><td><input id="dlv${i}" class="input" style="width:80px" value="${l.value}"> ${esc(l.unit)}${l.ref?`<div class="muted" style="font-size:12px">норма: ${esc(l.ref)}</div>`:''}</td><td><input id="dld${i}" type="date" class="input" value="${esc(l.date||o.date)}"></td></tr>`).join('')}</table></div>`:''}
${o.insulin.length?`<h4>Инсулинотерапия по документу</h4><ul>${o.insulin.map(x=>`<li><b>${esc(x.name)}</b> ${x.kind?`(${esc(x.kind)})`:''} — ${esc(x.dose)}</li>`).join('')}</ul><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dIns"> Записать схему в «Медицинские данные» → «Инсулинотерапия»</label><p class="muted" style="font-size:13px">Коэффициенты для расчёта дозы не меняются — их вы настраиваете сами по назначению врача.</p>`:''}
${o.otherMeds.length?`<h4>Другие назначения</h4><ul>${o.otherMeds.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
${o.recommendations.length?`<h4>Рекомендации</h4><ul>${o.recommendations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
<label>Кратко</label><textarea id="dSum" class="input" rows="4">${esc(o.summary)}</textarea>
${o.unreadable?`<div class="notice" style="margin-top:8px">Не удалось прочитать: ${esc(o.unreadable)}</div>`:''}
<div class="row" style="gap:8px;margin-top:12px"><button class="btn" onclick="DMDocs.save()">Сохранить</button><button class="btn secondary" onclick="DMDocs.cancel()">Отмена</button></div></div>`;
}
function save(){
  const o=result;if(!o)return;const v=id=>document.getElementById(id)?.value?.trim()||'';
  const doc={id:'doc'+Date.now(),docType:v('dType'),date:v('dDate'),title:v('dTitle'),institution:v('dInst'),doctor:v('dDoc'),hospitalization:o.hospitalization,diagnoses:o.diagnoses,labs:[],insulin:o.insulin,otherMeds:o.otherMeds,recommendations:o.recommendations,summary:v('dSum'),createdAt:new Date().toISOString()};
  db.labs=db.labs||[];let added=0;
  o.labs.forEach((l,i)=>{const val=parseFloat(String(v('dlv'+i)).replace(',','.'));const date=v('dld'+i)||doc.date;const code=v('dlc'+i)||'other';
    doc.labs.push({...l,value:Number.isFinite(val)?val:l.value,date,code});
    if(!document.getElementById('dl'+i)?.checked||!Number.isFinite(val)||!date)return;
    const t=LAB_TYPES.find(x=>x[0]===code)||LAB_TYPES[LAB_TYPES.length-1];
    if(db.labs.some(x=>x.date===date&&x.type===t[0]&&+x.value===val&&(t[0]!=='other'||x.name===l.name)))return;
    db.labs.push({id:'lab'+Date.now()+'_'+i,date,type:t[0],name:t[0]==='other'?l.name:t[1],value:val,unit:l.unit||t[2],note:'из документа: '+(doc.title||doc.docType)+(l.ref?' · норма '+l.ref:'')});added++});
  if(document.getElementById('dIns')?.checked){db.medical=db.medical||{};const bas=o.insulin.filter(x=>/базал/i.test(x.kind)).map(x=>x.name+' — '+x.dose).join('; '),bol=o.insulin.filter(x=>/болюс/i.test(x.kind)).map(x=>x.name+' — '+x.dose).join('; ');if(bas)db.medical.basal=bas;if(bol)db.medical.bolus=bol}
  docs().push(doc);save0();result=null;files=[];
  document.getElementById('docResult').innerHTML=`<div class="notice" style="background:#f0fdfa;border-color:#99f6e4">Сохранено. ${added?`В «Анализы» добавлено показателей: ${added}.`:''}</div>`;
  const inp=document.getElementById('docFiles');if(inp)inp.value='';const pr=document.getElementById('docPrev');if(pr)pr.innerHTML='';
  render();try{renderLabs()}catch(e){}
}
function save0(){try{save_global()}catch(e){}}
function save_global(){window.save()}
function cancel(){result=null;document.getElementById('docResult').innerHTML=''}
function del(id){if(!confirm('Удалить этот документ из истории? Анализы, уже добавленные в «Анализы», останутся.'))return;db.docs=docs().filter(d=>d.id!==id);save0();render()}

function docHtml(d,forReport){
  return `<div class="${forReport?'':'card'}" style="${forReport?'border-top:1px solid #e2e8f0;padding:8px 0':'margin:10px 0'}">
<div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start"><div><span class="pill">${esc(d.docType)}</span> <b>${fmt(d.date)||'без даты'}</b> · ${esc(d.title)}<div class="muted" style="font-size:13px">${esc([d.institution,d.doctor].filter(Boolean).join(' · '))}</div></div>${forReport?'':`<button class="btn secondary" style="padding:4px 10px" onclick="DMDocs.del('${d.id}')">✕</button>`}</div>
${d.hospitalization&&(d.hospitalization.from||d.hospitalization.to)?`<div>🏥 Госпитализация: ${fmt(d.hospitalization.from)} — ${fmt(d.hospitalization.to)} ${esc(d.hospitalization.department||'')}</div>`:''}
${(d.diagnoses||[]).length?`<div style="margin-top:4px"><b>Диагноз:</b> ${d.diagnoses.map(x=>esc(x.text)+(x.icd?` (${esc(x.icd)})`:'')).join('; ')}</div>`:''}
${d.summary?`<p style="margin:6px 0">${esc(d.summary)}</p>`:''}
${forReport?'':`<details><summary class="muted">Подробнее</summary>
${(d.labs||[]).length?`<b>Анализы:</b><ul>${d.labs.map(l=>`<li>${esc(l.name)}: ${l.value} ${esc(l.unit)}${l.ref?` (норма ${esc(l.ref)})`:''}${l.date?' · '+fmt(l.date):''}</li>`).join('')}</ul>`:''}
${(d.insulin||[]).length?`<b>Инсулин:</b><ul>${d.insulin.map(x=>`<li>${esc(x.name)} — ${esc(x.dose)}</li>`).join('')}</ul>`:''}
${(d.otherMeds||[]).length?`<b>Другие назначения:</b><ul>${d.otherMeds.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
${(d.recommendations||[]).length?`<b>Рекомендации:</b><ul>${d.recommendations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</details>`}</div>`;
}
function render(){
  const sec=document.getElementById('labs');if(!sec)return;let box=document.getElementById('docsCard');
  if(!box){box=document.createElement('div');box.id='docsCard';box.className='card';box.style.marginBottom='14px';const top=sec.querySelector('.top');top?top.after(box):sec.prepend(box)}
  const list=docs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const keepRes=document.getElementById('docResult')?.innerHTML||'';
  box.innerHTML=`<h3>📄 Документы и история болезни</h3>
<p class="muted">Сфотографируйте выписку из больницы, заключение врача или бланк анализов (можно несколько страниц) или выберите PDF. Приложение прочитает документ, вы проверите — и данные разложатся по разделам: диагнозы и госпитализации — в историю, показатели — в «Анализы».</p>
<input id="docFiles" type="file" accept="image/*,application/pdf" multiple class="input" onchange="DMDocs.pick(this)">
<div id="docPrev" class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"></div>
<button class="btn" style="margin-top:10px" onclick="DMDocs.recognize()">Распознать документ</button>
<p class="muted" style="font-size:12px;margin-top:6px">Снимок отправляется на ваш сервер распознавания (тот же, что для фото еды) и обрабатывается моделью Claude. Сам снимок не сохраняется — только то, что вы подтвердите.</p>
<div id="docResult">${keepRes}</div>
<h3 style="margin-top:16px">История ${list.length?`<small class="muted">(${list.length})</small>`:''}</h3>
${list.length?list.map(d=>docHtml(d)).join(''):'<p class="muted">Пока нет документов.</p>'}`;
}
function reportHtml(){const list=docs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));if(!list.length)return '';
  return `<div class="reportSection" style="margin-top:18px"><h2>История болезни (по документам)</h2>${list.map(d=>docHtml(d,true)).join('')}</div>`}

window.DMDocs={pick,recognize,save,cancel,del,render,reportHtml};
const hook=()=>{const o=window.show;if(typeof o!=='function'||o.__docs)return;const w=function(id){const r=o.apply(this,arguments);if(id==='labs')setTimeout(render,30);return r};w.__docs=true;window.show=w};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
