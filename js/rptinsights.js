/* v64.119: дополнительные разделы «Отчёта для врача» по данным сенсора:
 * эпизоды гипогликемии, ночь и сахар натощак, профиль по часам суток (AGP), нагрузка и сахар, качество данных.
 * Всё описательное: цифры из записей семьи; выводов о дозах и лечении здесь нет. Данные: G.raw — показания сенсора [{t,g}], t в мс. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const pad = n => String(n).padStart(2, '0');
  const dk = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) };
  const dmy = d => d.split('-').reverse().slice(0, 2).join('.');
  const ts = (date, min) => new Date(date + 'T00:00:00').getTime() + min * 60e3;
  const mins = s => { const [h, m] = String(s).split(':'); return (+h || 0) * 60 + (+m || 0) };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const TBL = (head, rows) => `<table class="rptTbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const KV = rows => '<div class="rptKV">' + rows.filter(r => r && r[1] !== undefined && r[1] !== '').map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('') + '</div>';
  const NOTE = t => `<p class="muted" style="font-size:12px;margin:6px 0">${t}</p>`;
  const quant = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) };
  const inR = (raw, a, b) => raw.filter(x => x.t >= a && x.t <= b);

  function prep(G, rg) {
    const from = ts(rg.start, 0), to = ts(rg.end, 24 * 60);
    const raw = ((G && G.raw) || []).filter(x => x.t >= from && x.t < to && Number.isFinite(x.g)).sort((a, b) => a.t - b.t);
    return { raw, from, to, days: Math.max(1, Math.round((to - from) / 864e5)) };
  }

  /* ---------- 1. эпизоды гипогликемии ---------- */
  function episodes(raw) {
    const ep = []; let cur = null;
    raw.forEach(x => {
      if (x.g < 3.9) { if (cur && x.t - cur.last <= 15 * 60e3) { cur.last = x.t; cur.min = Math.min(cur.min, x.g) } else { if (cur) ep.push(cur); cur = { first: x.t, last: x.t, min: x.g } } }
      else if (cur && x.t - cur.last > 15 * 60e3) { ep.push(cur); cur = null }
      else if (cur) { ep.push(cur); cur = null }
    });
    if (cur) ep.push(cur);
    return ep.map(e => ({ ...e, dur: Math.round((e.last - e.first) / 60e3) + 5 }));
  }
  function mealBefore(t) {
    let best = null;
    [dk(t), dk(t - 864e5)].forEach(d => { const menu = (db.menus || {})[d]; if (!menu) return; Object.entries(menu).forEach(([meal, arr]) => {
      if (!Array.isArray(arr) || !arr.length) return; let m; try { m = mealTime(d, meal) } catch (e) { return }
      const tt = ts(d, m.min); if (tt <= t && t - tt <= 3 * 3600e3 && (!best || tt > best.tt)) {
        const c = arr.reduce((s, it) => { const f = db.foods.find(x => x.id === it.foodId); return s + (f ? f.c * (+it.g || 0) / 100 : 0) }, 0);
        best = { tt, meal, c } } }) });
    return best;
  }
  function hypo(G, rg) {
    const { raw, days } = prep(G, rg); if (raw.length < 50) return '';
    const ep = episodes(raw), long = ep.filter(e => e.dur >= 15), low30 = ep.filter(e => e.min < 3.0);
    const tbr = raw.filter(x => x.g < 3.9).length / raw.length * 100;
    const ins = (db.medical?.actualInsulinLog || []).filter(x => x.date && x.time && x.type !== 'Базальный').map(x => ({ t: ts(x.date, mins(x.time)), u: +x.units || 0 }));
    const acts = (db.activity || []).filter(x => x.date && x.time && +x.minutes > 0).map(x => ({ s: ts(x.date, mins(x.time)), e: ts(x.date, mins(x.time) + (+x.minutes)), type: x.type || 'нагрузка', m: +x.minutes }));
    let h = KV([['Эпизодов ниже 3,9', `<b>${ep.length}</b> за ${days} дн. <span class="muted">(длительностью от 15 минут: ${long.length})</span>`], ['Ниже 3,0', low30.length ? `<b>${low30.length}</b>` : 'не было'], ['Время ниже 3,9', f1(tbr) + '% показаний']]);
    if (!ep.length) return h + NOTE('За период показаний ниже 3,9 по данным сенсора не было.');
    h += TBL(['Когда', 'Длит.', 'Мин.', 'Что было перед этим'], ep.slice().sort((a, b) => a.first - b.first).map(e => {
      const night = new Date(e.first).getHours() < 6;
      const u = ins.filter(i => i.t <= e.first && e.first - i.t <= 3 * 3600e3), us = u.reduce((s, i) => s + i.u, 0), mb = mealBefore(e.first);
      const ac = acts.filter(a => a.e <= e.first + 3600e3 && e.first - a.s <= 6 * 3600e3);
      const ctx = [us ? `болюс за 3 ч: ${f1(us)} ЕД` : 'болюса за 3 ч не записано', mb ? `${esc(mb.meal.toLowerCase())} в ${hm(mb.tt)} (У ${Math.round(mb.c)} г)` : '', ac.length ? 'нагрузка: ' + ac.map(a => esc(a.type) + ' ' + a.m + ' мин').join(', ') : ''].filter(Boolean).join('; ');
      return [`${dmy(dk(e.first))} ${hm(e.first)}${night ? ' <span class="muted">(ночь)</span>' : ''}`, e.dur + ' мин', `<b>${f1(e.min)}</b>`, ctx];
    }));
    return h + NOTE('Эпизод — последовательные показания сенсора ниже 3,9. Для коротких эпизодов (5–10 минут) возможна погрешность сенсора, сверяйте с глюкометром. Контекст собран из записей приложения и может быть неполным.');
  }

  /* ---------- 2. ночь и сахар натощак ---------- */
  function night(G, rg) {
    const { raw } = prep(G, rg); if (raw.length < 50) return '';
    const byDay = {}; raw.forEach(x => { const d = dk(x.t); (byDay[d] = byDay[d] || []).push(x) });
    const rows = []; Object.keys(byDay).sort().forEach(d => {
      const n = byDay[d].filter(x => new Date(x.t).getHours() < 6); if (n.length < 20) return;
      const g = n.map(x => x.g), first = avg(g.slice(0, Math.max(3, Math.round(g.length / 6)))), last = avg(g.slice(-Math.max(3, Math.round(g.length / 6))));
      let fast = null; const menu = (db.menus || {})[d]; const bt = menu && Object.entries(menu).filter(([, a]) => Array.isArray(a) && a.length).map(([m]) => { try { return ts(d, mealTime(d, m).min) } catch (e) { return null } }).filter(Boolean).sort((a, b) => a - b)[0];
      const refT = bt || ts(d, 7 * 60), before = byDay[d].filter(x => x.t <= refT && refT - x.t <= 40 * 60e3).pop();
      if (before) fast = before.g;
      rows.push({ d, min: Math.min(...g), mean: avg(g), max: Math.max(...g), delta: last - first, fast, low: g.some(v => v < 3.9) });
    });
    if (rows.length < 2) return NOTE('Для разбора ночей нужны данные сенсора минимум за две ночи.');
    const lows = rows.filter(r => r.low).length, fs = rows.map(r => r.fast).filter(Number.isFinite);
    let h = KV([['Ночей разобрано', rows.length], ['Средняя ночная глюкоза (00–06)', `<b>${f1(avg(rows.map(r => r.mean)))} ммоль/л</b>`], ['Ночей с показаниями ниже 3,9', lows ? `<b>${lows}</b>` : 'не было'], ['Изменение за ночь (конец минус начало)', `${avg(rows.map(r => r.delta)) >= 0 ? '+' : ''}${f1(avg(rows.map(r => r.delta)))} ммоль/л в среднем`], fs.length ? ['Сахар перед первой едой / в 7 утра', `<b>${f1(avg(fs))}</b> в среднем (${f1(Math.min(...fs))}–${f1(Math.max(...fs))})`] : null]);
    h += TBL(['Ночь', 'Мин.', 'Средняя', 'Макс.', 'К утру', 'Перед завтраком'], rows.map(r => [dmy(r.d), r.min < 3.9 ? `<b>${f1(r.min)}</b>` : f1(r.min), f1(r.mean), f1(r.max), (r.delta >= 0 ? '+' : '') + f1(r.delta), r.fast != null ? f1(r.fast) : '—']));
    return h + NOTE('Ночь — показания с 00:00 до 06:00 суток, указанных в строке. «К утру» — среднее последней шестой части ночи минус первой. Для оценки базального инсулина решение принимает врач.');
  }

  /* ---------- 3. профиль по часам суток (AGP) ---------- */
  function agp(G, rg) {
    const { raw, days } = prep(G, rg); const dd = new Set(raw.map(x => dk(x.t))).size;
    if (raw.length < 300 || dd < 3) return NOTE('Для профиля по часам суток нужны данные сенсора минимум за 3 дня.');
    const hours = Array.from({ length: 24 }, () => []); raw.forEach(x => hours[new Date(x.t).getHours()].push(x.g));
    const P = hours.map(a => ({ p10: quant(a, .1), p25: quant(a, .25), p50: quant(a, .5), p75: quant(a, .75), p90: quant(a, .9) }));
    const W = 640, H = 230, pl = 30, pr = 8, pt = 10, pb = 24, ymin = 2, ymax = Math.max(16, Math.ceil(Math.max(...P.map(p => p.p90)) + 1));
    const X = h => pl + (h + .5) / 24 * (W - pl - pr), Y = g => pt + (1 - (g - ymin) / (ymax - ymin)) * (H - pt - pb);
    const poly = (a, b) => 'M' + P.map((p, h) => X(h).toFixed(1) + ',' + Y(p[a]).toFixed(1)).join('L') + 'L' + P.map((p, h) => [X(23 - h).toFixed(1), Y(P[23 - h][b]).toFixed(1)]).map(z => z.join(',')).join('L') + 'Z';
    let g = ''; for (let v = 4; v <= ymax; v += 4) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e2e8f0"/><text x="${pl - 4}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#64748b">${v}</text>`;
    for (let h = 0; h < 24; h += 3) g += `<line x1="${X(h) - (W - pl - pr) / 48}" x2="${X(h) - (W - pl - pr) / 48}" y1="${pt}" y2="${H - pb}" stroke="#eef2f7"/><text x="${X(h) - (W - pl - pr) / 48}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#64748b">${pad(h)}</text>`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:720px"><rect x="${pl}" y="${Y(10)}" width="${W - pl - pr}" height="${Y(3.9) - Y(10)}" fill="#dcfce7" opacity=".7"/>${g}<path d="${poly('p10', 'p90')}" fill="#99f6e4" opacity=".55"/><path d="${poly('p25', 'p75')}" fill="#2dd4bf" opacity=".6"/><path d="M${P.map((p, h) => X(h).toFixed(1) + ',' + Y(p.p50).toFixed(1)).join('L')}" fill="none" stroke="#0f766e" stroke-width="2.4"/></svg>`;
    const worst = P.map((p, h) => ({ h, v: p.p50 })).sort((a, b) => b.v - a.v)[0], best = P.map((p, h) => ({ h, v: p.p50 })).sort((a, b) => a.v - b.v)[0];
    const lowH = P.map((p, h) => ({ h, v: p.p10 })).filter(x => x.v < 3.9).map(x => pad(x.h) + ':00');
    return `<div style="margin:6px 0">${svg}</div>` + NOTE(`Линия — медиана, тёмная полоса — 25–75% показаний, светлая — 10–90%, зелёная зона — 3,9–10. За ${dd} дн. данных.`) +
      KV([['Самый высокий час (медиана)', `${pad(worst.h)}:00 — ${f1(worst.v)} ммоль/л`], ['Самый низкий час (медиана)', `${pad(best.h)}:00 — ${f1(best.v)} ммоль/л`], lowH.length ? ['Часы, где 10% показаний ниже 3,9', lowH.join(', ')] : null]);
  }

  /* ---------- 4. нагрузка и сахар ---------- */
  function exercise(G, rg) {
    const { raw, from, to } = prep(G, rg);
    const acts = (db.activity || []).filter(x => x.date >= rg.start && x.date <= rg.end).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    if (!acts.length) return '';
    const rows = acts.map(a => {
      if (!a.time || !(+a.minutes > 0)) return [dmy(a.date), esc(a.type || '—'), a.minutes || '—', '—', '—', '—', '—', 'время начала не указано'];
      const s = ts(a.date, mins(a.time)), e = s + (+a.minutes) * 60e3;
      const bef = raw.filter(x => x.t <= s && s - x.t <= 30 * 60e3).pop(), dur = inR(raw, s, e), a6 = inR(raw, e, e + 6 * 3600e3), a12 = inR(raw, e + 6 * 3600e3, e + 12 * 3600e3);
      const rng = v => v.length ? `${f1(Math.min(...v.map(x => x.g)))}–${f1(Math.max(...v.map(x => x.g)))}` : null;
      const cov = dur.length * 5 / Math.max(1, +a.minutes), notes = [];
      if (!dur.length) notes.push('<b>во время нагрузки данных сенсора нет</b>'); else if (cov < .5) notes.push('данных сенсора за время нагрузки мало');
      if (a6.length && Math.min(...a6.map(x => x.g)) < 3.9) notes.push('<b>ниже 3,9 в первые 6 ч после</b>');
      if (a12.length && Math.min(...a12.map(x => x.g)) < 3.9) notes.push('<b>ниже 3,9 через 6–12 ч после</b>');
      return [dmy(a.date) + ' ' + esc(a.time), esc(a.type || '—'), a.minutes, bef ? f1(bef.g) : '—', rng(dur) || '—', a6.length ? f1(Math.min(...a6.map(x => x.g))) : '—', a12.length ? f1(Math.min(...a12.map(x => x.g))) : '—', notes.join('; ')];
    });
    let h = TBL(['Когда', 'Вид', 'Мин.', 'До', 'Во время', 'Мин. 0–6 ч после', 'Мин. 6–12 ч после', 'Примечание'], rows);
    const actDays = new Set(acts.map(a => a.date)), nightMin = d => { const n = inR(raw, ts(d, 24 * 60), ts(d, 24 * 60 + 360)); return n.length > 20 ? Math.min(...n.map(x => x.g)) : null };
    const days = []; for (let t = from; t < to; t += 864e5) days.push(dk(t + 3600e3));
    const A = days.filter(d => actDays.has(d)).map(nightMin).filter(v => v != null), B = days.filter(d => !actDays.has(d)).map(nightMin).filter(v => v != null);
    if (A.length >= 2 && B.length >= 2) h += KV([['Ночной минимум после дней с нагрузкой', `${f1(avg(A))} ммоль/л в среднем (${A.length} дн.)`], ['Ночной минимум после дней без нагрузки', `${f1(avg(B))} ммоль/л в среднем (${B.length} дн.)`]]);
    return h + NOTE('«Во время» — минимум и максимум показаний сенсора за время нагрузки, «после» — самое низкое значение. Если данных сенсора во время нагрузки нет, возможно, телефон был вне зоны Bluetooth сенсора.');
  }

  /* ---------- 5. качество данных ---------- */
  function quality(G, rg) {
    const { raw, from, to, days } = prep(G, rg); if (!raw.length) return '';
    const slots = new Set(raw.map(x => Math.floor(x.t / 300e3))); const nowT = Math.max(raw[raw.length - 1].t, Math.min(to, Date.now()));
    const total = Math.max(1, Math.round((nowT - Math.max(from, raw[0].t)) / 300e3)), cover = Math.min(100, slots.size / total * 100);
    const gaps = []; for (let i = 1; i < raw.length; i++) { const d = raw[i].t - raw[i - 1].t; if (d > 20 * 60e3) gaps.push({ a: raw[i - 1].t, b: raw[i].t, min: Math.round(d / 60e3) }) }
    const gm = (db.diary || []).filter(x => x.date >= rg.start && x.date <= rg.end && Number.isFinite(+x.g) && x.time && x.src !== 'cgm' && !String(x.note || '').startsWith('сенсор')).map(x => ({ t: ts(x.date, mins(x.time)), g: +x.g }));
    const pairs = gm.map(m => { const c = raw.reduce((b, x) => Math.abs(x.t - m.t) < Math.abs((b ? b.t : 1e15) - m.t) ? x : b, null); return c && Math.abs(c.t - m.t) <= 10 * 60e3 ? { t: m.t, gm: m.g, s: c.g } : null }).filter(Boolean);
    let h = KV([['Показаний сенсора', raw.length.toLocaleString('ru-RU')], ['Покрытие периода', `<b>${Math.round(cover)}%</b> <span class="muted">(доля 5-минутных интервалов с показанием)</span>`], ['Пропусков дольше 20 минут', gaps.length ? `<b>${gaps.length}</b>, суммарно ${f1(gaps.reduce((s, g) => s + g.min, 0) / 60)} ч` : 'не было']]);
    if (gaps.length) h += TBL(['Пропуск', 'Длительность'], gaps.sort((a, b) => b.min - a.min).slice(0, 8).sort((a, b) => a.a - b.a).map(g => [`${dmy(dk(g.a))} ${hm(g.a)} → ${dk(g.a) === dk(g.b) ? '' : dmy(dk(g.b)) + ' '}${hm(g.b)}`, g.min >= 60 ? Math.floor(g.min / 60) + ' ч ' + (g.min % 60) + ' мин' : g.min + ' мин']));
    if (pairs.length) h += KV([['Сверка с глюкометром', `${pairs.length} сравнений, в среднем отличие <b>${f1(avg(pairs.map(p => Math.abs(p.gm - p.s))))} ммоль/л</b> (глюкометр ${pairs.length ? (avg(pairs.map(p => p.gm - p.s)) >= 0 ? 'выше' : 'ниже') : ''} сенсора на ${f1(Math.abs(avg(pairs.map(p => p.gm - p.s))))})`]]);
    return h + NOTE('Большие пропуски занижают точность средних значений и GMI. Причины пропусков (связь телефона с сенсором, интернет, смена сенсора) приложение не определяет.');
  }

  function sections(G, rg) {
    const out = [], add = (title, fn) => { try { const h = fn(G, rg); if (h) out.push([title, h]) } catch (e) {} };
    add('Эпизоды гипогликемии', hypo); add('Сахар ночью и натощак', night); add('Профиль сахара по часам суток (AGP)', agp); add('Качество данных сенсора', quality);
    return out;
  }
  window.DMRptIns = { sections, exercise, hypo, night, agp, quality, episodes };
})();
