/* v64.85: «Мнение ИИ» — раздел «Аналитика». Семья хранит здесь датированные заключения ИИ по анализам
   (db.aiOpinions: {id, date, text}); новые заключения добавляются по мере появления анализов, старые остаются как история.
   Кнопка «Данные для ИИ» собирает анализы, вес и дозу в текст с просьбой дать заключение — его можно вставить в любой ИИ-помощник.
   Это справочное мнение, не диагноз и не назначение: дозы и лечение определяет врач. В приложении нет готовых заключений —
   всё хранится только на телефоне семьи. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => { const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : d; };
  const persist = () => { try { save(); } catch (e) {} };
  const todayIso = () => { try { return today(); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const list = () => ((typeof db !== 'undefined' && db.aiOpinions) || []).filter(o => o && o.text).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)));

  /* лёгкая разметка: #, ##, ### — заголовки; "- " — список; **жирный**; пустая строка — абзац */
  function md(t) {
    const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const out = []; let ul = false;
    const close = () => { if (ul) { out.push('</ul>'); ul = false; } };
    String(t).split(/\r?\n/).forEach(line => {
      const l = line.trim(); let m;
      if (!l) { close(); return; }
      if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h4 style="margin:14px 0 4px">${inl(m[2])}</h4>`); return; }
      if ((m = l.match(/^[-•*]\s+(.*)$/))) { if (!ul) { out.push('<ul style="margin:4px 0 4px 18px;padding:0">'); ul = true; } out.push(`<li style="margin:3px 0">${inl(m[1])}</li>`); return; }
      close(); out.push(`<p style="margin:6px 0">${inl(l)}</p>`);
    });
    close(); return out.join('');
  }

  function card(o, open) {
    const body = md(o.text);
    return `<details class="card" style="margin-bottom:12px" ${open ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">Мнение ИИ от ${fmt(o.date)}</summary>
      <div class="aiOpBody noTr" style="margin-top:8px">${body}</div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn secondary small" onclick="DMAiOp.copy('${esc(o.id)}')">Скопировать</button><button class="btn secondary small" onclick="DMAiOp.del('${esc(o.id)}')">Удалить</button></div></details>`;
  }

  function render() {
    const sec = document.getElementById('aiopinion'); if (!sec) return;
    let box = document.getElementById('aiOpBox');
    if (!box) { box = document.createElement('div'); box.id = 'aiOpBox'; sec.appendChild(box); }
    const L = list();
    const head = `<div class="notice">Это мнение искусственного интеллекта по вашим анализам — справочное. Оно не заменяет врача, не ставит диагноз и не назначает дозы или лечение. Обсуждайте выводы и вопросы со своим эндокринологом.</div>`;
    const cards = L.length ? L.map((o, i) => card(o, i === 0)).join('') : '<div class="card" style="margin-top:12px"><p class="muted">Заключений пока нет. Нажмите «Данные для ИИ», вставьте их в ИИ-помощник, а полученное заключение добавьте ниже — оно сохранится с датой.</p></div>';
    const make = `<div class="card" style="margin-top:12px"><h3>Новое заключение</h3>
      <p class="muted">Когда появятся новые анализы, соберите данные и попросите ИИ обновить заключение. Старые заключения останутся в истории.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn small" onclick="DMAiOp.prep()">Скопировать данные для ИИ</button></div>
      <div id="aiOpPrepMsg" class="muted" style="margin-top:6px"></div>
      <details id="aiOpAdd" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Добавить заключение</summary>
      <div class="formgrid" style="margin-top:8px"><div><label>Дата заключения</label><input id="aiOpDate" type="date" class="input" value="${todayIso()}"></div>
      <div><label>Из файла (.txt, .md)</label><input id="aiOpFile" type="file" accept=".txt,.md,text/plain,text/markdown" class="input" onchange="DMAiOp.file(this)"></div>
      <div style="grid-column:1/-1"><label>Текст заключения</label><textarea id="aiOpText" class="input" rows="8" placeholder="Вставьте текст заключения. Заголовки — «## Заголовок», списки — «- пункт»."></textarea></div></div>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="DMAiOp.add()">Сохранить заключение</button></div></details></div>`;
    box.innerHTML = head + cards + make;
  }

  function add() {
    const d = document.getElementById('aiOpDate').value, t = document.getElementById('aiOpText').value.trim();
    if (!d || !t) return alert('Укажите дату и вставьте текст заключения');
    db.aiOpinions = db.aiOpinions || [];
    db.aiOpinions.push({ id: 'ai' + Date.now(), date: d, text: t });
    persist(); render();
  }
  function del(id) {
    if (!confirm('Удалить это заключение?')) return;
    db.aiOpinions = (db.aiOpinions || []).filter(o => o.id !== id); persist(); render();
  }
  function file(inp) {
    const f = inp.files && inp.files[0]; if (!f) return;
    if (f.size > 200000) return alert('Файл слишком большой для заключения');
    const r = new FileReader(); r.onload = () => { document.getElementById('aiOpText').value = String(r.result || ''); }; r.readAsText(f, 'utf-8');
  }
  function toClip(txt, okMsg) {
    const ok = () => { const m = document.getElementById('aiOpPrepMsg'); if (m) m.textContent = okMsg; else alert(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => prompt('Скопируйте текст:', txt)); else prompt('Скопируйте текст:', txt);
  }
  function copy(id) { const o = list().find(x => x.id === id); if (o) toClip('Мнение ИИ от ' + fmt(o.date) + '\n\n' + o.text, 'Скопировано'); }

  /* сводка по сенсору за 90 дней: общая, по 30-дневным блокам и ночь (00–06) */
  async function sensor() {
    if (!(window.DMCgm && DMCgm.ready && DMCgm.ready() && window.DMTrends)) return [];
    const ld = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const end = new Date(), start = new Date(Date.now() - 90 * 864e5);
    const r = await DMCgm.period(ld(start), ld(end)); const raw = (r && r.raw) || []; if (raw.length < 100) return [];
    const f = (v, d) => (+v).toFixed(d == null ? 1 : d).replace('.', ',');
    const line = (name, T) => T ? '- ' + name + ': средняя ' + f(T.mean) + ' ммоль/л, GMI ' + f(T.gmi) + '%, CV ' + f(T.cv, 0) + '%, в диапазоне 3,9–10: ' + f(T.zones.inr, 0) + '%, ниже 3,9: ' + f(T.zones.low + T.zones.vlow) + '% (ниже 3,0: ' + f(T.zones.vlow) + '%), выше 10: ' + f(T.zones.high + T.zones.vhigh) + '%, работа сенсора ' + f(T.cover, 0) + '%' : '';
    const out = ['Сенсор (CGM) за последние 90 дней (' + fmt(ld(start)) + ' — ' + fmt(ld(end)) + '):'];
    const all = DMTrends.compute(raw, 90); out.push(line('весь период', all));
    for (let i = 0; i < 3; i++) {
      const a = Date.now() - (i + 1) * 30 * 864e5, b = Date.now() - i * 30 * 864e5;
      const T = DMTrends.compute(raw.filter(x => x.t >= a && x.t < b), 30); if (T) out.push(line(i === 0 ? 'последние 30 дней' : i === 1 ? '30–60 дней назад' : '60–90 дней назад', T));
    }
    const night = raw.filter(x => new Date(x.t).getHours() < 6), Tn = DMTrends.compute(night, 90 / 4);
    if (Tn) out.push(line('ночь 00:00–06:00 (за 90 дней)', Tn));
    const morn = raw.filter(x => { const h = new Date(x.t).getHours(); return h >= 6 && h < 8; }), Tm = DMTrends.compute(morn, 90 / 12);
    if (Tm) out.push(line('утро 06:00–08:00 (за 90 дней)', Tm));
    return out.filter(Boolean);
  }

  /* данные для ИИ: без имени и дат рождения — только возраст, пол, показатели */
  async function prep() {
    const p = (typeof db !== 'undefined' && db.profile) || {}, L = [];
    let age = '';
    if (p.dob) { const b = new Date(p.dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; if (a >= 0 && a < 120) age = a + ' лет'; }
    L.push('Прошу дать развёрнутое экспертное заключение по анализам ребёнка с диабетом 1 типа: разберите каждый показатель в динамике, что можно сказать по ним вместе, что стоит уточнить или повторить, и какие вопросы задать эндокринологу. Не назначайте дозы инсулина и лечение, пишите как справочное мнение. Если данных не хватает для вывода — скажите прямо. Формат: заголовки «## …», списки «- …», без таблиц.');
    L.push('');
    L.push('Пациент: ' + [age, p.sex && p.sex !== 'Не указан' ? p.sex : '', p.type && p.type !== 'Не указан' ? p.type : ''].filter(Boolean).join(', ') + (p.height ? ', рост ' + p.height + ' см' : '') + (p.weight ? ', вес ' + p.weight + ' кг' : ''));
    const labs = ((db.labs) || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const by = {}; labs.forEach(l => { const k = l.name || l.type || 'Показатель'; (by[k] = by[k] || []).push(l); });
    L.push(''); L.push('Анализы (дата — значение единицы, комментарий):');
    const keys = Object.keys(by);
    if (!keys.length) L.push('- данных нет');
    keys.forEach(k => { L.push('- ' + k + ': ' + by[k].map(l => fmt(l.date) + ' — ' + l.value + ' ' + (l.unit || '') + (l.note ? ' (' + String(l.note).replace(/^из документа:\s*/, '') + ')' : '')).join('; ')); });
    if (window.DMLabTrend) {
      const cp = DMLabTrend.rows('cpep'); if (cp.some(x => x.changed)) L.push('С-пептид в одной единице (пмоль/л): ' + cp.map(x => fmt(x.date) + ' — ' + Math.round(x.v)).join('; '));
    }
    if (window.DMWeight && DMWeight.list().length) { L.push(''); L.push('Вес, кг: ' + DMWeight.list().map(w => fmt(w.date) + ' — ' + w.kg).join('; ')); const ds = DMWeight.dose && DMWeight.dose(); if (ds) L.push('Инсулин по журналу введений: в среднем ' + ds.tdd.toFixed(1) + ' ЕД/сут' + (ds.kg ? ' (' + (ds.tdd / ds.kg).toFixed(2) + ' ЕД/кг)' : '') + ' за ' + ds.n + ' дн. с записями'); }
    try { const sx = await sensor(); if (sx.length) { L.push(''); sx.forEach(x => L.push(x)); } } catch (e) {}
    const m = db.medical || {}; const med = [m.regimen && m.regimen !== 'Не указано' ? 'режим: ' + m.regimen : '', m.cgm && m.cgm.product ? 'сенсор: ' + m.cgm.product : ''].filter(Boolean);
    if (med.length) { L.push(''); L.push('Лечение: ' + med.join('; ')); }
    L.push(''); L.push('Если у вас есть прежнее заключение, учтите его и отметьте, что изменилось.');
    toClip(L.join('\n'), 'Скопировано. Вставьте текст в ИИ-помощник и дополните выписками, если нужно. Имя и дата рождения не копируются.');
  }

  window.DMAiOp = { render, add, del, copy, file, prep, list };
  const os = window.show;
  if (typeof os === 'function') window.show = function (id) { const r = os.apply(this, arguments); if (id === 'aiopinion') setTimeout(render, 30); return r; };
})();
