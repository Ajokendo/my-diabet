/* v64.116: «Как еда влияет на сахар» — разбор по продуктам, считается в приложении сам.
 * Берём приёмы, где есть сахар до еды и через 1–3 часа (сенсор + глюкометр), и смотрим по каждому продукту,
 * как часто после него сахар уходил выше 10 и насколько вырастал. Это НАБЛЮДЕНИЯ по записям семьи, а не назначение:
 * в приёме обычно несколько продуктов, так что причину однозначно назвать нельзя. Дозы приложение не меняет и не советует. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const sg = v => (v < 0 ? '−' : '+') + f1(Math.abs(v));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const peakOf = r => Math.max(...[r.a1, r.a2, r.a3].filter(Number.isFinite));
  const dmy = d => d.split('-').reverse().slice(0, 2).join('.');
  const XE = () => +(db.settings && db.settings.xe) || 12, SOLO_C = 5, BIG_RISE = 3, FEW_XE = 2;
  const xeS = g => f1(g / XE());
  const MIN_MEALS = 6, MIN_PROD = 3, HIGH = 10, ROOKIE_DAYS = 2, LOW_B = 6, HIGH_B = 8, HALF = 60, SPREAD = 2.0;

  function analyze(days, end) {
    const recs = findScenarioRecords(days, end).filter(r => [r.a1, r.a2, r.a3].some(Number.isFinite)).map(r => ({ ...r, peak: peakOf(r) })).map(r => ({ ...r, rise: r.peak - r.before }));
    const out = { n: recs.length, exact: recs.filter(r => r.exact).length, days, recs };
    out.rise = recs.length ? avg(recs.map(r => r.rise)) : 0; out.high = recs.filter(r => r.peak > HIGH).length;
    const by = {};
    recs.forEach(r => new Set(r.items.map(i => i.name)).forEach(n => (by[n] = by[n] || []).push(r)));
    /* «новички»: продукты, которые за всю историю дневника встречались в 1–2 днях */
    const seen = {};
    Object.entries(db.menus || {}).forEach(([d, menu]) => Object.values(menu || {}).forEach(arr => Array.isArray(arr) && arr.forEach(it => { const f = db.foods.find(x => x.id === it.foodId); if (f) (seen[f.name] = seen[f.name] || new Set()).add(d) })));
    out.rookies = Object.entries(by).filter(([n]) => seen[n] && seen[n].size <= ROOKIE_DAYS).map(([name, rs]) => ({ name, meals: rs.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)) })).sort((a, b) => (b.meals[0].date + b.meals[0].time).localeCompare(a.meals[0].date + a.meals[0].time));
    if (recs.length < MIN_MEALS) return out;
    const nowT = Date.now(), wOf = r => Math.pow(0.5, Math.max(0, nowT - new Date(r.date + 'T12:00:00').getTime()) / 864e5 / HALF);
    const wavg = (rs, f) => { const w = rs.map(wOf), sw = w.reduce((x, y) => x + y, 0) || 1; return rs.reduce((x, r, i) => x + f(r) * w[i], 0) / sw };
    const sd = a => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) };
    out.products = Object.entries(by).filter(([, rs]) => rs.length >= MIN_PROD).map(([name, rs]) => {
      const rise = wavg(rs, r => r.rise), hi = rs.filter(r => r.peak > HIGH).length, hiW = wavg(rs, r => r.peak > HIGH ? 1 : 0), a2 = avg(rs.map(r => r.a2).filter(Number.isFinite));
      const spread = sd(rs.map(r => r.rise)), n = rs.length;
      const conf = n < 5 ? 'low' : spread > SPREAD ? 'noisy' : n >= 10 ? 'good' : 'mid';
      const cls = (hiW >= 0.5 || (rise >= out.rise + 0.8 && hiW >= 0.34)) ? 'hi' : (hi === 0 && rise <= out.rise) ? 'ok' : 'mid';
      const bin = f => { const x = rs.filter(f); return x.length ? { n: x.length, rise: avg(x.map(r => r.rise)) } : null };
      const bins = { low: bin(r => r.before < LOW_B), mid: bin(r => r.before >= LOW_B && r.before <= HIGH_B), high: bin(r => r.before > HIGH_B) };
      const othC = r => r.items.filter(i => i.name !== name).reduce((x, i) => x + i.c, 0), ownC = r => r.items.filter(i => i.name === name).reduce((x, i) => x + i.c, 0);
      const so = rs.filter(r => othC(r) <= SOLO_C), cm = {};
      rs.forEach(r => new Set(r.items.map(i => i.name).filter(x => x !== name)).forEach(x => cm[x] = (cm[x] || 0) + 1));
      const comp = Object.entries(cm).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 3);
      return { name, n, rise, hi, peak: avg(rs.map(r => r.peak)), a2, cls, bins, conf, spread, solo: { n: so.length, rise: so.length ? avg(so.map(r => r.rise)) : null }, ownC: avg(rs.map(ownC)), restC: avg(rs.map(othC)), comp };
    }).sort((a, b) => b.rise - a.rise);
    const withDose = recs.filter(r => r.dose > 0 && r.carbs >= 10), per10 = r => r.dose / r.carbs * 10;
    const gh = withDose.filter(r => r.peak > HIGH), go = withDose.filter(r => r.peak <= HIGH);
    out.dose = { nHigh: gh.length, nOk: go.length, high: gh.length ? avg(gh.map(per10)) : null, ok: go.length ? avg(go.map(per10)) : null };
    out.worst = recs.slice().sort((a, b) => b.rise - a.rise).slice(0, 8);
    out.hidden = recs.filter(r => r.rise >= BIG_RISE && r.carbs / XE() <= FEW_XE);
    out.top = recs.slice().sort((a, b) => b.peak - a.peak).filter(r => r.peak > HIGH).slice(0, 5);
    return out;
  }
  const binsText = p => [['ниже ' + LOW_B, p.bins.low], [LOW_B + '–' + HIGH_B, p.bins.mid], ['выше ' + HIGH_B, p.bins.high]].filter(x => x[1]).map(([l, b]) => `${l}: ${sg(b.rise)} (${b.n})`).join(' · ') || '—';
  const confTag = p => ({ low: '<span class="muted">мало данных</span>', noisy: '<span class="fiHi">большой разброс</span>', mid: 'ориентир', good: '<span class="fiOk">надёжно</span>' })[p.conf] + `<div class="fiNote" style="margin:0">±${f1(p.spread)}</div>`;
  const scroll = (t, opt) => opt && opt.report ? t : `<div class="fiScroll">${t}</div>`;
  function rookieVerdict(r, base) {
    const d = r.rise - base;
    return r.peak > HIGH ? '<span class="fiHi">сахар ушёл выше ' + HIGH + '</span>' : d >= 1 ? '<span class="fiHi">поднял сахар заметнее обычного</span>' : d <= -0.5 ? '<span class="fiOk">вёл себя спокойно</span>' : 'в пределах обычного';
  }
  function rookiesHtml(a) {
    if (!a.rookies || !a.rookies.length) return '';
    const base = a.rise || 0;
    return `<div class="rptSub" style="margin-top:8px"><b>Новые продукты</b> (встречались в ${ROOKIE_DAYS} днях или реже)</div>` + a.rookies.slice(0, 8).map(rk => `<div style="margin:6px 0"><b>🆕 ${esc(rk.name)}</b>` + rk.meals.slice(0, 3).map(r => {
      const it = r.items.find(i => i.name === rk.name), share = r.carbs > 0 && it ? it.c / r.carbs : 0, others = r.items.filter(i => i.name !== rk.name).map(i => i.name);
      const who = !others.length ? 'один в приёме' : share >= 0.5 ? 'основной источник углеводов в приёме' : 'в приёме ещё: ' + esc(others.slice(0, 3).join(', ')) + (others.length > 3 ? '…' : '') + ', вклад неясен';
      return `<div class="fiNote" style="color:inherit;margin:2px 0">${dmy(r.date)} ${esc(r.meal.toLowerCase())}: ${it ? Math.round(it.g) + ' г, ' : ''}сахар до ${f1(r.before)} → пик ${f1(r.peak)}${Number.isFinite(r.a2) ? ', через 2 ч ' + f1(r.a2) : ''} (${sg(r.rise)}); ${rookieVerdict(r, base)}. <span class="muted">${who}.</span></div>`;
    }).join('') + '</div>').join('');
  }
  function html(a, opt) {
    opt = opt || {};
    if ((!a.n || a.n < MIN_MEALS) && (!a.rookies || !a.rookies.length)) return `<p class="muted">Пока мало данных: нужно хотя бы ${MIN_MEALS} приёмов с сахаром до еды и через 1–3 часа, сейчас ${a.n}. Записывайте еду и время приёма, а сенсор или глюкометр дадут сахар.</p>`;
    if (a.n < MIN_MEALS) return `<div class="fiBox"><p class="muted">Общий разбор пока недоступен: нужно хотя бы ${MIN_MEALS} приёмов с сахаром до еды и через 1–3 часа, сейчас ${a.n}.</p>${rookiesHtml(a)}<p class="fiNote">Это наблюдения по записям, а не назначение. Решения о дозе принимает врач.</p></div>`;
    const tag = c => c === 'hi' ? '<span class="fiHi">чаще высокий</span>' : c === 'ok' ? '<span class="fiOk">спокойный</span>' : 'обычный';
    let h = `<div class="fiBox"><p>Разобрано приёмов пищи: <b>${a.n}</b> за ${a.days} дн. Средний подъём сахара после еды <b>${sg(a.rise)}</b> ммоль/л, выше ${HIGH} уходил в <b>${a.high}</b> из ${a.n}. Время приёма указано в ${a.exact} из ${a.n}, в остальных оно типовое или по записи укола.</p>`;
    if (a.products && a.products.length) {
      h += `<div class="rptSub" style="margin-top:8px"><b>По продуктам</b> (в ${MIN_PROD}+ приёмах)</div>${opt.report ? '' : '<div class="fiNote">Таблицу можно листать вбок и вверх: заголовок и первый столбец закреплены.</div>'}<table class="fiTbl rptTbl"><thead><tr><th>Продукт</th><th class="n">Приёмов</th><th class="n">Подъём</th><th class="n">Выше ${HIGH}</th><th class="n">В одиночку</th><th>С чем ели</th><th>Оценка</th></tr></thead><tbody>` +
        a.products.map(p => {
          const fewOwn = p.ownC / XE() < 0.4 && p.restC / XE() >= 1;
          const comp = p.comp.length ? p.comp.map(([n, k]) => `${esc(n)} (${k} из ${p.n})`).join(', ') : '<span class="muted">всегда один</span>';
          return `<tr><td>${esc(p.name)}</td><td class="n" data-l="Приёмов">${p.n}</td><td class="n" data-l="Подъём">${sg(p.rise)}</td><td class="n" data-l="Выше ${HIGH}">${p.hi} из ${p.n}</td><td class="n" data-l="В одиночку">${p.solo.n ? sg(p.solo.rise) + ' <span class="muted">(' + p.solo.n + ')</span>' : '<span class="muted">нет</span>'}</td><td class="wrapc" data-l="С чем ели">${comp}<div class="fiNote" style="margin:0">остальное в приёме ≈ ${f1(p.restC / XE())} ХЕ, сам продукт ≈ ${f1(p.ownC / XE())} ХЕ</div></td><td data-l="Оценка">${tag(p.cls)}<div class="fiNote" style="margin:0">${({ low: 'мало данных', noisy: 'большой разброс', mid: 'ориентир', good: 'надёжно' })[p.conf]} ±${f1(p.spread)}</div>${fewOwn ? '<div class="fiNote" style="margin:0">сам почти без углеводов: подъём связан с остальным приёмом</div>' : ''}</td></tr>`;
        }).join('') + '</tbody></table>';
    } else h += `<p class="muted">Продуктов, которые встретились хотя бы в ${MIN_PROD} приёмах, пока нет.</p>`;
    h += `<p class="fiNote"><b>В одиночку</b> — приёмы, где остальные блюда давали не больше ${SOLO_C} г углеводов (в скобках их число; «нет» — такого приёма не было, и оценка относится ко всему приёму целиком). <b>С чем ели</b> — что чаще всего было в тех же приёмах; ХЕ считаются по записанным граммам (1 ХЕ = ${XE()} г углеводов). Надёжность: «мало данных» — 3–4 приёма; «ориентир» — 5–9; «надёжно» — 10 и больше при небольшом разбросе (до ±${f1(SPREAD)} ммоль/л). «±» — на сколько обычно отличается подъём от приёма к приёму. Свежие записи весят больше: вес записи падает вдвое за ${HALF} дней, потому что с ростом ребёнка чувствительность к инсулину меняется.</p>`;
    h += rookiesHtml(a);
    if (a.worst && a.worst.length) {
      const hd = a.hidden || [], cnt = {};
      hd.forEach(r => new Set(r.items.map(i => i.name)).forEach(n => cnt[n] = (cnt[n] || 0) + 1));
      const hc = Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n, k]) => `${esc(n)} (${k})`).join(', ');
      h += `<div class="rptSub" style="margin-top:8px"><b>Приёмы пищи с наибольшим подъёмом</b></div>`;
      h += `<p>Подъём ${BIG_RISE}+ ммоль/л при небольшом количестве записанных углеводов (до ${FEW_XE} ХЕ) был в <b>${hd.length}</b> из ${a.n} приёмов.` + (hd.length ? ` Такой подъём не объясняется записанным количеством ХЕ: возможно, что-то съели и не внесли, дозу сделали с опозданием или сахар до еды был высоким. Чаще всего в этих приёмах: ${hc}.` : ' Значит, сильные подъёмы в основном соответствуют записанным углеводам.') + '</p>';
      h += `<table class="fiTbl rptTbl"><thead><tr><th>Когда</th><th>Весь приём</th><th class="n">ХЕ</th><th class="n">Доза</th><th class="n">До</th><th class="n">Пик</th><th class="n">Подъём</th></tr></thead><tbody>` +
        a.worst.map(r => { const fl = r.rise >= BIG_RISE && r.carbs / XE() <= FEW_XE; return `<tr><td>${dmy(r.date)} ${esc(r.meal.toLowerCase())}</td><td class="wrapc">${esc(r.items.slice(0, 6).map(i => i.name + ' ' + Math.round(i.g) + ' г').join(', '))}${r.items.length > 6 ? '…' : ''}${fl ? '<div class="fiHi" style="font-size:12px">мало ХЕ, а подъём большой — уточнить, что ещё ели</div>' : ''}</td><td class="n" data-l="ХЕ">${xeS(r.carbs)}</td><td class="n" data-l="Доза">${r.dose > 0 ? f1(r.dose) + ' ЕД' : '—'}</td><td class="n" data-l="До">${f1(r.before)}</td><td class="n${r.peak > HIGH ? ' fiHi' : ''}" data-l="Пик">${f1(r.peak)}</td><td class="n" data-l="Подъём">${sg(r.rise)}</td></tr>` }).join('') + '</tbody></table>';
    }
    const d = a.dose;
    if (d && d.nHigh && d.nOk) h += `<p>Записанная доза на 10 г углеводов: в приёмах с пиком выше ${HIGH} в среднем <b>${f1(d.high)} ЕД</b> (${d.nHigh} приёмов), в остальных <b>${f1(d.ok)} ЕД</b> (${d.nOk}). Это описание записей.</p>`;
    if (!opt.report) h = h.replace(/<table class="fiTbl rptTbl">[\s\S]*?<\/table>/g, m => scroll(m, opt));
    h += `<p class="fiNote">Это наблюдения по записям, а не назначение. В приёме обычно несколько продуктов, а на сахар влияют укол, его время, активность и сенсор, поэтому одна строка не доказывает причину. Приложение не советует менять дозу инсулина: решения принимает врач.</p></div>`;
    return h;
  }
  function paint() {
    const el = document.getElementById('mpRecommendations'); if (!el) return;
    const days = Math.max(10, +document.getElementById('profileWindow')?.value || 30);
    let a; try { a = analyze(days) } catch (e) { return }
    const box = document.createElement('div'); box.id = 'fiHost'; box.style.cssText = 'margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0';
    box.innerHTML = '<h3 style="margin-top:0">Как еда влияет на сахар</h3>' + html(a);
    const old = document.getElementById('fiHost'); if (old) old.remove();
    el.parentNode.insertBefore(box, el);
  }
  function reportHtml(start, end) {
    const days = Math.max(1, Math.round((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 864e5) + 1);
    let a; try { a = analyze(days, end) } catch (e) { return '' }
    if (!a.n) return '';
    return html(a, { report: true });
  }
  /* карточка «новичок» на главной: свежий приём (за последние 2 суток) с продуктом, которого раньше почти не было */
  function dashCard() {
    const host = document.querySelector('#dashboard .grid'); const old = document.getElementById('fiRookie'); if (old) old.remove();
    if (!host) return;
    let a; try { a = analyze(14) } catch (e) { return }
    const cut = new Date(Date.now() - 2 * 864e5), dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), from = dk(cut);
    let pick = null;
    for (const rk of a.rookies || []) { const r = rk.meals.find(m => m.date >= from); if (r) { const key = 'dm-fi-seen:' + rk.name + ':' + r.date; let seen = false; try { seen = !!localStorage.getItem(key) } catch (e) {} if (!seen) { pick = { rk, r, key }; break } } }
    if (!pick) return;
    const { rk, r, key } = pick, base = a.rise || 0;
    const d = document.createElement('div'); d.id = 'fiRookie'; d.className = 'card s12'; d.style.cssText = 'border-left:4px solid #0d9488';
    d.innerHTML = `<div class="fiBox"><b>🆕 Новый продукт: ${esc(rk.name)}</b><div style="margin-top:4px">${dmy(r.date)} ${esc(r.meal.toLowerCase())}: сахар до еды ${f1(r.before)} → пик ${f1(r.peak)}${Number.isFinite(r.a2) ? ', через 2 ч ' + f1(r.a2) : ''} (${sg(r.rise)}) — ${rookieVerdict(r, base)}.</div><div class="fiNote">${r.items.length > 1 ? 'В приёме были и другие продукты, вклад неясен. ' : ''}Это наблюдение, а не назначение. Подробнее — «Мои показатели».</div><div class="row" style="gap:6px;margin-top:6px"><button class="btn small" onclick="show('myprofile')">Подробнее</button><button class="btn secondary small" onclick="try{localStorage.setItem('${esc(key)}','1')}catch(e){};document.getElementById('fiRookie').remove()">Понятно</button></div></div>`;
    host.prepend(d);
  }
  window.DMFoodImpact = { analyze, html, paint, reportHtml, dashCard };
  const wrap = () => { const o = window.renderScenarioRecommendations; if (typeof o === 'function' && !o._fi) { window.renderScenarioRecommendations = function () { const r = o.apply(this, arguments); try { paint() } catch (e) {} return r }; window.renderScenarioRecommendations._fi = true } };
  /* живое обновление: при каждой записи в дневнике (save) и каждые 2 минуты (приходит новый сахар с сенсора) */
  let tm;
  const refreshSoon = () => { clearTimeout(tm); tm = setTimeout(() => { try { const pf = document.getElementById('myprofile'); if (pf && pf.offsetParent !== null) paint(); dashCard() } catch (e) {} }, 1200) };
  const hookSave = () => { const o = window.save; if (typeof o === 'function' && !o._fi) { window.save = function () { const r = o.apply(this, arguments); refreshSoon(); return r }; window.save._fi = true } };
  const startAll = () => { wrap(); hookSave(); setInterval(refreshSoon, 2 * 60e3); setTimeout(() => { try { dashCard() } catch (e) {} }, 6000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') try { dashCard() } catch (e) {} }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(startAll, 300)); else setTimeout(startAll, 300);
})();
