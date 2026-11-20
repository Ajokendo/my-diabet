/* «Мой диабет» — отчёт врачу в PDF, чтобы отправить в WhatsApp/Telegram/почту прямо с телефона.
 * Отчёт рисуется в картинку (html2canvas) и раскладывается по страницам A4 (jsPDF), разрезы — между строками. */
(function(){
function load(src){return new Promise((ok,bad)=>{if(document.querySelector(`script[data-src="${src}"]`))return ok();const s=document.createElement('script');s.src=src;s.dataset.src=src;s.onload=ok;s.onerror=()=>bad(new Error('Не удалось загрузить '+src+'. Проверьте интернет.'));document.head.appendChild(s)})}
async function libs(){await load('assets/vendor/html2canvas.min.js');await load('assets/vendor/jspdf.umd.min.js')}
function fileName(){const p=(window.db&&db.profile)||{},n=String(p.name||p.fullName||'').trim().split(/\s+/)[0]||'пациент';const d=new Date(),ds=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return `Отчёт врачу — ${n} — ${ds}.pdf`.replace(/[\\/:*?"<>|]/g,'')}
async function build(){
  const src=document.getElementById('doctorReport');if(!src)throw new Error('Нет отчёта.');
  if(src.style.display==='none'||!src.innerHTML.trim())window.generateDoctorReport();
  if(window.DMCgm&&DMCgm.pending&&DMCgm.pending()){try{await DMCgm.pending()}catch(e){}window.generateDoctorReport()}
  await libs();
  const W=794,body=document.body,zoom=body.style.zoom;body.style.zoom='';
  const box=document.createElement('div');box.style.cssText=`position:fixed;left:-10000px;top:0;width:${W}px;background:#fff;color:#000;padding:28px 32px;font-size:13px;line-height:1.45`;
  box.innerHTML=src.innerHTML;box.querySelectorAll('.no-print,button,details>summary').forEach(e=>{if(e.tagName==='SUMMARY')return;e.remove()});box.querySelectorAll('details').forEach(d=>d.open=true);
  document.documentElement.appendChild(box);
  try{
    const top=box.getBoundingClientRect().top;
    const cuts=[...box.querySelectorAll('p,li,tr,.reportSection,.mini,.card,svg,img,table,div')].filter(e=>!/^H[1-4]$/.test((e.nextElementSibling||{}).tagName||'')).map(e=>{const r=e.getBoundingClientRect();return Math.round(r.bottom-top)}).filter(y=>y>0).sort((a,b)=>a-b);
    const brks=[...box.querySelectorAll('.rptBreak')].map(e=>Math.round(e.getBoundingClientRect().top-top)*2).filter(y=>y>0);
    const scale=2,canvas=await html2canvas(box,{scale,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:W+64});
    const {jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    const pxW=canvas.width,pageH=Math.floor(pxW*297/210),margin=Math.round(10*pxW/210);
    let y=0,first=true;const total=canvas.height;
    while(y<total-4){
      let limit=y+pageH-2*margin;if(limit>=total)limit=total;else{const c=cuts.map(v=>v*scale).filter(v=>v>y+pageH*0.4&&v<=limit);if(c.length)limit=c[c.length-1]}
      const bk=brks.find(v=>v>y+4&&v<=limit);if(bk)limit=bk;
      const h=limit-y,part=document.createElement('canvas');part.width=pxW;part.height=h;const g=part.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,pxW,h);g.drawImage(canvas,0,y,pxW,h,0,0,pxW,h);
      if(!first)pdf.addPage();first=false;pdf.addImage(part.toDataURL('image/jpeg',0.86),'JPEG',0,10,210,h*210/pxW);y=limit}
    const n=pdf.getNumberOfPages();for(let i=1;i<=n;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(120);pdf.text(`${i} / ${n}`,200,290,{align:'right'})}
    return new File([pdf.output('blob')],fileName(),{type:'application/pdf'});
  }finally{box.remove();body.style.zoom=zoom}
}
function save(f){const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}
/* v64.131: PDF строится долго, и браузер «забывает» о нажатии кнопки — прямое меню «Поделиться» не открывается.
   Поэтому после сборки показываем окно с новой кнопкой: нажатие на неё открывает «Поделиться» (WhatsApp и др.) без сохранения в «Загрузки». */
function ready(f){
  const old=document.getElementById('rptPdfReady');if(old)old.remove();
  const mb=(f.size/1048576).toFixed(1).replace('.',','),can=!!(navigator.canShare&&navigator.canShare({files:[f]}));
  const w=document.createElement('div');w.id='rptPdfReady';w.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px';
  w.innerHTML=`<div style="background:#fff;border-radius:18px;padding:20px;max-width:380px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3)"><h3 style="margin:0 0 6px">PDF готов</h3><div class="muted" style="margin-bottom:14px">${mb} МБ · ${f.name}</div>${can?'<button class="btn" id="rptPdfShare" style="width:100%;margin-bottom:8px">Отправить (WhatsApp и др.)</button>':''}<button class="btn secondary" id="rptPdfSave" style="width:100%;margin-bottom:8px">Сохранить в «Загрузки»</button><button class="btn secondary" id="rptPdfClose" style="width:100%">Закрыть</button><p class="muted" style="font-size:12px;margin:10px 0 0">${can?'«Отправить» открывает выбор приложения прямо отсюда — файл не нужно искать и открывать.':'Здесь нельзя отправить файл напрямую. Сохраните PDF и приложите его в WhatsApp: скрепка → Документ.'} Если при открытии сохранённого файла показывается реклама — это стороннее приложение для PDF; откройте файл через «Файлы» или Google Диск.</p></div>`;
  document.body.appendChild(w);
  const close=()=>w.remove();
  w.querySelector('#rptPdfClose').onclick=close;
  w.querySelector('#rptPdfSave').onclick=()=>{save(f);close();alert('PDF сохранён в «Загрузки».')};
  const sh=w.querySelector('#rptPdfShare');if(sh)sh.onclick=async()=>{try{await navigator.share({files:[f],title:'Отчёт врачу',text:'Отчёт из приложения «Мой диабет»'});close()}catch(e){if(!e||e.name!=='AbortError'){save(f);close();alert('Не удалось открыть «Поделиться». PDF сохранён в «Загрузки».')}}};
  w.addEventListener('click',e=>{if(e.target===w)close()});
}
async function share(btn){
  const t=btn&&btn.innerHTML;if(btn){btn.disabled=true;btn.textContent='Готовлю PDF…'}
  try{const f=await build();ready(f)}catch(e){alert('Не получилось сделать PDF: '+(e.message||e))}
  finally{if(btn){btn.disabled=false;btn.innerHTML=t}}
}
window.DMReportPdf={share,build};
})();
