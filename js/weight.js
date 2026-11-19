/* v64.84: «Динамика веса» — дата и вес, график и таблица (раздел «Мой профиль»).
   Привязки: последний вес обновляет «Мой профиль» (и ИМТ); при сохранении профиля с новым весом точка добавляется сама;
   суточная доза инсулина на кг (справочно, по журналу введений); вес рядом с HbA1c и С-пептидом в «Динамике анализов»;
   строка «Вес» в отчёте врачу. Ничего не рассчитывает для подбора дозы — только арифметика по записанным данным. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => { const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : d; };
  const k1 = v => String(+(+v).toFixed(1)).replace('.', ',');
  const persist = () => { try { save(); } catch (e) {} };
  const todayIso = () => { try { return today(); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function list() {
    const byDate = {}; /* одна запись на дату: при слиянии с другим устройством последняя побеждает */
    ((typeof db !== 'undefined' && db.weights) || []).forEach(w => { if (w.date) byDate[w.date] = w; });
    return Object.values(byDate).filter(w => isFinite(+w.kg) && +w.kg > 0)
      .map(w => ({ id: w.id, date: w.date, kg: +w.kg, note: w.note || '' })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const latest = () => { const l = list(); return l[l.length - 1] || null; };
  /* вес на дату: ближайшая запись не позже даты, но не старше maxGap дней (иначе — ближайшая после, в пределах maxGap) */
  function at(date, maxGap) {
    const l = list(); if (!l.length || !date) return null; maxGap = maxGap == null ? 45 : maxGap;
    let best = null;
    l.forEach(w => { const d = Math.abs(days(w.date, date)); if (d <= maxGap && (!best || d < best.d)) best = { w, d }; });
    return best ? best.w : null;
  }

  /* добавление; если запись самая свежая — обновляем профиль */
  function put(date, kg, note) {
    db.weights = db.weights || [];
    const exs = db.weights.filter(w => w.date === date), ex = exs[0];
    if (ex) { exs.forEach(e => { e.kg = kg; if (note) e.note = note; }); } else db.weights.push({ id: 'w' + Date.now() + Math.floor(Math.random() * 1000), date, kg, note: note || '' });
    syncProfile();
  }
  function syncProfile() {
    const l = latest(); if (!l) return;
    db.profile = db.profile || {};
    db.profile.weight = l.kg;
    const inp = document.getElementById('pWeight');
    if (inp) { inp.value = l.kg; try { updateBMI(); } catch (e) {} }
  }
  function add() {
    const d = document.getElementById('wtDate'), v = document.getElementById('wtKg'), n = document.getElementById('wtNote');
    const kg = parseFloat(String(v.value).replace(',', '.'));
    if (!d.value || !isFinite(kg)) return alert('Укажите дату и вес');
    if (kg < 5 || kg > 250) return alert('Проверьте вес: допустимо от 5 до 250 кг');
    put(d.value, kg, (n.value || '').trim());
    persist(); v.value = ''; n.value = ''; render();
  }
  function del(id) {
    if (!confirm('Удалить запись о весе?')) return;
    const dd = (db.weights || []).find(w => w.id === id); db.weights = (db.weights || []).filter(w => w.id !== id && !(dd && w.date === dd.date));
    const l = latest(); if (l) syncProfile();
    persist(); render();
  }

  /* суточная доза инсулина по журналу введений: среднее за последние дни с записями (до 7) */
  function dose() {
    const log = (db.medical && db.medical.actualInsulinLog) || [], by = {};
    log.forEach(x => { if (x.date && isFinite(+x.units)) by[x.date] = (by[x.date] || 0) + (+x.units); });
    const t = todayIso(), ds = Object.keys(by).filter(d => d <= t && days(d, t) < 14).sort().slice(-7);
    if (!ds.length) return null;
    const tdd = ds.reduce((s, d) => s + by[d], 0) / ds.length, w = at(ds[ds.length - 1], 90) || latest();
    return { tdd, n: ds.length, kg: w ? w.kg : null };
  }

  function chart(r) {
    if (r.length < 2) return '';
    const W = 320, H = 150, pl = 34, pr = 14, pt = 18, pb = 26;
    const t = x => new Date(x.date).getTime(), t0 = t(r[0]), t1 = t(r[r.length - 1]) || t0 + 1;
    let lo = Math.min(...r.map(x => x.kg)), hi = Math.max(...r.map(x => x.kg)); const pad = (hi - lo) * 0.25 || 1; lo -= pad; hi += pad;
    const X = x => pl + (t1 === t0 ? (W - pl - pr) / 2 : (t(x) - t0) / (t1 - t0) * (W - pl - pr)), Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    const grid = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * f, y = Y(v); return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".12"/><text x="${pl - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${k1(v)}</text>`; }).join('');
    const pts = r.map(x => X(x).toFixed(1) + ',' + Y(x.kg).toFixed(1)).join(' ');
    const dots = r.map((x, i) => `<circle cx="${X(x).toFixed(1)}" cy="${Y(x.kg).toFixed(1)}" r="4" fill="#6366f1" stroke="#fff" stroke-width="1.5"/>${r.length <= 8 || i === 0 || i === r.length - 1 ? `<text x="${X(x).toFixed(1)}" y="${(Y(x.kg) - 8).toFixed(1)}" font-size="10" font-weight="700" text-anchor="${i === 0 ? 'start' : i === r.length - 1 ? 'end' : 'middle'}" fill="currentColor">${k1(x.kg)}</text>` : ''}`).join('');
    const xl = `<text x="${pl}" y="${H - 8}" font-size="9" fill="currentColor" opacity=".6">${fmt(r[0].date)}</text><text x="${W - pr}" y="${H - 8}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${fmt(r[r.length - 1].date)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса" style="width:100%;height:auto;max-width:560px;display:block;margin:8px 0">${grid}<polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="2.2" stroke-linejoin="round"/>${dots}${xl}</svg>`;
  }

  function render() {
    const sec = document.getElementById('profile'); if (!sec) return;
    let box = document.getElementById('weightTrend');
    if (!box) { box = document.createElement('div'); box.id = 'weightTrend'; box.className = 'card'; box.style.marginTop = '14px'; }
    if (box.parentNode !== sec) sec.appendChild(box);
    const r = list(), desc = r.slice().reverse();
    let body = '<p class="muted">Пока нет записей. Добавьте вес с датой — появятся график и изменение.</p>';
    if (r.length) {
      const L = r[r.length - 1], first = r[0];
      const rowsHtml = desc.map((x, i) => {
        const p = desc[i + 1]; let d = '';
        if (p) { const dv = x.kg - p.kg, s0 = +dv.toFixed(1); d = s0 === 0 ? '0' : s0 > 0 ? '▲ +' + k1(dv) : '▼ ' + k1(-dv); }
        return `<tr><td>${fmt(x.date)}${x.note ? `<br><small class="muted">${esc(x.note.length > 26 ? x.note.slice(0, 25) + '…' : x.note)}</small>` : ''}</td><td><b>${k1(x.kg)}</b> кг</td><td>${d}</td><td><button class="btn secondary small" aria-label="Удалить" onclick="DMWeight.del('${esc(x.id)}')">✕</button></td></tr>`;
      }).join('');
      let sum = `<div class="kpi"><div class="mini"><span class="muted">Сейчас</span><b>${k1(L.kg)} кг</b><small class="muted"> ${fmt(L.date)}</small></div>`;
      if (r.length > 1) { const dv = L.kg - first.kg, dd = days(first.date, L.date); sum += `<div class="mini"><span class="muted">С ${fmt(first.date)}</span><b>${dv > 0 ? '+' : dv < 0 ? '−' : ''}${k1(Math.abs(dv))} кг</b><small class="muted"> за ${dd} дн.</small></div>`; }
      sum += '</div>';
      const ds = dose();
      let doseHtml = '';
      if (ds) doseHtml = '<div class="notice" style="margin-top:8px">Инсулин по журналу введений: в среднем ' + k1(ds.tdd) + ' ЕД/сут (за ' + ds.n + ' дн. с записями)' + (ds.kg ? ', это ' + (Math.round(ds.tdd / ds.kg * 100) / 100 + '').replace('.', ',') + ' ЕД на кг при весе ' + k1(ds.kg) + ' кг' : '') + '. Справочно, для разговора с врачом; дозу не подбирает.</div>';
      body = sum + chart(r) + doseHtml + `<div class="tablewrap"><table class="table" style="width:100%"><tr><th align="left">Дата</th><th align="left">Вес</th><th align="left">Изменение</th><th></th></tr>${rowsHtml}</table></div><div class="row" style="margin-top:8px"><button class="btn secondary small" onclick="DMWeight.copy()">Скопировать для врача</button></div>`;
    }
    box.innerHTML = `<h3>Динамика веса</h3><p class="muted">Вес с датами. Последний вес сам попадает в профиль и в расчёт ИМТ, а также в отчёт врачу и в «Динамику анализов» рядом с HbA1c и С-пептидом.</p>
      <div class="formgrid" style="margin:8px 0"><div><label>Дата</label><input id="wtDate" type="date" class="input" value="${todayIso()}"></div><div><label>Вес, кг</label><input id="wtKg" type="text" inputmode="decimal" autocomplete="off" class="input" placeholder="например, 41,3"></div><div style="grid-column:1/-1"><label>Комментарий</label><input id="wtNote" class="input" placeholder="у врача, дома, натощак и т. п."></div></div>
      <button class="btn" onclick="DMWeight.add()">Добавить</button><div style="margin-top:12px">${body}</div>`;
  }

  function copy() {
    const r = list().reverse(); if (!r.length) return;
    const txt = 'Вес (кг):\n' + r.map((x, i) => fmt(x.date) + ' — ' + k1(x.kg) + '').join('\n');
    const ok = () => alert('Скопировано. Можно вставить в сообщение врачу.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => prompt('Скопируйте текст:', txt)); else prompt('Скопируйте текст:', txt);
  }

  /* строка для отчёта врачу: «40,1 кг (на 13.11.2026; с 26.06.2026: +0,5 кг)» */
  function note() {
    const r = list(); if (r.length < 2) return '';
    const L = r[r.length - 1], F = r[0], dv = L.kg - F.kg;
    if (days(F.date, L.date) < 14) return ' <span class="muted">(на ' + fmt(L.date) + ')</span>'; /* за пару дней сравнивать нечего */
    if (Math.abs(dv) < 0.05) return ' <span class="muted">(на ' + fmt(L.date) + '; с ' + fmt(F.date) + ': без изменений)</span>';
    return ' <span class="muted">(на ' + fmt(L.date) + '; с ' + fmt(F.date) + ': ' + (dv > 0 ? '+' : '−') + k1(Math.abs(dv)) + ' кг)</span>';
  }

  /* при сохранении профиля с новым весом — точка на сегодня */
  function afterProfile() {
    const w = +((db.profile || {}).weight); if (!(w > 0)) return;
    const l = latest(); if (l && l.kg === w) return;
    put(todayIso(), w, 'из профиля'); persist(); render();
  }
  /* разовый перенос: вес из профиля, если журнала ещё нет */
  function seed() {
    if (typeof db === 'undefined' || (db.weights && db.weights.length)) return;
    const w = +((db.profile || {}).weight); if (w > 0) { db.weights = [{ id: 'wseed' + todayIso(), date: todayIso(), kg: w, note: 'из профиля' }]; persist(); }
  }

  window.DMWeight = { add, del, copy, render, at, latest, list, note, dose };
  const os = window.show;
  if (typeof os === 'function') window.show = function (id) { const r = os.apply(this, arguments); if (id === 'profile') setTimeout(render, 60); return r; };
  const init = () => {
    seed();
    const f = window.saveProfile;
    if (typeof f === 'function' && !f.__wt) { const w = function () { const r = f.apply(this, arguments); try { afterProfile(); } catch (e) {} return r; }; w.__wt = true; window.saveProfile = w; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300)); else setTimeout(init, 300);
})();
