/* v64.18: «Заметка к дню» и срок работы сенсора.
   Заметки: db.dayNotes[ГГГГ-ММ-ДД] = {text, tags:[...], at}. Синхронизируются с семьёй (тип записи dayNote).
   Сенсор: db.medical.cgm.installed (дата установки) и db.medical.cgm.days (срок, дней). */
(function () {
  const TAGS = ['Болел', 'Спорт', 'Соревнования', 'Праздник, гости', 'Стресс, экзамен', 'Поездка', 'Новый сенсор', 'Гипо'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = () => (document.getElementById('day') && document.getElementById('day').value) || (window.today ? today() : new Date().toISOString().slice(0, 10));
  const notes = () => (db.dayNotes = db.dayNotes || {});
  const ru = d => d ? d.split('-').reverse().join('.') : '';

  /* Срок сенсора по модели: если пользователь не задал свой */
  const SENSOR_DAYS = [[/libre 3 plus|libre 2 plus|linx|aidex|ican|sibionics|gs3/i, 15], [/libre/i, 14], [/g7|stelo/i, 10], [/g6|one/i, 10], [/simplera|guardian/i, 7], [/eversense 365/i, 365], [/eversense/i, 180]];
  function sensorDays() {
    const c = (db.medical && db.medical.cgm) || {};
    if (+c.days) return +c.days;
    const s = [c.product, c.model].join(' ');
    for (const [re, d] of SENSOR_DAYS) if (re.test(s)) return d;
    return 14;
  }
  function sensorLeft() {
    const c = (db.medical && db.medical.cgm) || {};
    if (!c.installed) return null;
    const start = new Date(c.installed + 'T12:00:00'), end = new Date(start);
    end.setDate(end.getDate() + sensorDays());
    const now = new Date(); now.setHours(12, 0, 0, 0);
    return { left: Math.round((end - now) / 864e5), end: end.toISOString().slice(0, 10), days: sensorDays() };
  }

  function save(d, patch) {
    const n = notes(), cur = n[d] || { text: '', tags: [] }, nx = Object.assign({}, cur, patch, { at: new Date().toISOString() });
    if (!nx.text && !(nx.tags || []).length) delete n[d]; else n[d] = nx;
    try { window.save && window.save() } catch (e) {}
  }

  function render() {
    const box = document.getElementById('dayNoteCard'); if (!box) return;
    const d = day(), n = notes()[d] || { text: '', tags: [] }, S = sensorLeft();
    let sensor = '';
    if (S) {
      const cls = S.left <= 0 ? 'bad' : S.left <= 1 ? 'warn' : '';
      const txt = S.left < 0 ? `срок вышел ${ru(S.end)}` : S.left === 0 ? 'заменить сегодня' : S.left === 1 ? 'заменить завтра' : `осталось ${S.left} дн. (до ${ru(S.end)})`;
      sensor = `<div class="sensorLeft ${cls}">Сенсор: ${txt}</div>`;
    }
    box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Заметка к дню</h3>${sensor}</div>
<div class="dnTags">${TAGS.map(t => `<button type="button" class="dnTag${(n.tags || []).includes(t) ? ' on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
<textarea id="dayNoteText" class="textarea" rows="2" placeholder="Что было особенного: болел, гости, тренировка, поздно поел…">${esc(n.text || '')}</textarea>
<div class="muted dnHint">Заметку видят все в семье, она попадает в «Анализ дня» и отчёт врачу.</div>`;
    box.querySelectorAll('.dnTag').forEach(b => b.onclick = () => {
      const cur = (notes()[d] || {}).tags || [], t = b.dataset.t, on = !cur.includes(t);
      save(d, { tags: on ? cur.concat(t) : cur.filter(x => x !== t) });
      if (t === 'Новый сенсор' && on) setSensorInstalled(d);
      render();
    });
    const ta = document.getElementById('dayNoteText');
    let tm; ta.oninput = () => { clearTimeout(tm); tm = setTimeout(() => save(d, { text: ta.value.trim() }), 600); };
    ta.onblur = () => { clearTimeout(tm); save(d, { text: ta.value.trim() }); };
  }

  function setSensorInstalled(d) {
    db.medical = db.medical || {}; db.medical.cgm = db.medical.cgm || {};
    if (db.medical.cgm.installed !== d) {
      db.medical.cgm.installed = d;
      try { window.save && window.save() } catch (e) {}
      const el = document.getElementById('cgmInstalled'); if (el) el.value = d;
    }
  }

  /* для отчёта врачу и анализа дня */
  window.DMDayNote = {
    render, sensorLeft, sensorDays,
    get: d => notes()[d] || null,
    html(d) { const n = notes()[d]; if (!n) return ''; return `<div class="dnShow">${(n.tags || []).map(t => `<span class="pill">${esc(t)}</span>`).join(' ')}${n.text ? ` <span>${esc(n.text)}</span>` : ''}</div>` },
    list(from, to) { return Object.entries(notes()).filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b)) }
  };

  /* перерисовка при смене дня и на главной */
  const wrap = name => { const f = window[name]; if (typeof f !== 'function') return; window[name] = function () { const r = f.apply(this, arguments); try { render() } catch (e) {} return r } };
  wrap('loadDay'); wrap('syncDay');
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') try { render() } catch (e) {} });
  setTimeout(render, 0);
})();
