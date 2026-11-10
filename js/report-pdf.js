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
    const scale=2,canvas=await html2canvas(box,{scale,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:W+64});
    const {jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    const pxW=canvas.width,pageH=Math.floor(pxW*297/210),margin=Math.round(10*pxW/210);
    let y=0,first=true;const total=canvas.height;
    while(y<total-4){
      let limit=y+pageH-2*margin;if(limit>=total)limit=total;else{const c=cuts.map(v=>v*scale).filter(v=>v>y+pageH*0.4&&v<=limit);if(c.length)limit=c[c.length-1]}
      const h=limit-y,part=document.createElement('canvas');part.width=pxW;part.height=h;const g=part.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,pxW,h);g.drawImage(canvas,0,y,pxW,h,0,0,pxW,h);
      if(!first)pdf.addPage();first=false;pdf.addImage(part.toDataURL('image/jpeg',0.86),'JPEG',0,10,210,h*210/pxW);y=limit}
    const n=pdf.getNumberOfPages();for(let i=1;i<=n;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(120);pdf.text(`${i} / ${n}`,200,290,{align:'right'})}
    return new File([pdf.output('blob')],fileName(),{type:'application/pdf'});
  }finally{box.remove();body.style.zoom=zoom}
}
async function share(btn){
  const t=btn&&btn.innerHTML;if(btn){btn.disabled=true;btn.textContent='Готовлю PDF…'}
  try{const f=await build();
    if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'Отчёт врачу',text:'Отчёт из приложения «Мой диабет»'});return}catch(e){if(e&&e.name==='AbortError')return}}
    const a=document.createElement('a');a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000);
    alert('PDF сохранён в «Загрузки». Отправьте его врачу из WhatsApp: скрепка → Документ → выберите файл.');
  }catch(e){alert('Не получилось сделать PDF: '+(e.message||e))}
  finally{if(btn){btn.disabled=false;btn.innerHTML=t}}
}
window.DMReportPdf={share,build};
})();
