/* v64.116: «Как еда влияет на сахар» — разбор по продуктам, считается в приложении сам.
 * Берём приёмы, где есть сахар до еды и через 1–3 часа (сенсор + глюкометр), и смотрим по каждому продукту,
 * как часто после него сахар уходил выше 10 и насколько вырастал. Это НАБЛЮДЕНИЯ по записям семьи, а не назначение:
 * в приёме обычно несколько продуктов, так что причину однозначно назвать нельзя. Дозы приложение не меняет и не советует. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const peakOf = r => Math.max(...[r.a1, r.a2, r.a3].filter(Number.isFinite));
  const dmy = d => d.split('-').reverse().slice(0, 2).join('.');
  const MIN_MEALS = 6, MIN_PROD = 3, HIGH = 10;

  function analyze(days, end) {
    const recs = findScenarioRecords(days, end).filter(r => [r.a1, r.a2, r.a3].some(Number.isFinite)).map(r => ({ ...r, peak: peakOf(r) })).map(r => ({ ...r, rise: r.peak - r.before }));
    const out = { n: recs.length, exact: recs.filter(r => r.exact).length, days, recs };
    if (recs.length < MIN_MEALS) return out;
    out.rise = avg(recs.map(r => r.rise)); out.high = recs.filter(r => r.peak > HIGH).length;
    const by = {};
    recs.forEach(r => new Set(r.items.map(i => i.name)).forEach(n => (by[n] = by[n] || []).push(r)));
    out.products = Object.entries(by).filter(([, rs]) => rs.length >= MIN_PROD).map(([name, rs]) => {
      const rise = avg(rs.map(r => r.rise)), hi = rs.filter(r => r.peak > HIGH).length, a2 = avg(rs.map(r => r.a2).filter(Number.isFinite));
      const cls = (hi / rs.length >= 0.5 || (rise >= out.rise + 0.8 && hi / rs.length >= 0.34)) ? 'hi' : (hi === 0 && rise <= out.rise) ? 'ok' : 'mid';
      return { name, n: rs.length, rise, hi, peak: avg(rs.map(r => r.peak)), a2, cls };
    }).sort((a, b) => b.rise - a.rise);
    const withDose = recs.filter(r => r.dose > 0 && r.carbs >= 10), per10 = r => r.dose / r.carbs * 10;
    const gh = withDose.filter(r => r.peak > HIGH), go = withDose.filter(r => r.peak <= HIGH);
    out.dose = { nHigh: gh.length, nOk: go.length, high: gh.length ? avg(gh.map(per10)) : null, ok: go.length ? avg(go.map(per10)) : null };
    out.top = recs.slice().sort((a, b) => b.peak - a.peak).filter(r => r.peak > HIGH).slice(0, 5);
    return out;
  }
  function html(a, opt) {
    opt = opt || {};
    if (!a.n || a.n < MIN_MEALS) return `<p class="muted">Пока мало данных: нужно хотя бы ${MIN_MEALS} приёмов с сахаром до еды и через 1–3 часа, сейчас ${a.n}. Записывайте еду и время приёма, а сенсор или глюкометр дадут сахар.</p>`;
    const tag = c => c === 'hi' ? '<span class="fiHi">чаще высокий</span>' : c === 'ok' ? '<span class="fiOk">спокойный</span>' : 'обычный';
    let h = `<div class="fiBox"><p>Разобрано приёмов пищи: <b>${a.n}</b> за ${a.days} дн. Средний подъём сахара после еды <b>+${f1(a.rise)}</b> ммоль/л, выше ${HIGH} уходил в <b>${a.high}</b> из ${a.n}. Время приёма указано в ${a.exact} из ${a.n}, в остальных оно типовое или по записи укола.</p>`;
    if (a.products && a.products.length) {
      h += `<div class="rptSub" style="margin-top:8px"><b>По продуктам</b> (в ${MIN_PROD}+ приёмах)</div><table class="fiTbl rptTbl"><thead><tr><th>Продукт</th><th class="n">Приёмов</th><th class="n">Подъём</th><th class="n">Через 2 ч</th><th class="n">Выше ${HIGH}</th><th></th></tr></thead><tbody>` +
        a.products.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.n}</td><td class="n">+${f1(p.rise)}</td><td class="n">${Number.isFinite(p.a2) && p.a2 ? f1(p.a2) : '—'}</td><td class="n">${p.hi} из ${p.n}</td><td>${tag(p.cls)}</td></tr>`).join('') + '</tbody></table>';
    } else h += `<p class="muted">Продуктов, которые встретились хотя бы в ${MIN_PROD} приёмах, пока нет.</p>`;
    if (a.top && a.top.length) {
      h += `<div class="rptSub" style="margin-top:8px"><b>Самые высокие пики</b></div><table class="fiTbl rptTbl"><thead><tr><th>Когда</th><th>Еда</th><th class="n">У, г</th><th class="n">Доза</th><th class="n">До</th><th class="n">Пик</th><th class="n">2 ч</th></tr></thead><tbody>` +
        a.top.map(r => `<tr><td>${dmy(r.date)} ${esc(r.meal.toLowerCase())}</td><td>${esc(r.items.slice(0, 3).map(i => i.name).join(', '))}${r.items.length > 3 ? '…' : ''}</td><td class="n">${Math.round(r.carbs)}</td><td class="n">${r.dose > 0 ? f1(r.dose) + ' ЕД' : '—'}</td><td class="n">${f1(r.before)}</td><td class="n fiHi">${f1(r.peak)}</td><td class="n">${Number.isFinite(r.a2) ? f1(r.a2) : '—'}</td></tr>`).join('') + '</tbody></table>';
    }
    const d = a.dose;
    if (d && d.nHigh && d.nOk) h += `<p>Записанная доза на 10 г углеводов: в приёмах с пиком выше ${HIGH} в среднем <b>${f1(d.high)} ЕД</b> (${d.nHigh} приёмов), в остальных <b>${f1(d.ok)} ЕД</b> (${d.nOk}). Это описание записей.</p>`;
    h += `<p class="fiNote">Это наблюдения по записям, а не назначение. В приёме обычно несколько продуктов, а на сахар влияют укол, его время, активность и сенсор, поэтому одна строка не доказывает причину. Приложение не советует менять дозу инсулина: решения принимает врач.</p></div>`;
    return h;
  }
  function paint() {
    const el = document.getElementById('mpRecommendations'); if (!el) return;
    const days = Math.max(10, +document.getElementById('profileWindow')?.value || 30);
    let a; try { a = analyze(days) } catch (e) { return }
    const box = document.createElement('div'); box.id = 'fiHost'; box.className = 'card'; box.style.marginBottom = '12px';
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
  window.DMFoodImpact = { analyze, html, paint, reportHtml };
  const wrap = () => { const o = window.renderScenarioRecommendations; if (typeof o === 'function' && !o._fi) { window.renderScenarioRecommendations = function () { const r = o.apply(this, arguments); try { paint() } catch (e) {} return r }; window.renderScenarioRecommendations._fi = true } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(wrap, 300)); else setTimeout(wrap, 300);
})();
