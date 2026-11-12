/* v64.23: большой график сенсора.
   Открывается нажатием на график на главной. Периоды от 3 часов до 30 дней, листание назад/вперёд
   (кнопками и свайпом), значение и время под пальцем, сводка за видимый период. */
(function () {
  const RANGES = [[3, '3 ч'], [6, '6 ч'], [12, '12 ч'], [24, '24 ч'], [72, '3 дн'], [168, '7 дн'], [336, '14 дн'], [720, '30 дн']];
  let hours = 24, end = null, pts = [], loading = false, token = 0, cursorX = null;
  let medOn = (() => { try { return localStorage.getItem('dm-cgm-median') !== '0' } catch (e) { return true } })();
  const $ = id => document.getElementById(id);
  const f1 = v => v.toFixed(1).replace('.', ',');
  const p2 = n => String(n).padStart(2, '0');
  const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) };
  const hm = t => { const d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()) };
  const dm = t => { const d = new Date(t); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) };
  const nowEnd = () => end == null;

  function box() {
    let el = $('cgmBig'); if (el) return el;
    el = document.createElement('div'); el.id = 'cgmBig'; el.className = 'cgmBig';
    el.innerHTML = `<div class="cgmBigBox" role="dialog" aria-label="График сахара">
<div class="cgmBigHead"><b>Сахар с сенсора</b><span id="cgmBigWhen" class="muted"></span><button class="navClose" aria-label="Закрыть" onclick="DMCgmBig.close()">✕</button></div>
<div class="cgmBigRanges" id="cgmBigRanges"></div>
<div class="cgmBigNav"><button class="btn secondary small" onclick="DMCgmBig.shift(-1)">‹ Раньше</button><button class="btn secondary small" id="cgmBigNow" onclick="DMCgmBig.now()">Сейчас</button><button class="btn secondary small" id="cgmBigNext" onclick="DMCgmBig.shift(1)">Позже ›</button></div>
<div id="cgmBigPred"></div><div class="cgmBigTip" id="cgmBigTip"></div>
<div class="cgmBigChart" id="cgmBigChart"></div>
<div class="cgmBigStats" id="cgmBigStats"></div>
<label class="cgmBigMed"><input type="checkbox" id="cgmBigMedOn" onchange="DMCgmBig.median(this.checked)"> <span class="medSw"></span> Медиана <span class="muted">(красная линия — середина значений за скользящий отрезок)</span></label>
</div>`;
    el.addEventListener('click', e => { if (e.target === el) close() });
    document.body.appendChild(el);
    const ch = el.querySelector('#cgmBigChart');
    let sx = null, st = 0;
    ch.addEventListener('pointerdown', e => { sx = e.clientX; st = Date.now(); move(e) });
    ch.addEventListener('pointermove', e => move(e));
    ch.addEventListener('pointerup', e => {
      if (sx != null && Math.abs(e.clientX - sx) > 70 && Date.now() - st < 700) shift(e.clientX < sx ? 1 : -1);
      sx = null;
    });
    ch.addEventListener('pointerleave', () => { cursorX = null; paintTip() });
    document.addEventListener('keydown', e => { if (!el.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') shift(-1); if (e.key === 'ArrowRight') shift(1) });
    return el;
  }
  let pred = null;
  function range() {
    const base = nowEnd() ? Date.now() : end;
    pred = nowEnd() && window.DMPredict ? DMPredict.now((window.DMCgm && DMCgm.readings()) || []) : null;
    const ext = pred && pred.type && hours <= 24 ? Math.min(pred.line[pred.line.length - 1].t - base, hours * 3600e3 * 0.2) : 0;
    return { from: base - hours * 3600e3, to: base + Math.max(0, ext), now: base };
  }

  async function load() {
    const my = ++token, { from, to } = range();
    const cached = (window.DMCgm && DMCgm.readings()) || [];
    // свежие показания уже есть в памяти (последние 36 часов)
    if (cached.length && cached[0].t <= from + 5 * 60e3) { pts = cached.filter(x => x.t >= from && x.t <= to); loading = false; paint(); return }
    loading = true; paint();
    try {
      const r = await DMCgm.period(dkey(from), dkey(to));
      if (my !== token) return;
      const raw = (r && r.raw) || [];
      const seen = new Set(); pts = [];
      raw.concat(cached).forEach(x => { if (x.t >= from && x.t <= to && !seen.has(x.t)) { seen.add(x.t); pts.push(x) } });
      pts.sort((a, b) => a.t - b.t);
    } catch (e) { pts = [] }
    loading = false; if (my === token) paint();
  }

  function svg(W, H) {
    const { from, to } = range(), pl = 0, pr = 0, pt = 12, pb = 26;
    const ymax = Math.max(16, ...pts.map(x => x.g + 1));
    const X = t => pl + (t - from) / (to - from) * (W - pl - pr), Y = g => pt + (1 - g / ymax) * (H - pt - pb);
    let s = `<rect x="0" y="${Y(10)}" width="${W}" height="${Y(3.9) - Y(10)}" fill="#dcfce7" opacity=".75"/>`;
    s += `<line x1="0" x2="${W}" y1="${Y(3.9)}" y2="${Y(3.9)}" stroke="#ef4444" stroke-dasharray="4 4" opacity=".6"/><line x1="0" x2="${W}" y1="${Y(10)}" y2="${Y(10)}" stroke="#f59e0b" stroke-dasharray="4 4" opacity=".6"/>`;
    for (let g = 2; g <= ymax; g += 1) { const major = g % 4 === 0; s += `<line x1="0" x2="${W}" y1="${Y(g)}" y2="${Y(g)}" stroke="${major ? '#dbe3ea' : '#eef2f6'}"/><text x="4" y="${Y(g) - 2}" font-size="${major ? 12 : 10.5}" font-weight="${major ? 700 : 400}" fill="${major ? '#475569' : '#94a3b8'}" stroke="#fff" stroke-width="3" paint-order="stroke">${g}</text>` }
    // подписи времени: часы для коротких периодов, даты для длинных
    // вертикальная сетка: шаг в минутах — подробнее на широком экране
    const wide = W >= 700, M = 60e3;
    const STEP = wide ? { 3: 30, 6: 30, 12: 60, 24: 120, 72: 360, 168: 720, 336: 1440, 720: 2880 } : { 3: 30, 6: 60, 12: 120, 24: 240, 72: 720, 168: 1440, 336: 2880, 720: 5760 };
    const step = (STEP[hours] || 60) * M, d0 = new Date(from); d0.setHours(0, 0, 0, 0);
    let t = d0.getTime(); while (t <= from) t += step;
    for (; t <= to; t += step) {
      const x = X(t); if (x < 16 || x > W - 16) continue; const dt = new Date(t), midnight = dt.getHours() === 0 && dt.getMinutes() === 0, half = dt.getMinutes() !== 0;
      s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt}" y2="${H - pb}" stroke="${midnight ? '#94a3b8' : half ? '#eef2f6' : '#e2e8f0'}"${midnight && hours <= 72 ? ' stroke-dasharray="3 3"' : ''}/>`;
      const lbl = step >= 1440 * M || midnight && hours > 6 ? dm(t) : hm(t);
      s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="${wide ? 12 : 11}" text-anchor="middle" fill="${half ? '#94a3b8' : '#64748b'}">${lbl}</text>`;
    }
    let path = '', prev = null;
    pts.forEach(p => { const gap = prev && p.t - prev.t > 15 * 60e3; path += (path === '' || gap ? 'M' : 'L') + X(p.t).toFixed(1) + ',' + Y(p.g).toFixed(1); prev = p });
    s += `<path d="${path}" fill="none" stroke="#0d9488" stroke-width="${hours > 168 ? 1.2 : 2}" stroke-linejoin="round"/>`;
    if (hours <= 72) s += pts.filter(p => p.g < 3.9 || p.g > 10).map(p => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.g).toFixed(1)}" r="2.2" fill="${p.g < 3.9 ? '#dc2626' : '#f59e0b'}"/>`).join('');
    if (medOn && pts.length > 5) {
      // скользящая медиана: окно ~1/40 периода, не меньше 30 минут; считаем по сетке точек
      const win = Math.max(30 * 60e3, (to - from) / 40), steps = Math.min(240, Math.max(40, Math.round(W / 4))), med = [];
      let i0 = 0, i1 = 0;
      for (let k = 0; k <= steps; k++) {
        const t = from + (to - from) * k / steps;
        while (i0 < pts.length && pts[i0].t < t - win / 2) i0++;
        while (i1 < pts.length && pts[i1].t <= t + win / 2) i1++;
        const seg = pts.slice(i0, i1);
        if (seg.length < 3) { med.push(null); continue }
        const v = seg.map(x => x.g).sort((a, b) => a - b), m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
        med.push([X(t), Y(m)]);
      }
      let d = '', pen = false; med.forEach(p => { if (!p) { pen = false; return } d += (pen ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); pen = true });
      s += `<path d="${d}" fill="none" stroke="#dc2626" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
    }
    if (pred && pred.type && to > (range().now || to)) { const xn = X(Date.now()); s += `<line x1="${xn.toFixed(1)}" x2="${xn.toFixed(1)}" y1="${pt}" y2="${H - pb}" stroke="#64748b" stroke-dasharray="4 3"/><text x="${(xn + 4).toFixed(1)}" y="${pt + 12}" font-size="11" fill="#64748b">прогноз</text>` + DMPredict.svg(pred, X, Y) }
    s += `<g id="cgmBigCur"></g>`;
    return { s: `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;touch-action:pan-y">${s}</svg>`, X, Y, from, to };
  }
  let geo = null;
  function paint() {
    const el = box(), ch = el.querySelector('#cgmBigChart'), { from, to } = range();
    el.querySelector('#cgmBigRanges').innerHTML = RANGES.map(([h, l]) => `<button class="btn ${h === hours ? '' : 'secondary'} small" onclick="DMCgmBig.range(${h})">${l}</button>`).join('');
    el.querySelector('#cgmBigNext').disabled = nowEnd();
    el.querySelector('#cgmBigNow').disabled = nowEnd();
    el.querySelector('#cgmBigWhen').textContent = hours <= 24 ? `${dm(from)} ${hm(from)} — ${dm(to) === dm(from) ? '' : dm(to) + ' '}${hm(to)}` : `${dm(from)} — ${dm(to)}`;
    const mo = el.querySelector('#cgmBigMedOn'); if (mo) mo.checked = medOn;
    ch.innerHTML = '';
    const W = Math.max(280, ch.clientWidth || 640), H = Math.max(180, Math.round(ch.clientHeight || 300));
    if (loading) { ch.innerHTML = `<div class="muted" style="height:100%;display:flex;align-items:center;justify-content:center">Загружаю показания…</div>`; geo = null; stats(); return }
    if (!pts.length) { ch.innerHTML = `<div class="muted" style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center">За этот период показаний нет</div>`; geo = null; stats(); return }
    const r = svg(W, H); ch.innerHTML = r.s; geo = r; stats(); paintTip();
    const pb = document.getElementById('cgmBigPred'); if (pb) pb.innerHTML = pred && pred.type ? DMPredict.banner(pred) : '';
  }
  function stats() {
    const el = $('cgmBigStats'); if (!el) return;
    if (!pts.length) { el.innerHTML = ''; return }
    const n = pts.length, avg = pts.reduce((a, x) => a + x.g, 0) / n, q = f => Math.round(pts.filter(f).length / n * 100);
    const mn = Math.min(...pts.map(x => x.g)), mx = Math.max(...pts.map(x => x.g));
    const sv = pts.map(x => x.g).sort((a, b) => a - b), md = sv.length % 2 ? sv[(sv.length - 1) / 2] : (sv[sv.length / 2 - 1] + sv[sv.length / 2]) / 2;
    const T = (l, v, c) => `<div class="bs"><span>${l}</span><b${c ? ` style="color:${c}"` : ''}>${v}</b></div>`;
    el.innerHTML = T('Среднее', f1(avg)) + T('Медиана', f1(md), medOn ? '#dc2626' : '') + T('Выше 10', q(x => x.g > 10) + '%', '#d97706') + T('Ниже 3,9', q(x => x.g < 3.9) + '%', '#dc2626') + T('Макс', f1(mx)) + T('Мин', f1(mn)) + T('В норме', q(x => x.g >= 3.9 && x.g <= 10) + '%', '#0f766e') + T('Точек', n);
  }
  function move(e) {
    if (!geo) return; const r = e.currentTarget.getBoundingClientRect(); cursorX = (e.clientX - r.left) * (geo.s ? 1 : 1); paintTip();
  }
  function paintTip() {
    const tip = $('cgmBigTip'), g = document.getElementById('cgmBigCur'); if (!tip) return;
    if (!geo || cursorX == null || !pts.length) { tip.innerHTML = '&nbsp;'; if (g) g.innerHTML = ''; return }
    const t = geo.from + cursorX / (($('cgmBigChart').clientWidth) || 1) * (geo.to - geo.from);
    let best = pts[0]; for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    if (Math.abs(best.t - t) > Math.max(20 * 60e3, (geo.to - geo.from) / 200)) { tip.innerHTML = `${dm(t)} ${hm(t)} — нет данных`; if (g) g.innerHTML = ''; return }
    const x = geo.X(best.t), y = geo.Y(best.g), col = best.g < 3.9 ? '#dc2626' : best.g > 10 ? '#d97706' : '#0f766e';
    if (g) g.innerHTML = `<line x1="${x}" x2="${x}" y1="0" y2="2000" stroke="#334155" stroke-width="1" opacity=".5"/><circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="${col}" stroke-width="3"/>`;
    tip.innerHTML = `<b style="color:${col}">${f1(best.g)} ммоль/л</b> · ${dm(best.t)} в ${hm(best.t)}`;
  }
  function open(h) { box().classList.add('open'); document.body.classList.add('sheetOpen'); if (h) hours = h; end = null; load() }
  function close() { const el = $('cgmBig'); if (el) el.classList.remove('open'); document.body.classList.remove('sheetOpen') }
  function shift(dir) {
    const { to } = range(); let ne = to + dir * hours * 3600e3 * 0.5;
    if (ne >= Date.now() - 60e3) end = null; else end = ne; cursorX = null; load();
  }
  window.addEventListener('resize', () => { if ($('cgmBig')?.classList.contains('open')) paint() });
  window.DMCgmBig = { median(on) { medOn = !!on; try { localStorage.setItem('dm-cgm-median', on ? '1' : '0') } catch (e) {} paint() }, open, close, shift, range(h) { hours = h; cursorX = null; load() }, now() { end = null; load() } };
})();
