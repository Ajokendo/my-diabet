/* v64.82: «Динамика анализов» — история ключевых показателей (HbA1c, С-пептид и др.) в одной таблице и на графике.
   Значения приводятся к единой единице (например, С-пептид — к пмоль/л); исходное значение показано рядом.
   Берёт данные из «Анализов» (db.labs), ничего нового вводить не нужно. Нормы не подставляет — их определяет лаборатория и врач. */
(function () {
  'use strict';
  /* std — единица для сравнения; conv — как привести исходную единицу к std */
  const SPEC = {
    hba1c: { name: 'HbA1c', std: '%', dec: 1, conv: u => /моль\/моль/i.test(u) ? v => 0.0915 * v + 2.15 : 1 },
    cpep: { name: 'С-пептид', std: 'пмоль/л', dec: 0, conv: u => /нмоль/i.test(u) ? 1000 : /(нг\s*\/\s*мл|ng\s*\/\s*ml|мкг\s*\/\s*л|ug\s*\/\s*l)/i.test(u) ? 331 : 1 },
    vitd: { name: 'Витамин D', std: 'нг/мл', dec: 1, conv: u => /нмоль/i.test(u) ? 1 / 2.496 : 1 },
    glu: { name: 'Глюкоза натощак', std: 'ммоль/л', dec: 1, conv: u => /мг\s*\/\s*дл/i.test(u) ? 1 / 18.016 : 1 },
    chol: { name: 'Холестерин общий', std: 'ммоль/л', dec: 1, conv: u => /мг\s*\/\s*дл/i.test(u) ? 0.02586 : 1 },
    ldl: { name: 'ЛПНП', std: 'ммоль/л', dec: 1, conv: u => /мг\s*\/\s*дл/i.test(u) ? 0.02586 : 1 },
    tg: { name: 'Триглицериды', std: 'ммоль/л', dec: 1, conv: u => /мг\s*\/\s*дл/i.test(u) ? 0.01129 : 1 },
    creat: { name: 'Креатинин', std: 'мкмоль/л', dec: 0, conv: u => /мг\s*\/\s*дл/i.test(u) ? 88.4 : 1 },
    tsh: { name: 'ТТГ', std: 'мЕд/л', dec: 2, conv: () => 1 }
  };
  const ORDER = ['hba1c', 'cpep', 'vitd', 'tsh', 'glu', 'chol', 'ldl', 'tg', 'creat'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => { const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : d; };
  let cur = 'hba1c';
  const persist = () => { try { save(); } catch (e) {} };

  function rows(type) {
    const sp = SPEC[type]; if (!sp || typeof db === 'undefined') return [];
    return (db.labs || []).filter(l => l.type === type && l.date && l.value !== '' && l.value != null && isFinite(+l.value))
      .map(l => {
        const unit = String(l.unit || '').trim(), c = sp.conv(unit), raw = +l.value;
        const v = typeof c === 'function' ? c(raw) : raw * c;
        const changed = !!unit && (typeof c === 'function' || c !== 1);
        return { id: l.id, date: l.date, v, raw, unit, changed, note: String(l.note || '').replace(/^из документа:\s*/, '') };
      }).sort((a, b) => a.date.localeCompare(b.date));
  }
  const show1 = (v, dec) => String(+(+v).toFixed(dec));

  function chart(r, sp) {
    if (r.length < 2) return '';
    const W = 320, H = 150, pl = 34, pr = 14, pt = 18, pb = 26;
    const t = x => new Date(x.date).getTime();
    const t0 = t(r[0]), t1 = t(r[r.length - 1]) || t0 + 1;
    let lo = Math.min(...r.map(x => x.v)), hi = Math.max(...r.map(x => x.v));
    const pad = (hi - lo) * 0.2 || Math.abs(hi) * 0.1 || 1; lo -= pad; hi += pad;
    const X = x => pl + (t1 === t0 ? (W - pl - pr) / 2 : (t(x) - t0) / (t1 - t0) * (W - pl - pr));
    const Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    const pts = r.map(x => X(x).toFixed(1) + ',' + Y(x.v).toFixed(1)).join(' ');
    const grid = [0, 0.5, 1].map(f => { const v = lo + (hi - lo) * f, y = Y(v); return `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".12"/><text x="${pl - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${show1(v, sp.dec)}</text>`; }).join('');
    const dots = r.map((x, i) => `<circle cx="${X(x).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="4" fill="#14b8a6" stroke="#fff" stroke-width="1.5"/><text x="${X(x).toFixed(1)}" y="${(Y(x.v) - 8).toFixed(1)}" font-size="10" font-weight="700" text-anchor="${i === 0 ? 'start' : i === r.length - 1 ? 'end' : 'middle'}" fill="currentColor">${show1(x.v, sp.dec)}</text>`).join('');
    const xl = `<text x="${pl}" y="${H - 8}" font-size="9" fill="currentColor" opacity=".6">${fmt(r[0].date)}</text><text x="${W - pr}" y="${H - 8}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${fmt(r[r.length - 1].date)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График" style="width:100%;height:auto;max-width:560px;display:block;margin:8px 0">${grid}<polyline points="${pts}" fill="none" stroke="#14b8a6" stroke-width="2.2" stroke-linejoin="round"/>${dots}${xl}</svg>`;
  }

  function render() {
    const sec = document.getElementById('labs'); if (!sec) return;
    const grid = sec.querySelector('.grid'); if (!grid) return;
    let box = document.getElementById('labTrend');
    if (!box) { box = document.createElement('div'); box.id = 'labTrend'; box.className = 'card'; box.style.marginBottom = '14px'; }
    const docs = document.getElementById('docsCard');
    const parent = docs ? docs.parentNode : grid.parentNode, ref = docs || grid;
    if (box.nextSibling !== ref || box.parentNode !== parent) parent.insertBefore(box, ref);
    const have = ORDER.filter(t => rows(t).length);
    const chips = ORDER.filter(t => have.includes(t) || t === 'hba1c' || t === 'cpep');
    if (!chips.includes(cur)) cur = 'hba1c';
    const sp = SPEC[cur], r = rows(cur);
    const tabs = chips.map(t => `<button class="btn small ${t === cur ? '' : 'secondary'}" onclick="DMLabTrend.pick('${t}')">${esc(SPEC[t].name)}</button>`).join(' ');
    let body;
    if (!r.length) body = '<p class="muted">Пока нет результатов. Добавьте анализ ниже или загрузите документ — история появится здесь.</p>';
    else {
      const desc = r.slice().reverse();
      const rowsHtml = desc.map((x, i) => {
        const prev = desc[i + 1]; let d = '';
        if (prev) { const dv = x.v - prev.v, s = +dv.toFixed(sp.dec); d = s === 0 ? '0' : (s > 0 ? '▲ +' : '▼ ') + show1(dv, sp.dec); }
        const wt = (cur === 'hba1c' || cur === 'cpep') && window.DMWeight ? DMWeight.at(x.date, 45) : null;
        return `<tr><td>${fmt(x.date)}${wt ? `<br><small class="muted">вес ${String(wt.kg).replace('.', ',')} кг</small>` : ''}${x.note ? `<br><small class="muted">${esc(x.note.length > 26 ? x.note.slice(0, 25) + '…' : x.note)}</small>` : ''}</td><td><b>${show1(x.v, sp.dec)}</b> ${esc(sp.std)}${x.changed ? `<br><small class="muted">исходно ${esc(show1(x.raw, 2))} ${esc(x.unit)}</small>` : ''}</td><td>${d}</td></tr>`;
      }).join('');
      body = chart(r, sp) + `<div class="tablewrap"><table class="table" style="width:100%"><tr><th align="left">Дата</th><th align="left">Значение</th><th align="left">Изменение</th></tr>${rowsHtml}</table></div>`
        + (r.some(x => x.changed) ? `<p class="muted" style="margin-top:6px">Значения в других единицах пересчитаны в ${esc(sp.std)}, чтобы их можно было сравнивать. Исходные числа не изменены.</p>` : '')
        + `<div class="row" style="margin-top:8px"><button class="btn secondary small" onclick="DMLabTrend.copy()">Скопировать для врача</button></div>`;
    }
    const bulk = `<details id="labBulk" style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Добавить анализы списком (из выписки)</summary>
      <p class="muted" style="margin:8px 0">Удобно, когда нужно перенести много результатов сразу. Одна строка — один результат: дата; показатель; значение; единица; комментарий. Единицу и комментарий можно не писать. Повторы (та же дата, показатель и значение) пропускаются.</p>
      <textarea id="labBulkText" class="input" rows="7" placeholder="13.01.2026; HbA1c; 14.5; %; выписка&#10;13.01.2026; Креатинин; 33.4; мкмоль/л"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn small" onclick="DMLabTrend.bulk()">Добавить из списка</button></div><div id="labBulkMsg" class="muted" style="margin-top:6px"></div></details>`;
    box.innerHTML = `<h3>Динамика анализов</h3><p class="muted">Все результаты одного показателя в одном месте — чтобы быстро ответить врачу, какие были раньше.</p><div class="row" style="flex-wrap:wrap;gap:6px;margin:8px 0">${tabs}</div>${body}${bulk}`;
  }

  function copy() {
    const sp = SPEC[cur], r = rows(cur).reverse();
    const txt = sp.name + ' (' + sp.std + '):\n' + r.map(x => fmt(x.date) + ' — ' + show1(x.v, sp.dec) + (x.changed ? ' (исходно ' + show1(x.raw, 2) + ' ' + x.unit + ')' : '') + ((cur === 'hba1c' || cur === 'cpep') && window.DMWeight && DMWeight.at(x.date, 45) ? ', вес ' + String(DMWeight.at(x.date, 45).kg).replace('.', ',') + ' кг' : '')).join('\n');
    const ok = () => alert('Скопировано. Можно вставить в сообщение врачу.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => prompt('Скопируйте текст:', txt)); else prompt('Скопируйте текст:', txt);
  }

  const TYPE_RE = [['hba1c', /hba1c|гликир|гликоз.*гемоглоб/i], ['cpep', /[cс][\s-]*пептид|c-?peptide/i], ['vitd', /витамин\s*d|25-?oh/i], ['ldl', /лпнп|ldl/i], ['tg', /триглицерид/i], ['creat', /креатинин/i], ['tsh', /^ттг|tsh|тиреотроп/i], ['chol', /^холестерин( общий)?$/i], ['glu', /^глюкоза( натощак)?( \(венозная\))?$/i]];
  function parseDate(x) {
    x = String(x || '').trim(); let y, mo, d, m = x.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else if ((m = x.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; } else return '';
    const t = new Date(y, mo - 1, d); if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }
  const pad2 = n => String(n).padStart(2, '0');
  function bulk() {
    const ta = document.getElementById('labBulkText'), msg = document.getElementById('labBulkMsg'); if (!ta) return;
    const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) { msg.textContent = 'Список пуст.'; return; }
    db.labs = db.labs || []; let added = 0, skipped = 0; const bad = [];
    lines.forEach(line => {
      const p = line.split(/\s*[;\t]\s*/), date = parseDate(p[0]), name = (p[1] || '').trim(), v = parseFloat(String(p[2] || '').replace(',', '.'));
      if (!date || !name || !isFinite(v)) { bad.push(line); return; }
      const hit = TYPE_RE.find(t => t[1].test(name)), type = hit ? hit[0] : 'other';
      const lt = (typeof LAB_TYPES !== 'undefined' ? LAB_TYPES : []).find(x => x[0] === type);
      const unit = (p[3] || '').trim() || (lt ? lt[2] : ''), label = type === 'other' ? name : (lt ? lt[1] : name);
      if (db.labs.some(x => x.date === date && x.type === type && +x.value === v && (type !== 'other' || x.name === label))) { skipped++; return; }
      db.labs.push({ id: 'lab' + Date.now() + '_' + added + Math.floor(Math.random() * 1000), date, type, name: label, value: v, unit, note: (p.slice(4).join('; ') || '').trim() });
      added++;
    });
    if (added) { persist(); try { renderLabs(); } catch (e) {} }
    render();
    const m2 = document.getElementById('labBulkMsg'), d2 = document.getElementById('labBulk');
    if (m2) m2.innerHTML = 'Добавлено: ' + added + (skipped ? ', уже были: ' + skipped : '') + (bad.length ? '.<br>Не удалось прочитать строки (проверьте дату и значение): ' + bad.map(esc).join(' | ') : '');
    if (d2) d2.open = true;
  }
  window.DMLabTrend = { bulk, render, pick: t => { cur = t; render(); }, copy, rows };
  const os = window.show;
  if (typeof os === 'function') window.show = function (id) { const r = os.apply(this, arguments); if (id === 'labs') setTimeout(render, 90); return r; };
  const wrap = n => { const f = window[n]; if (typeof f === 'function' && !f.__lt) { const w = function () { const r = f.apply(this, arguments); try { render(); } catch (e) {} return r; }; w.__lt = true; window[n] = w; } };
  const init = () => { wrap('addLab'); wrap('delLab'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300)); else setTimeout(init, 300);
})();
