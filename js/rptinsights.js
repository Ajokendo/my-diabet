/* v64.119: дополнительные разделы «Отчёта для врача» по данным сенсора:
 * эпизоды гипогликемии, ночь и сахар натощак, профиль по часам суток (AGP), нагрузка и сахар, качество данных.
 * Всё описательное: цифры из записей семьи; выводов о дозах и лечении здесь нет. Данные: G.raw — показания сенсора [{t,g}], t в мс. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const sg = v => (v < 0 ? '−' : '+') + f1(Math.abs(v));
  const pad = n => String(n).padStart(2, '0');
  const dk = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) };
  const dmy = d => d.split('-').reverse().slice(0, 2).join('.');
  const ts = (date, min) => new Date(date + 'T00:00:00').getTime() + min * 60e3;
  const mins = s => { const [h, m] = String(s).split(':'); return (+h || 0) * 60 + (+m || 0) };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const TBL = (head, rows) => `<table class="rptTbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const TWO = (head, rows) => TBL(head, rows).replace('class="rptTbl"', 'class="rptTbl rt2"');
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
  const PT = t => `<p class="rptTxt">${t}</p>`;
  const sgn = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));
  function nightRows(raw) {
    const byDay = {}; raw.forEach(x => { const d = dk(x.t); (byDay[d] = byDay[d] || []).push(x) });
    const rows = []; Object.keys(byDay).sort().forEach(d => {
      const n = byDay[d].filter(x => new Date(x.t).getHours() < 6); if (n.length < 20) return;
      const g = n.map(x => x.g), k = Math.max(3, Math.round(g.length / 6)), first = avg(g.slice(0, k)), last = avg(g.slice(-k));
      let fast = null; const menu = (db.menus || {})[d]; const bt = menu && Object.entries(menu).filter(([, a]) => Array.isArray(a) && a.length).map(([m]) => { try { return ts(d, mealTime(d, m).min) } catch (e) { return null } }).filter(Boolean).sort((a, b) => a - b)[0];
      const refT = bt || ts(d, 7 * 60), before = byDay[d].filter(x => x.t <= refT && refT - x.t <= 40 * 60e3).pop();
      if (before) fast = before.g;
      const lo = n.reduce((b, x) => x.g < b.g ? x : b, n[0]);
      const hp = n.reduce((b, x) => x.g > b.g ? x : b, n[0]);
      rows.push({ d, pts: n, min: lo.g, minT: lo.t, maxT: hp.t, mean: avg(g), max: Math.max(...g), delta: last - first, fast, low: lo.g < 3.9, hi: Math.max(...g) > 10 });
    });
    return rows;
  }
  function night(G, rg) {
    const { raw } = prep(G, rg); if (raw.length < 50) return '';
    const rows = nightRows(raw);
    if (rows.length < 2) return NOTE('Для разбора ночей нужны данные сенсора минимум за две ночи.');
    /* описание */
    const lows = rows.filter(r => r.low), highs = rows.filter(r => r.hi), mean = avg(rows.map(r => r.mean)), dl = avg(rows.map(r => r.delta));
    const stable = rows.filter(r => !r.low && !r.hi).length;
    const trend = Math.abs(dl) < 0.7 ? 'к утру сахар в среднем держится на одном уровне' : dl > 0 ? `к утру сахар в среднем растёт (${sgn(dl)} ммоль/л от начала к концу ночи)` : `к утру сахар в среднем снижается (${sgn(dl)} ммоль/л от начала к концу ночи)`;
    const fs = rows.map(r => r.fast).filter(Number.isFinite), fin = fs.filter(v => v >= 3.9 && v <= 10).length;
    let t1 = `Разобрано ночей: ${rows.length} (показания с 00:00 до 06:00). Средняя ночная глюкоза — ${f1(mean)} ммоль/л; ${trend}. ` +
      (stable === rows.length ? 'Во все ночи сахар оставался в диапазоне 3,9–10.' : `В диапазоне 3,9–10 весь период ночи прошли ${stable} из ${rows.length} ночей.`);
    if (fs.length >= 3) t1 += ` Перед первым приёмом пищи (или в 07:00, если приёмов нет) сахар составлял в среднем ${f1(avg(fs))} (от ${f1(Math.min(...fs))} до ${f1(Math.max(...fs))}); в диапазоне — в ${fin} из ${fs.length} дней.`;
    const N = rows.length, pc = v => Math.round(v / N * 100) + '%', hrs = (arr, f) => { if (arr.length < 3) return ''; const b = [0, 0, 0]; arr.forEach(r => b[Math.min(2, Math.floor(new Date(f(r)).getHours() / 2))]++); const L = ['00:00–02:00', '02:00–04:00', '04:00–06:00'], k = b.indexOf(Math.max(...b)); return b[k] >= Math.ceil(arr.length / 2) ? `; чаще всего в промежутке ${L[k]} (${b[k]} из ${arr.length})` : '; в разное время ночи' };
    const an = [];
    if (lows.length) {
      const vlow = lows.filter(r => r.min < 3.0).length;
      an.push(`Снижение ниже 3,9 было в ${lows.length} из ${N} ночей (${pc(lows.length)}), самое низкое значение — ${f1(Math.min(...lows.map(r => r.min)))}${vlow ? `, ниже 3,0 — в ${vlow}` : ''}${hrs(lows, r => r.minT)}`);
    }
    if (highs.length) {
      const h139 = highs.filter(r => r.max > 13.9).length;
      an.push(`Подъём выше 10 был в ${highs.length} из ${N} ночей (${pc(highs.length)}), максимум — ${f1(Math.max(...highs.map(r => r.max)))}${h139 ? `, выше 13,9 — в ${h139}` : ''}${hrs(highs, r => r.maxT)}`);
    }
    const up = rows.filter(r => r.delta >= 3).length, dn = rows.filter(r => r.delta <= -3).length;
    if (up || dn) an.push(`Заметный дрейф к утру (на 3 и более): ${[up ? 'вверх — в ' + up + ' ночах' : '', dn ? 'вниз — в ' + dn + ' ночах' : ''].filter(Boolean).join(', ')}`);
    const t2 = an.length ? an.join('. ') + '.' : 'Заметных отклонений (ниже 3,9, выше 10 или резкого дрейфа к утру) не было.';
    return PT(t1) + PT(t2) + NOTE('Описание составлено приложением по данным сенсора и не является оценкой дозы базального инсулина — это решение врача. Время — час, когда в эту ночь был самый низкий (или самый высокий) сахар.');
  }



  /* ---------- питание: «Чаще всего» и «По дням» ---------- */
  function topList(top) {
    if (!top || !top.length) return '';
    const mx = Math.max(...top.map(x => x[1]));
    return '<div class="rptTop">' + top.map(([n, c], i) => `<div class="rtN">${i + 1}</div><div class="rtT">${esc(n)}</div><div class="rtB"><i style="width:${Math.max(4, c / mx * 100)}%"></i></div><div class="rtC">${c}</div>`).join('') + '</div>';
  }
  function foodDays(rows) {
    if (!rows || !rows.length) return '';
    const XE = +(db.settings && db.settings.xe) || 12, G = ['Завтрак', 'Обед', 'Ужин', 'Перекусы'], COL = { 'Завтрак': '#2dd4bf', 'Обед': '#3b82f6', 'Ужин': '#8b5cf6', 'Перекусы': '#f59e0b' };
    const f1x = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
    let list = rows.map(([d, x]) => ({ d, by: Object.fromEntries(G.map(g => [g, ((x.by || {})[g] || 0) / XE])), n: x.count })), weekly = list.length > 31;
    if (weekly) {
      const wk = {}; list.forEach(r => { const t = new Date(r.d + 'T12:00:00'), dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); (wk[dk(t.getTime())] = wk[dk(t.getTime())] || []).push(r) });
      list = Object.keys(wk).sort().map(k => ({ d: k, by: Object.fromEntries(G.map(g => [g, avg(wk[k].map(r => r.by[g]))])), n: avg(wk[k].map(r => r.n)) }));
    }
    list.forEach(r => r.t = G.reduce((a, g) => a + r.by[g], 0));
    const n = list.length, W = 640, H = 250, pl = 34, pr = 14, pt = 22, pb = 26, mt = Math.max(...list.map(r => r.t));
    const stp = mt > 24 ? 5 : mt > 12 ? 4 : 2, mc = Math.max(stp * 2, Math.ceil(mt / stp) * stp), bw = Math.min(34, (W - pl - pr) / n * 0.65);
    const X = i => pl + (i + .5) / n * (W - pl - pr), Y = v => pt + (1 - v / mc) * (H - pt - pb);
    let g = ''; for (let v = 0; v <= mc; v += stp) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e2e8f0"/><text x="${pl - 4}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#475569">${v}</text>`;
    const step = n > 20 ? 3 : n > 12 ? 2 : 1, mean = avg(list.map(r => r.t));
    const bars = list.map((r, i) => { let acc = 0, s = ''; G.forEach(gr => { const v = r.by[gr]; if (v <= 0) return; s += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(Y(acc) - Y(acc + v)).toFixed(1)}" fill="${COL[gr]}"/>`; acc += v });
      return s + (n <= 16 ? `<text x="${X(i).toFixed(1)}" y="${(Y(r.t) - 4).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#0f172a">${n <= 10 ? f1x(r.t) : Math.round(r.t)}</text>` : '') + (i % step === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#64748b">${dmy(r.d)}</text>` : '') }).join('');
    const ml = `<line x1="${pl}" x2="${W - pr}" y1="${Y(mean).toFixed(1)}" y2="${Y(mean).toFixed(1)}" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${W - pr}" y="${(Y(mean) - 4).toFixed(1)}" font-size="10" font-weight="700" text-anchor="end" fill="#0f172a">среднее ${f1x(mean)}</text>`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:720px">${g}${bars}${ml}<text x="${pl - 4}" y="12" font-size="10" text-anchor="end" fill="#475569">ХЕ</text></svg>`;
    const leg = `<p class="muted" style="font-size:12px;margin:2px 0 8px">${G.map(gr => `<b style="color:${COL[gr]}">■</b> ${gr}`).join(' · ')} · <b>- - -</b> среднее в день${weekly ? ' · среднее в день по неделям' : ''} · 1 ХЕ = ${XE} г углеводов</p>`;
    const hi = list.reduce((b, r) => r.t > b.t ? r : b, list[0]), lo = list.reduce((b, r) => r.t < b.t ? r : b, list[0]), per = G.map(gr => [gr, avg(list.map(r => r.by[gr]))]).filter(x => x[1] > 0.05);
    const txt = `${weekly ? 'В среднем в день' : 'В среднем за день'} записано ${f1x(mean)} ХЕ` + (per.length ? ` (${per.map(([gr, v]) => gr.toLowerCase() + ' ' + f1x(v)).join(', ')})` : '') + '. ' + (n > 2 ? `Больше всего — ${weekly ? 'неделя с ' : ''}${dmy(hi.d)} (${f1x(hi.t)} ХЕ), меньше всего — ${weekly ? 'неделя с ' : ''}${dmy(lo.d)} (${f1x(lo.t)} ХЕ). ` : '') + (mt > 1.6 * Math.min(...list.map(r => r.t)) ? 'Дни заметно отличаются по количеству ХЕ.' : 'Количество ХЕ по дням довольно ровное.') + ' Неполные дни (когда не всё внесено в дневник) занижают значения.';
    return svg + leg + PT(txt);
  }


  /* ---------- описательные абзацы под графиками и таблицами отчёта (v64.127) ---------- */
  const pctS = v => Math.round(v) + '%';
  const pl = (n, a, b, c) => { const m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : k === 1 ? a : (k >= 2 && k <= 4) ? b : c };
  function tirText(T) {
    if (!T) return '';
    const z = T.zones, tbr = z.low + z.vlow, tar = z.high + z.vhigh, s = [];
    s.push(`В целевом диапазоне 3,9–10 ммоль/л сахар находился ${pctS(z.inr)} времени (ориентир для диабета 1 типа — более 70%) ${z.inr >= 70 ? '— цель выполняется' : '— до цели не хватает ' + pctS(70 - z.inr)}.`);
    s.push(`Ниже 3,9 — ${f1(tbr)}% времени (ориентир — менее 4%), из них ниже 3,0 — ${f1(z.vlow)}% (ориентир — менее 1%)${tbr < 4 && z.vlow < 1 ? ': по этому показателю всё в пределах ориентиров' : tbr >= 4 ? ': низкого сахара больше рекомендованного' : ''}.`);
    s.push(`Выше 10 — ${f1(tar)}% времени (ориентир — менее 25%), из них выше 13,9 — ${f1(z.vhigh)}% (ориентир — менее 5%)${tar < 25 && z.vhigh < 5 ? ': по этому показателю всё в пределах ориентиров' : tar >= 25 ? ': высокого сахара больше рекомендованного' : ''}.`);
    s.push(`Вариабельность (CV) составляет ${Math.round(T.cv)}% — ${T.cv <= 36 ? 'в пределах цели (до 36%), сахар меняется предсказуемо' : 'выше цели (до 36%), сахар колеблется сильнее желательного'}.`);
    const lr = T.lbgi <= 1.1 ? 'минимальный' : T.lbgi <= 2.5 ? 'низкий' : T.lbgi <= 5 ? 'средний' : 'высокий', hr = T.hbgi <= 4.5 ? 'низкий' : T.hbgi <= 9 ? 'средний' : 'высокий';
    s.push(`Индексы риска: гипогликемии (LBGI) ${f1(T.lbgi)} — ${lr}, гипергликемии (HBGI) ${f1(T.hbgi)} — ${hr}.`);
    s.push(tbr >= 4 ? 'Для обсуждения с врачом приоритетная тема — время ниже 3,9: когда и после чего оно возникает (см. блоки «Главное за период», «Ночи» и AGP).' : z.inr < 70 ? 'Для обсуждения с врачом — как увеличить время в диапазоне; подробности по времени суток и продуктам даны ниже.' : 'Показатели соответствуют ориентирам; для обсуждения достаточно отдельных эпизодов, описанных ниже.');
    return PT(s.join(' '));
  }
  function agpText(T) {
    const a = T && T.agp; if (!a) return '';
    const idx = [...a.keys()].filter(i => a[i]); if (idx.length < 48) return '';
    const hh = i => pad(Math.floor(i / 4)) + ':' + pad((i % 4) * 15), med = i => a[i][2];
    const rng = arr => { const o = []; let st = null, pv = null; arr.forEach(i => { if (st === null) st = pv = i; else if (i === pv + 1) pv = i; else { o.push([st, pv]); st = pv = i } }); if (st !== null) o.push([st, pv]); return o.map(([x, y]) => hh(x) + '–' + hh(y + 1)).join(', ') };
    const per = [['ночью (00–06)', 0, 24], ['утром (06–12)', 24, 48], ['днём (12–18)', 48, 72], ['вечером (18–24)', 72, 96]].map(([n, st, e]) => { const v = idx.filter(i => i >= st && i < e); return { n, m: avg(v.map(med)), iqr: avg(v.map(i => a[i][3] - a[i][1])) } });
    const mx = idx.reduce((b, i) => med(i) > med(b) ? i : b, idx[0]), mn = idx.reduce((b, i) => med(i) < med(b) ? i : b, idx[0]);
    const hiP = per.reduce((b, x) => x.m > b.m ? x : b), loP = per.reduce((b, x) => x.m < b.m ? x : b), wide = per.reduce((b, x) => x.iqr > b.iqr ? x : b), narrow = per.reduce((b, x) => x.iqr < b.iqr ? x : b);
    const lowI = idx.filter(i => a[i][0] < 3.9), hiI = idx.filter(i => a[i][4] > 10), vhI = idx.filter(i => a[i][4] > 13.9), inBand = idx.filter(i => med(i) >= 3.9 && med(i) <= 10).length / idx.length * 100;
    const s = [];
    s.push(`Синяя линия — типичный (медианный) сахар в каждое время суток за весь период: он колебался от ${f1(med(mn))} около ${hh(mn)} до ${f1(med(mx))} около ${hh(mx)}.`);
    s.push(`По периодам суток типичный сахар такой: ${per.map(x => x.n + ' ' + f1(x.m)).join(', ')}; выше всего он ${hiP.n}, ниже всего — ${loP.n}.`);
    s.push(`Медиана находилась в целевом диапазоне 3,9–10 в ${pctS(inBand)} времени суток.`);
    s.push(`Ширина тёмной полосы (25–75% показаний) в среднем ${f1(avg(per.map(x => x.iqr)))} ммоль/л: наименее предсказуем сахар ${wide.n} (полоса ${f1(wide.iqr)}), наиболее стабилен — ${narrow.n} (${f1(narrow.iqr)}).`);
    s.push(lowI.length ? `Нижняя граница светлой полосы (самые низкие 5% показаний) уходит ниже 3,9 в часы ${rng(lowI)} — это повторяющееся время риска низкого сахара.` : 'Даже самые низкие 5% показаний не опускались ниже 3,9 ни в одно время суток.');
    s.push(hiI.length ? `Верхняя граница (самые высокие 5% показаний) выше 10 в часы ${rng(hiI)}${vhI.length ? ', выше 13,9 — в часы ' + rng(vhI) : ''}.` : 'Самые высокие 5% показаний не поднимались выше 10 ни в одно время суток.');
    s.push(lowI.length ? 'Для обсуждения с врачом: что предшествует этим часам (введённый болюс, еда, физическая нагрузка) и нужна ли коррекция схемы — это решает врач.' : hiI.length ? 'Для обсуждения с врачом: что происходит перед часами повышения (состав еды, время и доза болюса, пауза до еды) — решение о схеме принимает врач.' : 'Профиль стабилен, оснований менять что-либо по этому графику нет: достаточно продолжать наблюдение и записи.');
    return PT(s.join(' '));
  }
  function dailyText(daily, G) {
    if (!daily || daily.length < 3) return '';
    const n = daily.length, v = daily.map(x => x.v), m = avg(v), sd = Math.sqrt(avg(v.map(x => (x - m) ** 2))), d1 = x => String(x.date).slice(0, 10), dd = x => { const t = d1(x); return /^\d{4}-/.test(t) ? t.slice(8, 10) + '.' + t.slice(5, 7) : t };
    const best = daily.reduce((b, x) => Math.abs(x.v - 7) < Math.abs(b.v - 7) ? x : b), hi = daily.reduce((b, x) => x.v > b.v ? x : b), lo = daily.reduce((b, x) => x.v < b.v ? x : b);
    const inR = v.filter(x => x >= 3.9 && x <= 10).length, up = v.filter(x => x > 10).length, dn = v.filter(x => x < 3.9).length;
    let run = 0, best_run = 0; v.forEach(x => { run = (x >= 3.9 && x <= 10) ? run + 1 : 0; best_run = Math.max(best_run, run) });
    const h = Math.floor(n / 2), a1 = avg(v.slice(0, h)), a2 = avg(v.slice(n - h)), dif = a2 - a1;
    const s = [];
    s.push(`График показывает средний сахар за каждые сутки: за ${n} ${pl(n, 'день', 'дня', 'дней')} среднее значение — ${f1(m)} ммоль/л${G && G.v ? ` (расчётный HbA1c, GMI, около ${f1(G.v)}%)` : ''}.`);
    s.push(`Средний сахар за сутки лежал в целевом диапазоне 3,9–10 в ${inR} из ${n} дней${up ? ', выше 10 — в ' + up : ''}${dn ? ', ниже 3,9 — в ' + dn : ''}; самая длинная серия подряд — ${best_run} ${pl(best_run, 'день', 'дня', 'дней')}.`);
    s.push(`Самый высокий средний уровень был ${dd(hi)} (${f1(hi.v)}), самый низкий — ${dd(lo)} (${f1(lo.v)}).`);
    s.push(sd < 0.8 ? `Разброс между днями небольшой (SD ${f1(sd)}): дни похожи друг на друга, режим стабилен.` : sd < 1.5 ? `Разброс между днями умеренный (SD ${f1(sd)}): часть дней заметно отличается, стоит посмотреть, что было в «выбивающиеся» дни.` : `Разброс между днями большой (SD ${f1(sd)}): дни сильно различаются, что затрудняет подбор схемы.`);
    s.push(Math.abs(dif) < 0.5 ? `Заметной тенденции к росту или снижению нет: первая и вторая половины периода различаются меньше чем на 0,5 ммоль/л.` : dif > 0 ? `Во второй половине периода средний сахар выше на ${f1(dif)} ммоль/л, чем в первой, — тенденция к повышению.` : `Во второй половине периода средний сахар ниже на ${f1(-dif)} ммоль/л, чем в первой, — тенденция к снижению.`);
    s.push('Среднесуточное значение скрывает короткие падения и пики, поэтому день с «хорошим» средним может содержать эпизоды низкого или высокого сахара — их разбор см. в блоках «Главное за период» и AGP.');
    s.push(up >= n / 3 ? 'Для обсуждения с врачом: в дни с повышенным средним — что было с питанием, дозами и нагрузкой.' : dn ? 'Для обсуждения с врачом: дни со сниженным средним — они часто связаны с нагрузкой или избытком инсулина.' : 'Рекомендаций по изменению нет: продолжать вести записи.');
    return PT(s.join(' '));
  }
  function foodText(sums, top, meals, rows) {
    if (!meals || !meals.length) return '';
    const kc = sums.c * 4 + sums.p * 4 + sums.fat * 9 || 1, names = new Set(meals.map(x => x.name)), tot = meals.length, t3 = (top || []).slice(0, 3), t3n = t3.reduce((x, y) => x + y[1], 0);
    const s = [];
    s.push(`Питание внесено за ${rows.length} ${pl(rows.length, 'день', 'дня', 'дней')}: ${tot} позиций, ${names.size} разных продуктов и блюд.`);
    s.push(`По энергии углеводы дают около ${pctS(sums.c * 4 / kc * 100)}, белки — ${pctS(sums.p * 4 / kc * 100)}, жиры — ${pctS(sums.fat * 9 / kc * 100)}.`);
    if (t3.length) s.push(`Чаще всего в записях ${t3.map(x => esc(x[0]) + ' (' + x[1] + ')').join(', ')} — вместе это ${pctS(t3n / tot * 100)} всех позиций.`);
    s.push(names.size / tot > 0.6 ? 'Рацион разнообразный: продукты редко повторяются, поэтому влияние отдельных продуктов на сахар оценивать труднее.' : 'Рацион довольно однообразный: часть продуктов повторяется часто, и именно по ним в разделе «Как еда влияет на сахар» выводы надёжнее всего.');
    s.push('Записи отражают только внесённое в дневник; неполные дни занижают итоги, а граммовки — оценка семьи.');
    s.push('Для обсуждения с врачом или диетологом: достаточно ли белка и клетчатки в приёмах пищи с быстрым подъёмом сахара, и как распределены углеводы по приёмам в течение дня.');
    return PT(s.join(' '));
  }
  function activityText(acts) {
    if (!acts || !acts.length) return '';
    const min = acts.reduce((x, y) => x + (+y.minutes || 0), 0), days = new Set(acts.map(a => a.date)).size, by = {};
    acts.forEach(a => { const t = a.type || 'нагрузка'; by[t] = (by[t] || 0) + (+a.minutes || 0) });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]), noT = acts.filter(a => !a.time).length, s = [];
    s.push(`За период записано ${acts.length} ${pl(acts.length, 'занятие', 'занятия', 'занятий')} на ${days} ${pl(days, 'день', 'дня', 'дней')}, всего ${min} мин, в среднем ${Math.round(min / acts.length)} мин на занятие.`);
    s.push(`Больше всего времени занимает «${esc(top[0][0])}» — ${top[0][1]} мин${top.length > 1 ? ' (' + Math.round(top[0][1] / min * 100) + '% общего времени)' : ''}.`);
    s.push(noT ? `Для ${noT} из ${acts.length} записей не указано время начала, поэтому сопоставить их с сахаром нельзя.` : 'Для всех записей указано время начала, поэтому их можно сопоставить с сахаром (см. следующий раздел).');
    s.push('Физическая нагрузка может снижать сахар во время занятия и спустя несколько часов, в том числе ночью, поэтому важны записи времени и длительности.');
    s.push('Для обсуждения с врачом: как действовать в дни занятий (питание до и после, контроль сахара ночью) — конкретные меры определяет врач.');
    return PT(s.join(' '));
  }

  /* ---------- резюме «Главное за период» ---------- */
  const strip = h => String(h).replace(/<[^>]+>/g, '');
  function digest(G, rg) {
    try {
      const { raw, days } = prep(G, rg), it = [], talk = []; if (raw.length < 100) return '';
      const add = (t, x) => it.push(`<li><b>${t}</b> — ${x}</li>`);
      /* 1. в целом */
      if (G && G.n) {
        const cv = G.sd / G.mean * 100, pc = v => Math.round(v) + '%';
        add('Сахар в целом', `средняя глюкоза ${f1(G.mean)} ммоль/л, в диапазоне 3,9–10 — ${pc(G.tir)} времени (цель — выше 70%), ниже 3,9 — ${pc(G.tbr)} (цель — ниже 4%), выше 10 — ${pc(G.tar)}. Вариабельность ${Math.round(cv)}% ${cv <= 36 ? '— в пределах цели (до 36%)' : '— выше цели (до 36%)'}.`);
      }
      /* 2. гипогликемии */
      const ep = episodes(raw), ins = (db.medical?.actualInsulinLog || []).filter(x => x.date && x.time && x.type !== 'Базальный').map(x => ts(x.date, mins(x.time)));
      if (ep.length) {
        const low = ep.reduce((b, e) => e.min < b.min ? e : b, ep[0]), lng = ep.reduce((b, e) => e.dur > b.dur ? e : b, ep[0]), nt = ep.filter(e => new Date(e.first).getHours() < 6).length;
        const wb = ep.filter(e => ins.some(t => t <= e.first && e.first - t <= 3 * 3600e3)).length;
        add('Низкий сахар', `за ${days} дн. было ${ep.length} ${ep.length % 10 === 1 && ep.length % 100 !== 11 ? 'эпизод' : 'эпизодов'} ниже 3,9${nt ? ` (ночью — ${nt})` : ''}. Самый низкий — ${f1(low.min)} (${dmy(dk(low.first))} в ${hm(low.first)}), самый длинный — ${lng.dur} мин (${dmy(dk(lng.first))}). Перед ${wb} из ${ep.length} эпизодов в предыдущие 3 часа был записан болюс.`);
        talk.push(ep.length >= 3 ? 'повторяющиеся эпизоды низкого сахара и их связь с болюсами' : 'эпизоды низкого сахара');
      } else add('Низкий сахар', 'показаний ниже 3,9 за период не было.');
      /* 3. ночь */
      const nr = nightRows(raw);
      if (nr.length >= 2) {
        const nl = nr.filter(r => r.low).length, nh = nr.filter(r => r.hi).length, fs = nr.map(r => r.fast).filter(Number.isFinite);
        add('Ночи', `${nr.length} ночей: средний сахар ${f1(avg(nr.map(r => r.mean)))}; ниже 3,9 — ${nl ? nl + ' ' + (nl === 1 ? 'ночь' : 'ночи') : 'ни одной ночи'}, выше 10 — ${nh ? nh : 'ни одной'}.${fs.length >= 3 ? ` Перед первым приёмом пищи в среднем ${f1(avg(fs))} (от ${f1(Math.min(...fs))} до ${f1(Math.max(...fs))}).` : ''}`);
        if (nl) talk.push('ночное снижение сахара');
      }
      /* 4. часы суток */
      const hours = Array.from({ length: 24 }, () => []); raw.forEach(x => hours[new Date(x.t).getHours()].push(x.g));
      const med = hours.map((a, h) => ({ h, v: quant(a, .5), hi: quant(a, .9) })).filter(x => Number.isFinite(x.v));
      if (med.length > 12 && new Set(raw.map(x => dk(x.t))).size >= 3) {
        const w = med.reduce((b, x) => x.v > b.v ? x : b, med[0]), top = med.filter(x => x.hi > 13.9).map(x => pad(x.h) + ':00');
        add('Время суток', `выше всего сахар в среднем около ${pad(w.h)}:00 (медиана ${f1(w.v)})${top.length ? `; случаи выше 13,9 чаще всего приходятся на ${top.slice(0, 4).join(', ')}` : ''}.`);
      }
      /* 5. еда */
      let fi = null; try { fi = window.DMFoodImpact && DMFoodImpact.analyze(Math.max(1, days), rg.end) } catch (e) { }
      if (fi && fi.n >= 6) {
        const pr = (fi.products || []), hi = pr.filter(p => p.cls === 'hi' && p.conf !== 'low').slice(0, 3), calm = pr.filter(p => p.cls === 'ok' && p.n >= 4).slice(-3).reverse();
        let t = `разобрано ${fi.n} приёмов пищи с сахаром до и после; в среднем сахар поднимается на ${f1(fi.rise)}.`;
        if (hi.length) t += ` Заметнее всего поднимают сахар: ${hi.map(p => `${esc(p.name)} (${sg(p.rise)}, ${p.n} приёмов)`).join(', ')}.`;
        if (calm.length) t += ` Спокойнее всего: ${calm.map(p => `${esc(p.name)} (${sg(p.rise)})`).join(', ')}.`;
        const rk = (fi.rookies || []).slice(0, 3); if (rk.length) { const base = fi.rise; t += ` Новые продукты: ` + rk.map(r => { const m = r.meals[0], d = m.rise - base; return `${esc(r.name)} (${m.peak > 10 ? 'сахар ушёл выше 10' : d >= 1 ? 'поднял заметнее обычного' : d <= -0.5 ? 'вёл себя спокойно' : 'в пределах обычного'})` }).join(', ') + '.' }
        t += ` Это наблюдения за ${days} дн.: чем меньше повторов продукта, тем осторожнее выводы.`;
        add('Еда', t);
        if (hi.length) talk.push('реакция сахара на ' + hi.map(p => esc(p.name).toLowerCase()).join(', ') + ' и подходит ли для этих приёмов текущий углеводный коэффициент');
      }
      /* 6. нагрузка */
      const acts = (db.activity || []).filter(x => x.date >= rg.start && x.date <= rg.end && x.time && +x.minutes > 0);
      if (acts.length) {
        const lowA = acts.filter(a => { const e = ts(a.date, mins(a.time)) + (+a.minutes) * 60e3, v = inR(raw, e, e + 6 * 3600e3); return v.length && Math.min(...v.map(x => x.g)) < 3.9 }).length;
        const nod = acts.filter(a => !inR(raw, ts(a.date, mins(a.time)), ts(a.date, mins(a.time)) + (+a.minutes) * 60e3).length).length;
        add('Нагрузка', `записей о занятиях: ${acts.length}; после ${lowA ? lowA + ' из них' : 'них'} ${lowA ? 'в первые 6 часов сахар опускался ниже 3,9' : 'сахар в первые 6 часов не опускался ниже 3,9'}${nod ? `; во время ${nod === 1 ? 'одного занятия' : nod + ' занятий'} данных сенсора нет` : ''}.`);
        if (lowA) talk.push('как менять подход в дни спорта');
      }
      /* 7. данные */
      let gaps = 0; for (let i = 1; i < raw.length; i++) if (raw[i].t - raw[i - 1].t > 20 * 60e3) gaps++;
      const cov = G && G.cover != null ? Math.round(G.cover) : null;
      add('Надёжность данных', `${cov != null ? 'полнота данных сенсора ' + cov + '%, ' : ''}пропусков дольше 20 минут: ${gaps || 'нет'}${days < 14 ? '; период короче 14 дней — расчётный HbA1c и средние ориентировочные' : ''}.`);
      let h = '<h3 class="rptH"><span>✦</span>Главное за период</h3><ul class="rptDigest">' + it.join('') + '</ul>';
      if (talk.length) h += `<p class="rptTxt"><b>Что стоит обсудить с врачом:</b> ${talk.join('; ')}.</p>`;
      return h + NOTE('Резюме составлено приложением автоматически по записям семьи и данным сенсора. Это наблюдения, а не диагноз и не рекомендация по дозам: решения принимает врач.') + '<div class="rptBreak"></div>';
    } catch (e) { return '' }
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
      PT(`В среднем за ${dd} дн. самый высокий сахар приходится на ${pad(worst.h)}:00 (медиана ${f1(worst.v)} ммоль/л), самый низкий — на ${pad(best.h)}:00 (${f1(best.v)}). ` +
        (lowH.length ? `В часы ${lowH.join(', ')} не менее 10% показаний были ниже 3,9 — это повторяющееся время риска. ` : 'Ни в один час суток 10% показаний не опускались ниже 3,9. ') +
        (P.filter(p => p.p90 > 13.9).length ? `Выше 13,9 в 10% случаев сахар бывает в часы: ${P.map((p, h) => p.p90 > 13.9 ? pad(h) + ':00' : null).filter(Boolean).join(', ')}.` : 'Сахар выше 13,9 был редким во все часы.'));
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
    const low6 = acts.filter(a => a.time && +a.minutes > 0).filter(a => { const e = ts(a.date, mins(a.time)) + (+a.minutes) * 60e3, v = inR(raw, e, e + 6 * 3600e3); return v.length && Math.min(...v.map(x => x.g)) < 3.9 }).length, nodata = acts.filter(a => a.time && +a.minutes > 0).filter(a => !inR(raw, ts(a.date, mins(a.time)), ts(a.date, mins(a.time)) + (+a.minutes) * 60e3).length).length;
    h += PT(`Записей о нагрузке за период: ${acts.length}. ` + (low6 ? `После ${low6} из них в первые 6 часов сахар опускался ниже 3,9. ` : 'После нагрузок в первые 6 часов сахар не опускался ниже 3,9. ') + (nodata ? `Нагрузок без данных сенсора во время занятия: ${nodata} — как менялся сахар в эти моменты, неизвестно. ` : '') + (A.length >= 2 && B.length >= 2 ? `Ночной минимум после дней с нагрузкой в среднем ${f1(avg(A))}, после дней без нагрузки — ${f1(avg(B))}` + (avg(A) < avg(B) - 0.5 ? ' — после нагрузки ночью сахар ниже.' : '.') : '') + (low6 ? ' Для обсуждения с врачом: как действовать в дни занятий, чтобы избежать низкого сахара после них — решение о мерах принимает врач.' : ' Для обсуждения с врачом: достаточно ли действующих правил на дни занятий — по записям проблем после нагрузок не видно.'));
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
    if (gaps.length) h += TWO(['Пропуск', 'Длительность'], gaps.sort((a, b) => b.min - a.min).slice(0, 8).sort((a, b) => a.a - b.a).map(g => [`${dmy(dk(g.a))} ${hm(g.a)} → ${dk(g.a) === dk(g.b) ? '' : dmy(dk(g.b)) + ' '}${hm(g.b)}`, g.min >= 60 ? Math.floor(g.min / 60) + ' ч ' + (g.min % 60) + ' мин' : g.min + ' мин']));
    if (pairs.length) h += KV([['Сверка с глюкометром', `${pairs.length} сравнений, в среднем отличие <b>${f1(avg(pairs.map(p => Math.abs(p.gm - p.s))))} ммоль/л</b> (глюкометр ${pairs.length ? (avg(pairs.map(p => p.gm - p.s)) >= 0 ? 'выше' : 'ниже') : ''} сенсора на ${f1(Math.abs(avg(pairs.map(p => p.gm - p.s))))})`]]);
    const gl = gaps.reduce((x, g) => x + g.min, 0) / 60, qt = [`Сенсор передал ${raw.length.toLocaleString('ru-RU')} показаний; покрыто ${Math.round(cover)}% периода (ориентир для надёжных выводов — не менее 70%).`, gaps.length ? `Пропусков дольше 20 минут — ${gaps.length}, суммарно ${f1(gl)} ч${gaps.some(g => g.min >= 60) ? ', есть пропуски дольше часа' : ''}.` : 'Пропусков дольше 20 минут не было.', cover >= 70 ? 'Данных достаточно, чтобы доверять средним значениям и профилю по времени суток.' : 'Данных мало: средние значения, GMI и профиль по времени суток ориентировочные.', gaps.some(g => g.min >= 60) ? 'Длинные пропуски обычно связаны с телефоном, передающим данные (интернет, Bluetooth) или сменой сенсора; если они повторяются, стоит проверить связь телефона с сенсором.' : 'Передача данных работает стабильно.', pairs.length ? 'Сверка с глюкометром приведена выше: значительные расхождения — повод обсудить с врачом точность сенсора.' : 'Сверок с глюкометром за период нет; при сомнениях в показаниях сенсора стоит измерить сахар глюкометром.'];
    h += PT(qt.join(' '));
    return h + NOTE('Большие пропуски занижают точность средних значений и GMI. Причины пропусков (связь телефона с сенсором, интернет, смена сенсора) приложение не определяет.');
  }

  function sections(G, rg) {
    const out = [], add = (title, fn) => { try { const h = fn(G, rg); if (h) out.push([title, h]) } catch (e) {} };
    add('Сахар ночью и натощак', night); add('Качество данных сенсора', quality);
    return out;
  }
  window.DMRptIns = { tirText, agpText, dailyText, foodText, activityText, topList, foodDays, digest, sections, exercise, hypo, night, agp, quality, episodes };
})();
