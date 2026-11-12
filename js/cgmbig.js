/* v64.23: большой график сенсора.
   Открывается нажатием на график на главной. Периоды от 3 часов до 30 дней, листание назад/вперёд
   (кнопками и свайпом), значение и время под пальцем, сводка за видимый период. */
(function () {
  const RANGES = [[3, '3 ч'], [6, '6 ч'], [12, '12 ч'], [24, '24 ч'], [72, '3 дн'], [168, '7 дн'], [336, '14 дн'], [720, '30 дн']];
  let hours = 24, end = null, pts = [], loading = false, token = 0, cursorX = null;
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
<div class="cgmBigChart" id="cgmBigChart"></div>
<div class="cgmBigTip" id="cgmBigTip"></div>
<div class="kpi cgmKpi cgmBigStats" id="cgmBigStats"></div>
<div class="muted cgmBigHint">Проведите пальцем по графику — увидите значение и время. Свайп влево/вправо листает период.</div>
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
  function range() { const to = nowEnd() ? Date.now() : end; return { from: to - hours * 3600e3, to } }

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
    for (let g = 4; g <= ymax; g += 4) s += `<line x1="0" x2="${W}" y1="${Y(g)}" y2="${Y(g)}" stroke="#e2e8f0"/><text x="4" y="${Y(g) - 3}" font-size="12" fill="#64748b" stroke="#fff" stroke-width="3" paint-order="stroke">${g}</text>`;
    // подписи времени: часы для коротких периодов, даты для длинных
    const H1 = 3600e3, stepH = hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 24 ? 4 : hours <= 72 ? 12 : hours <= 168 ? 24 : hours <= 336 ? 48 : 96;
    const t0 = new Date(from); t0.setMinutes(0, 0, 0); let t = t0.getTime() + H1;
    while (stepH >= 24 ? new Date(t).getHours() !== 0 : new Date(t).getHours() % stepH) t += H1;
    for (; t <= to; t += stepH * H1) {
      const x = X(t); if (x < 18 || x > W - 18) continue; const midnight = new Date(t).getHours() === 0;
      s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt}" y2="${H - pb}" stroke="${midnight ? '#94a3b8' : '#e2e8f0'}"${midnight && hours <= 72 ? ' stroke-dasharray="3 3"' : ''}/>`;
      s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="12" text-anchor="middle" fill="#64748b">${stepH >= 24 || (midnight && hours > 24) ? dm(t) : midnight ? dm(t) : hm(t)}</text>`;
    }
    let path = '', prev = null;
    pts.forEach(p => { const gap = prev && p.t - prev.t > 15 * 60e3; path += (path === '' || gap ? 'M' : 'L') + X(p.t).toFixed(1) + ',' + Y(p.g).toFixed(1); prev = p });
    s += `<path d="${path}" fill="none" stroke="#0d9488" stroke-width="${hours > 168 ? 1.2 : 2}" stroke-linejoin="round"/>`;
    if (hours <= 72) s += pts.filter(p => p.g < 3.9 || p.g > 10).map(p => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.g).toFixed(1)}" r="2.2" fill="${p.g < 3.9 ? '#dc2626' : '#f59e0b'}"/>`).join('');
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
    const W = Math.max(300, ch.clientWidth || 640), H = Math.round(Math.min(Math.max(window.innerHeight * 0.42, 240), 460));
    if (loading) { ch.innerHTML = `<div class="muted" style="height:${H}px;display:flex;align-items:center;justify-content:center">Загружаю показания…</div>`; geo = null; stats(); return }
    if (!pts.length) { ch.innerHTML = `<div class="muted" style="height:${H}px;display:flex;align-items:center;justify-content:center;text-align:center">За этот период показаний нет</div>`; geo = null; stats(); return }
    const r = svg(W, H); ch.innerHTML = r.s; geo = r; stats(); paintTip();
  }
  function stats() {
    const el = $('cgmBigStats'); if (!el) return;
    if (!pts.length) { el.innerHTML = ''; return }
    const n = pts.length, avg = pts.reduce((a, x) => a + x.g, 0) / n, q = f => Math.round(pts.filter(f).length / n * 100);
    const mn = Math.min(...pts.map(x => x.g)), mx = Math.max(...pts.map(x => x.g));
    el.innerHTML = `<div class="mini"><span class="muted">Среднее</span><b>${f1(avg)}</b></div><div class="mini"><span class="muted">В диапазоне 3,9–10</span><b>${q(x => x.g >= 3.9 && x.g <= 10)}%</b></div><div class="mini"><span class="muted">Ниже 3,9</span><b style="color:#dc2626">${q(x => x.g < 3.9)}%</b></div><div class="mini"><span class="muted">Выше 10</span><b style="color:#d97706">${q(x => x.g > 10)}%</b></div><div class="mini"><span class="muted">Мин / макс</span><b>${f1(mn)} / ${f1(mx)}</b></div>`;
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
  window.DMCgmBig = { open, close, shift, range(h) { hours = h; cursorX = null; load() }, now() { end = null; load() } };
})();
