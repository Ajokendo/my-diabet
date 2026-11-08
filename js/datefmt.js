/* «Мой диабет» — даты в привычном формате ДД.ММ.ГГГГ во всех полях даты.
 * Стандартное поле даты браузер показывает по языку браузера (на английском Chrome — ММ/ДД/ГГГГ).
 * Поле оставляем как есть (выбор даты в календаре и значение ГГГГ-ММ-ДД для программы не меняются),
 * а поверх рисуем подпись ДД.ММ.ГГГГ. */
(function(){
const fmt=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?`${m[3]}.${m[2]}.${m[1]}`:''};
const desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
function paint(i){const o=i.__dmOv;if(!o)return;const t=fmt(desc.get.call(i));o.textContent=t||'дд.мм.гггг';o.style.color=t?'':'#94a3b8'}
function wrap(i){
  if(i.__dmOv||i.type!=='date')return;
  const cs=getComputedStyle(i);const w=document.createElement('span');w.className='dmDateWrap';
  w.style.cssText=`position:relative;display:${cs.display==='block'||i.classList.contains('input')?'block':'inline-block'};${cs.display==='block'?'':'max-width:100%'}`;
  i.parentNode.insertBefore(w,i);w.appendChild(i);
  const o=document.createElement('span');o.className='dmDateOv';
  o.style.cssText=`position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;pointer-events:none;padding-left:${cs.paddingLeft};padding-right:36px;font:${cs.font};color:inherit;white-space:nowrap;overflow:hidden`;
  w.appendChild(o);i.__dmOv=o;i.classList.add('dmDate');
  Object.defineProperty(i,'value',{configurable:true,get(){return desc.get.call(this)},set(v){desc.set.call(this,v);paint(this)}});
  i.addEventListener('input',()=>paint(i));i.addEventListener('change',()=>paint(i));
  /* клик по полю открывает календарь (на компьютере стандартное поле открывает его только по значку) */
  i.addEventListener('click',()=>{try{i.showPicker&&i.showPicker()}catch(e){}});
  paint(i);
}
function scan(root){(root.querySelectorAll?root:document).querySelectorAll('input[type="date"]').forEach(wrap)}
const st=document.createElement('style');
st.textContent='input.dmDate{color:transparent!important;caret-color:transparent}input.dmDate::-webkit-datetime-edit{color:transparent}input.dmDate:focus::-webkit-datetime-edit{color:transparent}';
document.head.appendChild(st);
function start(){scan(document);new MutationObserver(ms=>{for(const m of ms)m.addedNodes.forEach(n=>{if(n.nodeType!==1)return;if(n.matches&&n.matches('input[type="date"]'))wrap(n);else if(n.querySelectorAll)scan(n)})}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
window.DMDateFmt={scan,fmt};
})();
