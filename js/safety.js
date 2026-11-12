/* v64.24: подсказки безопасности в калькуляторе и на главной.
   — углеводы можно вводить в граммах или ХЕ;
   — сахар выше 13: напоминание проверить кетоны;
   — сахар ниже 3,9: карточка «что делать при гипо» (общие правила, конкретный план — от врача).
   Дозы и коэффициенты здесь не считаются и не меняются. */
(function () {
  const KETONE_FROM = 13;
  const f1 = v => (+v).toFixed(1).replace('.', ',');
  const xeG = () => +(db.settings && db.settings.xe) || 12;
  const unit = () => (db.settings && db.settings.carbUnit) === 'xe' ? 'xe' : 'g';

  /* быстрые углеводы из базы: сколько нужно на 15 г */
  function fastList() {
    const pick = [['Сок яблочный', 'мл'], ['Напиток Coca-Cola', 'мл'], ['Напиток Fanta Апельсин', 'мл'], ['Мёд', 'г'], ['Сахар', 'г']];
    const out = [];
    pick.forEach(([n, u]) => { const f = (db.foods || []).find(x => x.name === n); if (f && +f.c > 3) out.push(`${n.replace('Напиток ', '')} — ${Math.round(15 / f.c * 100 / 5) * 5} ${u}`) });
    return out;
  }
  function hypoHtml(g) {
    const list = fastList();
    return `<div class="safeCard hypo"><div class="safeHead"><b>Сахар ${g != null ? f1(g) + ' — ' : ''}ниже 3,9: что делать</b><span class="safeTag">по плану врача</span></div>
<ol>
<li>Съесть или выпить <b>15–20 г быстрых углеводов</b>${list.length ? `: ${list.slice(0, 3).join(', ')}` : ' (сок, сладкий напиток, таблетки глюкозы)'}. Для маленьких детей врач может назначить меньше.</li>
<li><b>Через 15 минут перемерить</b> сахар.</li>
<li>Если всё ещё ниже 3,9 — повторить шаг 1.</li>
<li>Когда сахар выше 3,9, а до еды больше часа — перекусить медленными углеводами (хлеб, печенье).</li>
</ol>
<div class="safeAlarm"><b>Без сознания или судороги:</b> ничего не давать в рот, ввести глюкагон, если он назначен, и вызвать скорую — <b>103</b>.</div>
<div class="muted safeFoot">Это общие правила. Сколько углеводов давать и когда звонить врачу — по личному плану, который дал эндокринолог.</div></div>`;
  }
  function ketoneHtml(g) {
    return `<div class="safeCard keto"><div class="safeHead"><b>Сахар ${g != null ? f1(g) : ''} — выше ${KETONE_FROM}: проверьте кетоны</b><span class="safeTag">по плану врача</span></div>
<div>Тест-полоской в моче или крови, если так прописано в плане. Пить воду.</div>
<div class="safeAlarm"><b>Срочно к врачу или скорая 103</b>, если кетоны высокие или есть тошнота, рвота, боль в животе, запах ацетона, сильная слабость.</div></div>`;
  }
  function noteFor(g) { if (!(g > 0)) return ''; if (g < 3.9) return hypoHtml(g); if (g > KETONE_FROM) return ketoneHtml(g); return '' }

  /* ---- граммы / ХЕ в основном калькуляторе ---- */
  function setupUnit() {
    const inp = document.getElementById('iCarb'); if (!inp || document.getElementById('iCarbUnit')) return;
    const cell = inp.closest('.row') ? inp.closest('.row').parentElement : inp.parentElement;
    const l = cell.querySelector('label');
    const sel = document.createElement('span'); sel.id = 'iCarbUnit'; sel.className = 'carbUnit';
    const paintSeg = () => { sel.innerHTML = `<button type="button" data-u="g" class="${unit() === 'g' ? 'on' : ''}">г</button><button type="button" data-u="xe" class="${unit() === 'xe' ? 'on' : ''}">ХЕ</button>` };
    paintSeg();
    if (l) l.textContent = 'Углеводы';
    const row = document.createElement('div'); row.className = 'carbRow'; (inp.closest('.row') || inp).after(row); row.appendChild(sel);
    sel.value = unit();
    sel.addEventListener('click', e => { const u = e.target.dataset && e.target.dataset.u; if (!u || u === unit()) return; sel.value = u; sel.onchange(); paintSeg() });
    sel.onchange = () => {
      const old = unit(), nu = sel.value, v = +inp.value;
      if (v && old !== nu) inp.value = nu === 'xe' ? (v / xeG()).toFixed(1) : (v * xeG()).toFixed(0);
      db.settings.carbUnit = nu; try { save() } catch (e) {} hint();
    };
    inp.addEventListener('input', hint);
    hint();
  }
  function hint() {
    const inp = document.getElementById('iCarb'); if (!inp) return; let h = document.getElementById('iCarbHint');
    if (!h) { h = document.createElement('div'); h.id = 'iCarbHint'; h.className = 'muted carbHint'; const row = document.querySelector('.carbRow'); row ? row.appendChild(h) : (inp.closest('.row') || inp).after(h) }
    const v = +inp.value; h.textContent = !v ? `1 ХЕ = ${xeG()} г углеводов` : unit() === 'xe' ? `= ${f1(v * xeG())} г углеводов` : `= ${f1(v / xeG())} ХЕ`;
  }

  /* обёртки: калькулятор считает в граммах, переводим перед расчётом */
  const wrap = (name, after) => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const r = f.apply(this, arguments); try { after.apply(this, arguments) } catch (e) {} return r } };
  /* «Сахар не измерял»: доза считается только на еду (коррекция = 0), в журнал пишется пометка «без замера» */
  const NOG_NOTE = '<div class="noGNote"><b>Сахар не измерен — посчитана доза только на еду, без коррекции.</b><br>Если есть признаки низкого сахара (слабость, дрожь, пот, бледность) — сначала измерьте и действуйте по плану врача.</div>';
  function noGBox(input, id, onChange) {
    if (!input || document.getElementById(id)) return;
    const l = document.createElement('label'); l.className = 'noG'; l.innerHTML = `<input type="checkbox" id="${id}"> Сахар не измерял`;
    input.after(l); const c = l.querySelector('input');
    c.onchange = () => { input.disabled = c.checked; if (c.checked) { input.dataset.prev = input.value; input.value = '' } else if (input.dataset.prev) input.value = input.dataset.prev; onChange && onChange() };
  }
  function markLast() {
    try { const L = db.medical.calculationLog, rec = L[L.length - 1]; if (rec) { rec.noGlucose = true; if (rec.input) rec.input.glucose = null; save() } } catch (e) {}
  }
  function withTarget(gInput, target, fn) {
    gInput.disabled = false; gInput.value = String(target); let r;
    try { r = fn() } finally { gInput.value = ''; gInput.disabled = true }
    markLast(); return r;
  }
  const origCalc = window.calcInsulin;
  if (typeof origCalc === 'function') window.calcInsulin = function () {
    const inp = document.getElementById('iCarb'); let back = null;
    if (inp && unit() === 'xe' && inp.value) { back = inp.value; inp.value = String(+inp.value * xeG()) }
    const gI = document.getElementById('iG'), noG = document.getElementById('iNoG')?.checked;
    let r; try { r = noG ? withTarget(gI, +document.getElementById('iTarget').value || 6, () => origCalc.apply(this, arguments)) : origCalc.apply(this, arguments) } finally { if (back != null) inp.value = back }
    try { const box = document.getElementById('iResult'); if (box) { if (noG) box.insertAdjacentHTML('afterbegin', NOG_NOTE); else { const n = noteFor(+gI.value); if (n) box.insertAdjacentHTML('beforeend', n) } } } catch (e) {}
    return r;
  };
  const origModal = window.calculateModalInsulin;
  if (typeof origModal === 'function') window.calculateModalInsulin = function () {
    const gI = document.getElementById('modalG'), noG = document.getElementById('mNoG')?.checked;
    const t = +(db.profile && db.profile.target) || +(db.settings && db.settings.target) || 6;
    const r = noG ? withTarget(gI, t, () => origModal.apply(this, arguments)) : origModal.apply(this, arguments);
    try { const box = document.getElementById('modalHistory'); if (box && noG) box.insertAdjacentHTML('afterbegin', NOG_NOTE) } catch (e) {}
    return r;
  };
  wrap('openInsulinForMeal', () => { const c = document.getElementById('mNoG'), g = document.getElementById('modalG'); if (c && c.checked) { c.checked = false; if (g) g.disabled = false } });
  setTimeout(() => { noGBox(document.getElementById('iG'), 'iNoG'); noGBox(document.getElementById('modalG'), 'mNoG') }, 400);
  wrap('takeCarbsFromMenu', () => { const inp = document.getElementById('iCarb'); if (inp && unit() === 'xe' && inp.value) inp.value = (+inp.value / xeG()).toFixed(1); hint() });
  wrap('calculateModalInsulin', () => { if (document.getElementById('mNoG')?.checked) return; const g = +document.getElementById('modalG').value, box = document.getElementById('modalHistory'); if (box) { const n = noteFor(g); if (n) box.insertAdjacentHTML('beforeend', n) } });
  wrap('calcInit', setupUnit);
  wrap('show', id => { if (id === 'insulin') setTimeout(setupUnit, 60) });

  window.DMSafety = { noteFor, hypoHtml, ketoneHtml, KETONE_FROM };
  setTimeout(setupUnit, 500);
})();
