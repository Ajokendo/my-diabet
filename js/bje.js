/* v64.96: добавочный инсулин на БЖЕ — ТОЛЬКО по схеме, которую назначил врач.
 * По умолчанию выключено, полей-по-умолчанию нет: приложение само ничего не подбирает.
 *  - «Мой профиль»: переключатель и числа врача (ЕД на 1 БЖЕ, через сколько минут, на сколько частей);
 *  - калькулятор: отдельная строка «Добавочный по БЖЕ» (в основную дозу не входит);
 *  - при записи болюса — таймер-напоминание на главной (+ уведомление, пока приложение открыто). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; };
  const fmtU = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
  const pad = n => String(n).padStart(2, '0');
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const persist = () => { try { save(); } catch (e) { } };

  const cfg = () => { const p = (typeof db !== 'undefined' && db.profile) || {}; return p.bje || {}; };
  /* настройка считается заполненной, только если включена и все нужные числа введены */
  function active() {
    const c = cfg(); if (!c.on) return null;
    const per = num(c.per), delay = num(c.delay), parts = Math.max(1, Math.min(4, Math.round(num(c.parts)) || 1)), gap = num(c.gap);
    if (!(per > 0) || !(delay >= 0) || !isFinite(delay)) return null;
    if (parts > 1 && !(gap > 0)) return null;
    return { per, delay, parts, gap: parts > 1 ? gap : 0 };
  }

  /* ---------- БЖЕ выбранного приёма пищи ---------- */
  function mealKey() { /* в кыргызском интерфейсе value у option может быть переведён — берём ключ по номеру */
    const sel = $('iMeal'); if (!sel) return '';
    try { if (getMenu()[sel.value]) return sel.value; if (typeof meals !== 'undefined' && meals[sel.selectedIndex]) return meals[sel.selectedIndex]; } catch (e) { }
    return sel.value;
  }
  function mealBje(meal) {
    try {
      const a = (getMenu()[meal] || []); let p = 0, f = 0;
      a.forEach(it => { const x = db.foods.find(y => y.id === it.foodId); if (x) { const z = calc(x, it.g); p += z.p; f += z.f; } });
      return bje(p, f);
    } catch (e) { return 0; }
  }

  /* ---------- расчёт добавочной дозы ---------- */
  function plan(meal) {
    const a = active(); if (!a) return null;
    const b = mealBje(meal); if (!(b > 0)) return null;
    const step = parseFloat($('iRound') && $('iRound').value) || 0.5;
    const rnd = x => Math.round(x / step) * step;
    const total = rnd(b * a.per);
    if (!(total > 0)) return { bje: b, total: 0, parts: [], cfg: a };
    const parts = []; let left = total;
    for (let i = 0; i < a.parts; i++) {
      let u = i === a.parts - 1 ? left : Math.min(left, rnd(total / a.parts));
      left = Math.max(0, left - u);
      if (u > 0) parts.push({ units: Math.round(u * 100) / 100, min: a.delay + i * a.gap });
    }
    return { bje: b, total, parts, cfg: a };
  }

  /* ---------- блок в калькуляторе ---------- */
  function paintCalc() {
    const host = $('iResult'); if (!host) return;
    const old = $('bjeCalc'); if (old) old.remove();
    if (!/class="kpi"/.test(host.innerHTML)) return; /* расчёт не удался — ничего не добавляем */
    const meal = mealKey();
    const pl = plan(meal);
    window.DMBje.last = pl && pl.parts.length ? { meal, at: Date.now(), parts: pl.parts, bje: pl.bje } : null;
    if (!pl) return;
    const box = document.createElement('div'); box.id = 'bjeCalc'; box.className = 'bjeCalc';
    if (!pl.parts.length) {
      box.innerHTML = `<b>Добавочный по БЖЕ:</b> <span class="muted">доза меньше шага округления</span>`;
    } else {
      const lines = pl.parts.map(p => `<div><b>${fmtU(p.units)}</b> <span>ЕД через</span> <b>${p.min}</b> <span>мин</span></div>`).join('');
      box.innerHTML = `<div class="bjeHead">Добавочный по БЖЕ</div>${lines}
<div class="muted bjeSub"><span>БЖЕ в приёме пищи:</span> ${fmtU(pl.bje)} · <span>по схеме врача. В основную дозу не входит.</span></div>`;
    }
    host.appendChild(box);
  }

  /* ---------- таймеры-напоминания ---------- */
  const pend = () => { db.bjePending = Array.isArray(db.bjePending) ? db.bjePending : []; return db.bjePending; };
  function schedule() {
    const L = window.DMBje.last; if (!L || Date.now() - L.at > 3 * 3600e3) return 0;
    let base = Date.now();
    try { /* отсчёт от времени введённого болюса, если оно указано и не в будущем */
      const d = $('actualInsDate') && $('actualInsDate').value, t = $('actualInsTime') && $('actualInsTime').value;
      if (d && t) { const ms = new Date(d + 'T' + t + ':00').getTime(); if (isFinite(ms) && ms <= Date.now() && Date.now() - ms < 3 * 3600e3) base = ms; }
    } catch (e) { }
    let n = 0;
    L.parts.forEach((p, i) => {
      pend().push({ id: 'bp' + Date.now() + i, units: p.units, dueAt: base + p.min * 60000, part: i + 1, parts: L.parts.length, meal: L.meal, notified: false });
      n++;
    });
    window.DMBje.last = null; persist(); return n;
  }

  function notify(p) {
    const title = 'Добавочный по БЖЕ', body = fmtU(p.units) + ' ЕД · по схеме врача';
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { }
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, tag: p.id, requireInteraction: true })).catch(() => { try { new Notification(title, { body }); } catch (e) { } });
      else new Notification(title, { body });
    } catch (e) { }
  }

  function tick() {
    const L = pend(); let ch = false;
    L.forEach(p => { if (!p.notified && Date.now() >= p.dueAt) { p.notified = true; ch = true; notify(p); } });
    const keep = L.filter(p => Date.now() - p.dueAt < 6 * 3600e3);
    if (keep.length !== L.length) { db.bjePending = keep; ch = true; }
    if (ch) persist();
    paintBanner();
  }

  function paintBanner() {
    const dash = $('dashboard'); if (!dash) return;
    let box = $('bjeSoon'); const L = pend().slice().sort((a, b) => a.dueAt - b.dueAt);
    if (!L.length) { if (box) box.remove(); return; }
    if (!box) {
      const grid = dash.querySelector('.grid'); if (!grid) return;
      box = document.createElement('div'); box.id = 'bjeSoon'; box.className = 'card s12';
      grid.insertBefore(box, grid.firstElementChild);
    }
    const now = Date.now();
    const askPerm = ('Notification' in window) && Notification.permission === 'default'
      ? `<div style="margin-top:8px"><button class="btn secondary small" onclick="DMBje.perm()">🔔 Разрешить уведомления</button> <span class="muted">приходят, пока приложение открыто; иначе — этот блок на главной</span></div>` : '';
    box.innerHTML = '<h3 style="margin:0 0 8px">Добавочный по БЖЕ</h3>' + L.map(p => {
      const left = Math.round((p.dueAt - now) / 60000), late = left <= 0;
      const part = p.parts > 1 ? ` <span class="muted">(${p.part}/${p.parts})</span>` : '';
      const when = late ? `<span class="bjeLate">пора, с <b>${hm(p.dueAt)}</b></span>` : `<span>через</span> <b>${left}</b> <span>мин, в</span> <b>${hm(p.dueAt)}</b>`;
      return `<div class="bjeRow${late ? ' late' : ''}"><div><b>${fmtU(p.units)}</b> <span>ЕД</span>${part}<br><small>${when}</small></div>
<div class="remBtns"><button class="btn small" onclick="DMBje.use('${p.id}')">Записать</button><button class="btn secondary small" onclick="DMBje.snooze('${p.id}')">+10 мин</button><button class="btn secondary small" onclick="DMBje.skip('${p.id}')">Пропустить</button></div></div>`;
    }).join('') + askPerm + '<div class="muted" style="margin-top:6px">По схеме врача. Приложение не проверяет дозу.</div>';
  }

  const find = id => pend().find(p => p.id === id);
  const A = {
    last: null,
    perm() { try { Notification.requestPermission().then(paintBanner); } catch (e) { } },
    skip(id) { db.bjePending = pend().filter(p => p.id !== id); persist(); paintBanner(); },
    snooze(id) { const p = find(id); if (!p) return; p.dueAt = Date.now() + 10 * 60000; p.notified = false; persist(); paintBanner(); },
    use(id) {
      const p = find(id); if (!p) return;
      try { show('insulin'); } catch (e) { }
      setTimeout(() => {
        try { if (window.DMJump) DMJump.go('insulin:Болюс'); } catch (e) { }
        const u = $('actualInsUnits'), n = $('actualInsNote');
        if (u) u.value = String(p.units).replace(',', '.');
        if (n && !n.value) n.value = 'Добавочный по БЖЕ' + (p.parts > 1 ? ' (' + p.part + '/' + p.parts + ')' : '');
        A.skip(id);
      }, 80);
    },
    paintCalc, plan, active, render: paintProfile
  };
  window.DMBje = A;

  /* ---------- карточка в «Моём профиле» ---------- */
  function paintProfile() {
    const sec = $('profile'); if (!sec) return;
    let box = $('bjeBox');
    if (!box) { box = document.createElement('div'); box.id = 'bjeBox'; box.className = 'card s12'; }
    if (box.parentNode !== sec) sec.appendChild(box);
    const c = cfg(), on = !!c.on;
    const v = k => esc(c[k] == null ? '' : c[k]);
    box.innerHTML = `<h3 style="margin:0 0 6px">Добавочный инсулин на БЖЕ</h3>
<div class="notice">Для жирной и белковой еды. <b>Включайте только если врач назначил такую схему.</b> Приложение само ничего не подбирает: все числа вводите так, как назначил врач. Выключено по умолчанию.</div>
<label class="bjeSw"><input type="checkbox" id="bjeOn" ${on ? 'checked' : ''} onchange="DMBje.save()"> <span>Учитывать БЖЕ</span></label>
<div class="bjeFields${on ? '' : ' off'}">
<div><label>ЕД инсулина на 1 БЖЕ</label><input class="input" id="bjePer" type="text" inputmode="decimal" value="${v('per')}" placeholder="по назначению врача"></div>
<div><label>Вводить через, мин после основной дозы</label><input class="input" id="bjeDelay" type="text" inputmode="numeric" value="${v('delay')}" placeholder="по назначению врача"></div>
<div><label>Делить дозу на частей</label><select class="select" id="bjeParts" onchange="DMBje.save()">${[1, 2, 3, 4].map(n => `<option value="${n}" ${(+c.parts || 1) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
<div id="bjeGapWrap" style="${(+c.parts || 1) > 1 ? '' : 'display:none'}"><label>Между частями, мин</label><input class="input" id="bjeGap" type="text" inputmode="numeric" value="${v('gap')}" placeholder="по назначению врача"></div>
</div>
<div class="row" style="margin-top:10px"><button class="btn" onclick="DMBje.save(true)">Сохранить</button><span class="muted" id="bjeState"></span></div>`;
  }
  A.save = function (explicit) {
    db.profile = db.profile || {};
    const g = id => ($(id) ? $(id).value : '');
    const prev = db.profile.bje || {};
    db.profile.bje = { on: $('bjeOn') ? $('bjeOn').checked : !!prev.on, per: g('bjePer').trim(), delay: g('bjeDelay').trim(), parts: g('bjeParts') || 1, gap: g('bjeGap').trim() };
    persist();
    const st = $('bjeState'); const gw = $('bjeGapWrap'); if (gw) gw.style.display = (+db.profile.bje.parts || 1) > 1 ? '' : 'none';
    const f = document.querySelector('#bjeBox .bjeFields'); if (f) f.classList.toggle('off', !db.profile.bje.on);
    if (st) st.textContent = db.profile.bje.on ? (active() ? 'Сохранено' : 'Включено, но не все числа заполнены — расчёта не будет') : 'Выключено';
  };

  /* ---------- подключение к существующим функциям ---------- */
  function wrap() {
    if (typeof window.calcInsulin === 'function' && !window.calcInsulin._bje) {
      const o = window.calcInsulin;
      window.calcInsulin = function () { const r = o.apply(this, arguments); try { paintCalc(); } catch (e) { } return r; };
      window.calcInsulin._bje = true;
    }
    if (typeof window.saveActualInsulin === 'function' && !window.saveActualInsulin._bje) {
      const o = window.saveActualInsulin;
      window.saveActualInsulin = function () {
        const before = ((db.medical || {}).actualInsulinLog || []).length;
        const type = ($('actualInsType') && $('actualInsType').value) || '';
        const r = o.apply(this, arguments);
        try {
          const after = ((db.medical || {}).actualInsulinLog || []).length;
          if (after > before && /болюс/i.test(type) && active()) { if (schedule()) { paintBanner(); } }
        } catch (e) { }
        return r;
      };
      window.saveActualInsulin._bje = true;
    }
    const os = window.show;
    if (typeof os === 'function' && !os._bje) {
      window.show = function (id) { const r = os.apply(this, arguments); if (id === 'profile') setTimeout(paintProfile, 70); if (id === 'dashboard') setTimeout(paintBanner, 80); return r; };
      window.show._bje = true;
    }
  }
  const init = () => { wrap(); try { paintBanner(); } catch (e) { } setInterval(tick, 20000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
