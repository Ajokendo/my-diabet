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
        if (hi.length) t += ` Заметнее всего поднимают сахар: ${hi.map(p => `${esc(p.name)} (+${f1(p.rise)}, ${p.n} приёмов)`).join(', ')}.`;
        if (calm.length) t += ` Спокойнее всего: ${calm.map(p => `${esc(p.name)} (+${f1(p.rise)})`).join(', ')}.`;
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
    h += PT(`Записей о нагрузке за период: ${acts.length}. ` + (low6 ? `После ${low6} из них в первые 6 часов сахар опускался ниже 3,9. ` : 'После нагрузок в первые 6 часов сахар не опускался ниже 3,9. ') + (nodata ? `Нагрузок без данных сенсора во время занятия: ${nodata} — как менялся сахар в эти моменты, неизвестно. ` : '') + (A.length >= 2 && B.length >= 2 ? `Ночной минимум после дней с нагрузкой в среднем ${f1(avg(A))}, после дней без нагрузки — ${f1(avg(B))}.` : ''));
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
    add('Сахар ночью и натощак', night); add('Профиль сахара по часам суток (AGP)', agp); add('Качество данных сенсора', quality);
    return out;
  }
  window.DMRptIns = { digest, sections, exercise, hypo, night, agp, quality, episodes };
})();
