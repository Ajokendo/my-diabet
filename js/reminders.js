/* v64.80: напоминания без сервера — хранятся на телефоне, экспорт в календарь (.ics), карточка «Скоро нужно» на главной.
   Только напоминают: никаких доз и расчётов. Сроки задаёт семья вместе с врачом. */
(function () {
  'use strict';
  const TEMPLATES = [
    { title: 'Измерить сахар', kind: 'daily', times: ['08:00', '13:00', '19:00', '22:00'] },
    { title: 'Инсулин по схеме врача', kind: 'daily', times: ['08:00', '20:00'] },
    { title: 'Сменить место укола', kind: 'daily', times: ['21:00'] },
    { title: 'Анализ HbA1c (гликированный гемоглобин)', kind: 'every', n: 3, unit: 'month', auto: 'hba1c' },
    { title: 'Приём у эндокринолога', kind: 'every', n: 3, unit: 'month' },
    { title: 'Пересмотреть коэффициенты с врачом', kind: 'every', n: 3, unit: 'month' },
    { title: 'Осмотр глазного дна', kind: 'every', n: 1, unit: 'year' },
    { title: 'Анализ мочи и биохимия крови', kind: 'every', n: 1, unit: 'year' },
    { title: 'Сменить сенсор', kind: 'every', n: 2, unit: 'week' },
    { title: 'Проверить запасы: инсулин, иглы, тест-полоски, глюкагон', kind: 'every', n: 1, unit: 'month' },
    { title: 'Срок годности открытого инсулина (28 дней)', kind: 'every', n: 4, unit: 'week' }
  ];
  const UNITS = { day: 'дн.', week: 'нед.', month: 'мес.', year: 'г.' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayS = () => iso(new Date());
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function addPeriod(s, n, unit) {
    const d = parse(s);
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() + 7 * n);
    else if (unit === 'month') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    else d.setFullYear(d.getFullYear() + n);
    return iso(d);
  }
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const list = () => { if (typeof db === 'undefined') return []; db.reminders = db.reminders || []; return db.reminders; };
  const persist = () => { try { save(); } catch (e) {} };

  function lastHba1c() {
    let best = '';
    ((typeof db !== 'undefined' && db.labs) || []).forEach(l => { if (l.type === 'hba1c' && l.date && l.date > best) best = l.date; });
    return best;
  }
  function lastDone(r) {
    let l = r.last || '';
    if (r.auto === 'hba1c') { const h = lastHba1c(); if (h > l) l = h; }
    return l;
  }
  function dueDate(r) {
    if (r.kind !== 'every') return '';
    const l = lastDone(r);
    return l ? addPeriod(l, r.n || 1, r.unit || 'month') : (r.start || todayS());
  }
  function status(r) {
    const d = dueDate(r); if (!d) return null;
    const left = daysBetween(todayS(), d);
    return { due: d, left };
  }
  const fmt = s => { const [y, m, d] = s.split('-'); return d + '.' + m + '.' + y; };
  function when(left) {
    if (left < 0) return 'просрочено на ' + (-left) + ' дн.';
    if (left === 0) return 'сегодня';
    if (left === 1) return 'завтра';
    return 'через ' + left + ' дн.';
  }

  function add(t) {
    list().push({
      id: 'rem' + Date.now() + Math.floor(Math.random() * 1000),
      title: t.title, kind: t.kind, times: (t.times || []).slice(), n: t.n || 1, unit: t.unit || 'month',
      auto: t.auto || '', last: '', start: todayS(), on: true
    });
    persist();
  }

  /* ---------- раздел ---------- */
  function render() {
    const host = document.getElementById('remBody'); if (!host) return;
    const L = list();
    const rowsEvery = L.filter(r => r.kind === 'every').map(r => ({ r, s: status(r) })).sort((a, b) => a.s.left - b.s.left);
    const rowsDaily = L.filter(r => r.kind === 'daily');
    const card = (r, body) => `<div class="remRow${r.on ? '' : ' off'}"><div class="remMain"><b>${esc(r.title)}</b><div class="muted">${body}</div></div>
      <div class="remBtns">${r.kind === 'every' ? `<button class="btn small" onclick="DMRem.done('${r.id}')">Сделано</button>` : ''}<button class="btn secondary small" onclick="DMRem.edit('${r.id}')">Изменить</button></div></div>`;
    const evHtml = rowsEvery.map(({ r, s }) => card(r, `каждые ${r.n} ${UNITS[r.unit] || ''} · срок ${fmt(s.due)} · <span class="${s.left < 0 ? 'remLate' : ''}">${when(s.left)}</span>` + (r.auto === 'hba1c' ? '<br><small>Срок считается по последнему анализу HbA1c</small>' : ''))).join('');
    const dyHtml = rowsDaily.map(r => card(r, 'каждый день в ' + (r.times.join(', ') || '—') + (r.on ? '' : ' · выключено'))).join('');
    const tpl = TEMPLATES.map((t, i) => `<button class="btn secondary small remTpl" onclick="DMRem.addTpl(${i})">＋ ${esc(t.title)}</button>`).join('');
    host.innerHTML = `
      <div class="card s12"><h3>Мои напоминания</h3>
        <p class="muted">Приложение только напоминает. Сроки и время подскажет врач — проверьте их у эндокринолога. Напоминания хранятся на этом телефоне.</p>
        <div id="remList">${evHtml || ''}${dyHtml || ''}${(evHtml || dyHtml) ? '' : '<p class="muted">Пока пусто. Выберите готовый пункт ниже или добавьте свой.</p>'}</div>
        <div id="remEditor"></div>
      </div>
      <div class="card s12"><h3>Добавить из готовых</h3><div class="remTpls">${tpl}</div>
        <div class="row" style="margin-top:10px"><button class="btn secondary" onclick="DMRem.edit('')">＋ Свой пункт</button></div></div>
      <div class="card s12"><h3>В календарь телефона</h3>
        <p class="muted">Скачайте файл и откройте его — напоминания с повторами появятся в календаре телефона и будут звонить даже когда приложение закрыто. Имя ребёнка и показатели в файл не попадают.</p>
        <div class="row"><button class="btn" onclick="DMRem.ics()">Скачать для календаря (.ics)</button></div>
        <p class="muted" style="margin-top:8px">Если сигнал не звучит, проверьте в календаре настройки уведомлений: некоторые календари подставляют свои.</p></div>`;
  }

  function edit(id) {
    const ed = document.getElementById('remEditor'); if (!ed) return;
    const r = id ? list().find(x => x.id === id) : { title: '', kind: 'daily', times: ['08:00'], n: 1, unit: 'month', on: true, last: '' };
    if (!r) return;
    const isE = r.kind === 'every';
    ed.innerHTML = `<div class="remEdit"><h4>${id ? 'Изменить' : 'Новое напоминание'}</h4>
      <div class="formgrid">
        <div style="grid-column:1/-1"><label>Название</label><input id="remTitle" class="input" value="${esc(r.title)}" placeholder="например: Измерить сахар"></div>
        <div><label>Как часто</label><select id="remKind" class="select" onchange="DMRem.kindChg()"><option value="daily"${isE ? '' : ' selected'}>Каждый день</option><option value="every"${isE ? ' selected' : ''}>Раз в период</option></select></div>
        <div id="remDailyBox"${isE ? ' style="display:none"' : ''}><label>Время (через запятую)</label><input id="remTimes" class="input" value="${esc((r.times || []).join(', '))}" placeholder="08:00, 20:00"></div>
        <div id="remEveryBox"${isE ? '' : ' style="display:none"'}><label>Раз в</label><div class="row"><input id="remN" type="number" min="1" max="60" class="input" value="${r.n || 1}" style="max-width:90px"><select id="remUnit" class="select">${Object.keys(UNITS).map(u => `<option value="${u}"${r.unit === u ? ' selected' : ''}>${{ day: 'дней', week: 'недель', month: 'месяцев', year: 'лет' }[u]}</option>`).join('')}</select></div></div>
        <div><label><input type="checkbox" id="remOn"${r.on ? ' checked' : ''}> Включено</label></div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn" onclick="DMRem.save('${id || ''}')">Сохранить</button><button class="btn secondary" onclick="DMRem.cancel()">Отмена</button>${id ? `<button class="btn secondary" style="color:#b91c1c" onclick="DMRem.del('${id}')">Удалить</button>` : ''}</div></div>`;
    ed.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function kindChg() {
    const e = document.getElementById('remKind').value === 'every';
    document.getElementById('remDailyBox').style.display = e ? 'none' : '';
    document.getElementById('remEveryBox').style.display = e ? '' : 'none';
  }
  function saveItem(id) {
    const title = document.getElementById('remTitle').value.trim();
    if (!title) return alert('Укажите название');
    const kind = document.getElementById('remKind').value;
    let times = [];
    if (kind === 'daily') {
      times = document.getElementById('remTimes').value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).map(s => { const m = s.match(/^(\d{1,2})[:.](\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? pad(+m[1]) + ':' + m[2] : null; });
      if (!times.length || times.includes(null)) return alert('Время укажите так: 08:00, 20:00');
    }
    const n = Math.max(1, Math.min(60, parseInt(document.getElementById('remN').value, 10) || 1));
    const unit = document.getElementById('remUnit').value, on = document.getElementById('remOn').checked;
    let r = id && list().find(x => x.id === id);
    if (!r) { r = { id: 'rem' + Date.now(), last: '', start: todayS(), auto: '' }; list().push(r); }
    Object.assign(r, { title, kind, times, n, unit, on });
    persist(); render(); renderCard();
  }
  function del(id) { if (!confirm('Удалить напоминание?')) return; db.reminders = list().filter(x => x.id !== id); persist(); render(); renderCard(); }
  function done(id) { const r = list().find(x => x.id === id); if (!r) return; r.last = todayS(); persist(); render(); renderCard(); }

  /* ---------- карточка на главной ---------- */
  function renderCard() {
    const dash = document.getElementById('dashboard'); if (!dash) return;
    let box = document.getElementById('remSoon');
    const soon = list().filter(r => r.kind === 'every' && r.on).map(r => ({ r, s: status(r) })).filter(x => x.s.left <= 14).sort((a, b) => a.s.left - b.s.left);
    if (!soon.length) { if (box) box.remove(); return; }
    if (!box) {
      const grid = dash.querySelector('.grid'); if (!grid) return;
      box = document.createElement('div'); box.id = 'remSoon'; box.className = 'card s12';
      const anchor = document.getElementById('glucoseHero');
      const after = anchor && anchor.closest('.card') || grid.firstElementChild;
      grid.insertBefore(box, after ? after.nextSibling : null);
    }
    box.innerHTML = '<h3 style="margin:0 0 8px">Скоро нужно</h3>' + soon.slice(0, 4).map(({ r, s }) =>
      `<div class="remSoonRow"><span>${esc(r.title)}<br><small class="${s.left < 0 ? 'remLate' : 'muted'}">${when(s.left)} · ${fmt(s.due)}</small></span><button class="btn small" onclick="DMRem.done('${r.id}')">Сделано</button></div>`).join('') +
      '<div style="margin-top:8px"><a href="#" onclick="show(\'reminders\');return false">Все напоминания →</a></div>';
  }

  /* ---------- .ics ---------- */
  function fold(line) {
    const enc = new TextEncoder(), out = []; let cur = '', len = 0;
    for (const ch of line) { const b = enc.encode(ch).length; if (len + b > 73) { out.push(cur); cur = ' ' + ch; len = 1 + b; } else { cur += ch; len += b; } }
    out.push(cur); return out.join('\r\n');
  }
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function buildIcs() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moy diabet//Reminders//RU', 'CALSCALE:GREGORIAN'];
    const ev = (uid, title, dtstart, rrule) => {
      L.push('BEGIN:VEVENT', 'UID:' + uid + '@my-diabet', 'DTSTAMP:' + stamp, 'DTSTART:' + dtstart, 'DURATION:PT15M', 'SUMMARY:' + icsEsc(title));
      if (rrule) L.push('RRULE:' + rrule);
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    };
    list().filter(r => r.on).forEach(r => {
      if (r.kind === 'daily') {
        (r.times || []).forEach((t, i) => ev(r.id + '-' + i, r.title, todayS().replace(/-/g, '') + 'T' + t.replace(':', '') + '00', 'FREQ=DAILY'));
      } else {
        let d = dueDate(r); if (d < todayS()) d = todayS();
        const f = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[r.unit] || 'MONTHLY';
        ev(r.id, r.title, d.replace(/-/g, '') + 'T090000', 'FREQ=' + f + ';INTERVAL=' + (r.n || 1));
      }
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function ics() {
    if (!list().some(r => r.on)) return alert('Сначала добавьте напоминания');
    const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'moy-diabet-napominaniya.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  window.DMRem = {
    render, renderCard, edit, kindChg, save: saveItem, del, done, ics, buildIcs, cancel: () => { const e = document.getElementById('remEditor'); if (e) e.innerHTML = ''; },
    addTpl: i => { add(TEMPLATES[i]); render(); renderCard(); }
  };
  const os = window.show;
  if (typeof os === 'function') window.show = function (id) { const r = os.apply(this, arguments); if (id === 'reminders') setTimeout(render, 0); if (id === 'dashboard') setTimeout(renderCard, 60); return r; };
  const init = () => { try { renderCard(); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300)); else setTimeout(init, 300);
})();
