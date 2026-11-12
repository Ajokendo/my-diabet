/* v64.36: «Тенденции» сенсора за 7/14/30 дней — как в приложениях LinX/Libre и в отчётах эндокринологов.
   AGP (амбулаторный профиль: медиана и полосы 25–75% и 5–95% по времени суток), TIR по 5 зонам
   (международный консенсус 2019), вариабельность CV, GMI, покрытие сенсором, LBGI/HBGI, наложение дней.
   Используется в окне большого графика и в отчёте врачу. */
(function () {
  const MGDL = 18.016, f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ','), p2 = n => String(n).padStart(2, '0');
  const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) };
  const dm = k => k.slice(8, 10) + '.' + k.slice(5, 7);
  const COLORS = ['#2563eb', '#06b6d4', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#4f46e5', '#65a30d', '#be123c', '#0891b2', '#a16207', '#9333ea'];
  const pct = (s, q) => { if (!s.length) return NaN; const i = (s.length - 1) * q, a = Math.floor(i), b = Math.ceil(i); return s[a] + (s[b] - s[a]) * (i - a) };

  function compute(raw, days) {
    const r = (raw || []).filter(x => x && x.g > 0).sort((a, b) => a.t - b.t);
    if (r.length < 12) return null;
    const n = r.length, vals = r.map(x => x.g), mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const q = f => r.filter(f).length / n * 100;
    const zones = { vlow: q(x => x.g < 3.0), low: q(x => x.g >= 3.0 && x.g < 3.9), inr: q(x => x.g >= 3.9 && x.g <= 10), high: q(x => x.g > 10 && x.g <= 13.9), vhigh: q(x => x.g > 13.9) };
    // интервал сенсора — медиана разниц между соседними точками (1, 3 или 5 минут)
    const dif = []; for (let i = 1; i < n; i++) { const d = (r[i].t - r[i - 1].t) / 60e3; if (d > 0.4 && d < 16) dif.push(d) }
    dif.sort((a, b) => a - b); const step = Math.max(1, Math.round(pct(dif, .5) || 5));
    const span = Math.max(1, days) * 1440, cover = Math.min(100, n * step / span * 100);
    // LBGI/HBGI (Kovatchev): f = 1,509·(ln(BG мг/дл)^1,084 − 5,381)
    let lb = 0, hb = 0; vals.forEach(g => { const f = 1.509 * (Math.pow(Math.log(Math.max(g * MGDL, 20)), 1.084) - 5.381), rr = 10 * f * f; if (f < 0) lb += rr; else hb += rr });
    // AGP: 96 отрезков по 15 минут
    const B = 96, bins = Array.from({ length: B }, () => []);
    r.forEach(x => { const d = new Date(x.t), m = d.getHours() * 60 + d.getMinutes(); bins[Math.floor(m / 15) % B].push(x.g) });
    const raw5 = bins.map(b => { const s = b.slice().sort((a, c) => a - c); return s.length >= 3 ? [pct(s, .05), pct(s, .25), pct(s, .5), pct(s, .75), pct(s, .95)] : null });
    // сглаживание по соседям (как в отчётах AGP), с учётом перехода через полночь
    const agp = raw5.map((v, i) => { if (!v) return null; const acc = [0, 0, 0, 0, 0]; let w = 0; for (let k = -2; k <= 2; k++) { const u = raw5[(i + k + B) % B]; if (!u) continue; const ww = 3 - Math.abs(k); for (let j = 0; j < 5; j++)acc[j] += u[j] * ww; w += ww } return acc.map(a => a / w) });
    const byDay = {}; r.forEach(x => { (byDay[dkey(x.t)] ??= []).push(x) });
    return { n, mean, sd, cv: sd / mean * 100, gmi: 3.31 + 0.02392 * mean * MGDL, zones, cover, step, lbgi: lb / n, hbgi: hb / n, agp, byDay, min: Math.min(...vals), max: Math.max(...vals) };
  }

  const riskL = v => v <= 1.1 ? ['минимальный', '#16a34a'] : v <= 2.5 ? ['низкий', '#65a30d'] : v <= 5 ? ['средний', '#d97706'] : ['высокий', '#dc2626'];
  const riskH = v => v <= 4.5 ? ['низкий', '#16a34a'] : v <= 9 ? ['средний', '#d97706'] : ['высокий', '#dc2626'];

  function tirHtml(T, dark) {
    const Z = [['vhigh', 'Очень высокий', '> 13,9', '#b45309', '< 5%'], ['high', 'Высокий', '10,1–13,9', '#f59e0b', '< 25% вместе с очень высоким'], ['inr', 'В норме', '3,9–10,0', '#16a34a', '> 70%'], ['low', 'Низкий', '3,0–3,8', '#ef4444', '< 4% вместе с очень низким'], ['vlow', 'Очень низкий', '< 3,0', '#991b1b', '< 1%']];
    const bar = Z.map(([k, , , c]) => `<div style="flex:${Math.max(T.zones[k], 0.0001)};background:${c}"></div>`).join('');
    const rows = Z.map(([k, l, rg, c, goal]) => `<div class="trZ"><i style="background:${c}"></i><span><b>${l}</b> <span class="muted">${rg}</span><br><span class="muted trGoal">цель ${goal}</span></span><b class="trPct" style="color:${k === 'inr' ? c : ''}">${Math.round(T.zones[k])}%</b></div>`).join('');
    return `<div class="trTir"><div class="trBar">${bar}</div><div class="trRows">${rows}</div></div>`;
  }

  function agpSvg(T, W, H, dark) {
    const pl = 26, pr = 6, pt = 8, pb = 22, ymax = Math.max(16, Math.ceil(Math.max(...T.agp.filter(Boolean).map(v => v[4])) + 1));
    const X = i => pl + i / 96 * (W - pl - pr), Y = g => pt + (1 - g / ymax) * (H - pt - pb);
    const C = dark ? { grid: '#243341', lbl: '#94a3b8', band: '#14532d', o: '.45', p95: '#1e3a5f', p25: '#2b5c8f', med: '#60a5fa' } : { grid: '#e2e8f0', lbl: '#64748b', band: '#dcfce7', o: '.8', p95: '#dbeafe', p25: '#93c5fd', med: '#1d4ed8' };
    let s = `<rect x="${pl}" y="${Y(10)}" width="${W - pl - pr}" height="${Y(3.9) - Y(10)}" fill="${C.band}" opacity="${C.o}"/>`;
    for (let g = 4; g <= ymax; g += 4) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(g)}" y2="${Y(g)}" stroke="${C.grid}"/><text x="${pl - 4}" y="${Y(g) + 4}" font-size="11" text-anchor="end" fill="${C.lbl}">${g}</text>`;
    for (let h = 0; h <= 24; h += 3) { const x = X(h * 4); s += `<line x1="${x}" x2="${x}" y1="${pt}" y2="${H - pb}" stroke="${C.grid}"/><text x="${x}" y="${H - 6}" font-size="11" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}" fill="${C.lbl}">${p2(h % 24)}:00</text>` }
    const area = (lo, hi) => { const seg = []; let cur = []; T.agp.forEach((v, i) => { if (v) cur.push([i, v]); else if (cur.length) { seg.push(cur); cur = [] } }); if (cur.length) seg.push(cur);
      return seg.map(c => 'M' + c.map(([i, v]) => X(i + .5).toFixed(1) + ',' + Y(v[hi]).toFixed(1)).join('L') + 'L' + c.slice().reverse().map(([i, v]) => X(i + .5).toFixed(1) + ',' + Y(v[lo]).toFixed(1)).join('L') + 'Z').join('') };
    const line = j => { let d = '', pen = false; T.agp.forEach((v, i) => { if (!v) { pen = false; return } d += (pen ? 'L' : 'M') + X(i + .5).toFixed(1) + ',' + Y(v[j]).toFixed(1); pen = true }); return d };
    s += `<path d="${area(0, 4)}" fill="${C.p95}" opacity=".9"/><path d="${area(1, 3)}" fill="${C.p25}" opacity=".9"/><path d="${line(2)}" fill="none" stroke="${C.med}" stroke-width="2.4"/>`;
    s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(3.9)}" y2="${Y(3.9)}" stroke="#ef4444" stroke-dasharray="4 4"/><line x1="${pl}" x2="${W - pr}" y1="${Y(10)}" y2="${Y(10)}" stroke="#f59e0b" stroke-dasharray="4 4"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${s}</svg><div class="trLegend"><span><i style="background:${C.med}"></i>медиана</span><span><i style="background:${C.p25}"></i>обычно (25–75%)</span><span><i style="background:${C.p95}"></i>изредка (5–95%)</span></div>`;
  }

  function overlaySvg(T, sel, W, H, dark) {
    const pl = 26, pr = 6, pt = 8, pb = 22, keys = Object.keys(T.byDay).sort();
    const ymax = Math.max(16, Math.ceil(T.max + 1)), X = m => pl + m / 1440 * (W - pl - pr), Y = g => pt + (1 - g / ymax) * (H - pt - pb);
    const grid = dark ? '#243341' : '#e2e8f0', lbl = dark ? '#94a3b8' : '#64748b';
    let s = `<rect x="${pl}" y="${Y(10)}" width="${W - pl - pr}" height="${Y(3.9) - Y(10)}" fill="${dark ? '#14532d' : '#dcfce7'}" opacity="${dark ? .45 : .8}"/>`;
    for (let g = 4; g <= ymax; g += 4) s += `<line x1="${pl}" x2="${W - pr}" y1="${Y(g)}" y2="${Y(g)}" stroke="${grid}"/><text x="${pl - 4}" y="${Y(g) + 4}" font-size="11" text-anchor="end" fill="${lbl}">${g}</text>`;
    for (let h = 0; h <= 24; h += 3) { const x = X(h * 60); s += `<line x1="${x}" x2="${x}" y1="${pt}" y2="${H - pb}" stroke="${grid}"/><text x="${x}" y="${H - 6}" font-size="11" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}" fill="${lbl}">${p2(h % 24)}:00</text>` }
    keys.forEach((k, i) => { if (!sel.has(k)) return; let d = '', prev = null; T.byDay[k].forEach(p => { const dt = new Date(p.t), m = dt.getHours() * 60 + dt.getMinutes() + dt.getSeconds() / 60, gap = prev && p.t - prev.t > 15 * 60e3; d += (d === '' || gap ? 'M' : 'L') + X(m).toFixed(1) + ',' + Y(p.g).toFixed(1); prev = p }); s += `<path d="${d}" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="1.6" opacity=".9"/>` });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${s}</svg>`;
  }
  function overlayLegend(T, sel) {
    const keys = Object.keys(T.byDay).sort().reverse(), all = Object.keys(T.byDay).sort();
    return `<div class="trDays">${keys.map(k => `<label class="trDay"><input type="checkbox" ${sel.has(k) ? 'checked' : ''} onchange="DMTrends.toggleDay('${k}',this.checked)"><i style="background:${COLORS[all.indexOf(k) % COLORS.length]}"></i>${dm(k)}</label>`).join('')}</div><div class="trDayBtns"><button class="btn small secondary" onclick="DMTrends.days('all')">Выбрать все</button><button class="btn small secondary" onclick="DMTrends.days('none')">Снять все</button></div>`;
  }

  function summaryHtml(T) {
    const cvOk = T.cv <= 36, [lr, lc] = riskL(T.lbgi), [hr, hc] = riskH(T.hbgi);
    const S = (l, v, sub, c) => `<div class="trS"><span>${l}</span><b${c ? ` style="color:${c}"` : ''}>${v}</b><small>${sub}</small></div>`;
    return `<div class="trSum">${S('Среднее', f1(T.mean), 'ммоль/л')}${S('HbA1c по сенсору', '≈ ' + f1(T.gmi) + '%', 'GMI')}${S('Вариабельность', Math.round(T.cv) + '%', cvOk ? 'стабильно (цель ≤ 36%)' : 'скачет (цель ≤ 36%)', cvOk ? '#16a34a' : '#d97706')}${S('Покрытие сенсором', Math.round(T.cover) + '%', T.cover >= 70 ? 'данных достаточно' : 'мало данных (нужно ≥ 70%)', T.cover >= 70 ? '' : '#d97706')}${S('Риск гипо (LBGI)', f1(T.lbgi), lr, lc)}${S('Риск гипер (HBGI)', f1(T.hbgi), hr, hc)}</div>`;
  }

  /* ---- вкладка «Тенденции» в окне графика ---- */
  let days = 14, T = null, sel = new Set(), loading = false, tok = 0;
  const dark = () => !!document.querySelector('.cgmBigBox.dark');
  async function load(host) {
    const my = ++tok; loading = true; render(host);
    const to = new Date(), from = new Date(Date.now() - (days - 1) * 864e5);
    try { const r = await DMCgm.period(dkey(+from), dkey(+to)); if (my !== tok) return; T = compute((r && r.raw) || [], days) } catch (e) { T = null }
    if (T) { const k = Object.keys(T.byDay).sort(); sel = new Set(k.slice(-Math.min(7, k.length))) }
    loading = false; render(host);
  }
  function render(host) {
    host = host || document.getElementById('cgmBigTrends'); if (!host) return;
    const per = [7, 14, 30].map(d => `<button class="btn small ${d === days ? '' : 'secondary'}" onclick="DMTrends.period(${d})">${d} дней</button>`).join('');
    if (loading) { host.innerHTML = `<div class="trPer">${per}</div><div class="muted" style="padding:30px;text-align:center">Считаю показатели…</div>`; return }
    if (!T) { host.innerHTML = `<div class="trPer">${per}</div><div class="muted" style="padding:30px;text-align:center">Мало данных сенсора за этот период.</div>`; return }
    const W = Math.max(300, Math.min(1000, host.clientWidth - 4)), H = W < 600 ? 220 : 280, dk = dark();
    host.innerHTML = `<div class="trPer">${per}</div>${summaryHtml(T)}
<h4 class="trH">Время в диапазонах</h4>${tirHtml(T, dk)}
<h4 class="trH">Профиль по времени суток (AGP)</h4><div class="muted trNote">Все дни периода сложены в одни сутки: видно, в какие часы сахар обычно выше или ниже.</div>${agpSvg(T, W, H, dk)}
<h4 class="trH">Дни поверх друг друга</h4>${overlaySvg(T, sel, W, H, dk)}${overlayLegend(T, sel)}
<div class="muted trNote" style="margin-top:10px">Нормы — международный консенсус по сенсорам (2019). Показатели справочные, решения — с врачом.</div>`;
  }
  window.DMTrends = {
    compute, tirHtml, agpSvg, summaryHtml, load, render,
    period(d) { days = d; load() },
    toggleDay(k, on) { if (on) sel.add(k); else sel.delete(k); render() },
    days(m) { if (!T) return; sel = m === 'all' ? new Set(Object.keys(T.byDay)) : new Set(); render() }
  };
})();
