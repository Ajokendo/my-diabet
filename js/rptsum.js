/* v64.107: страница-резюме в «Отчёте врачу», инсулин по дням, график HbA1c.
   Ничего не подбирает и не оценивает: только суммы и средние по записям семьи и данным сенсора. */
(function () {
  'use strict';
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fd = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(d || ''); };
  const fs = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] : String(d || ''); };
  const f1 = (v, n) => (+v).toFixed(n == null ? 1 : n).replace('.', ',');
  const dayN = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const todayIso = () => { try { return today(); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const dkey = x => String(x.date || x.timestamp || '').slice(0, 10);
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : k === 1 ? a : (k >= 2 && k <= 4) ? b : c; };
  const nd = n => n + ' ' + plural(n, 'день', 'дня', 'дней');

  /* суточные суммы по фактическим введениям */
  function perDay(actual) {
    const by = {};
    (actual || []).forEach(x => {
      const u = +x.units; if (!(u > 0)) return;
      const d = dkey(x); if (!d) return;
      const o = by[d] = by[d] || { date: d, basal: 0, bolus: 0, other: 0, nb: 0 };
      const t = String(x.type || '');
      if (/базал/i.test(t)) o.basal += u;
      else if (/болюс|коррекц/i.test(t)) { o.bolus += u; o.nb++; }
      else o.other += u;
    });
    return Object.values(by).sort((a, b) => a.date.localeCompare(b.date)).map(o => ({ ...o, total: o.basal + o.bolus + o.other }));
  }
  /* средние только по завершённым дням (сегодняшний день ещё не закончен) */
  function avgs(rows) {
    const t = todayIso();
    let r = rows.filter(x => x.date !== t); if (!r.length) r = rows;
    const n = r.length; if (!n) return null;
    const s = k => r.reduce((a, x) => a + x[k], 0) / n;
    return { n, basal: s('basal'), bolus: s('bolus'), total: s('total'), nb: s('nb') };
  }
  function periodDays(rg) { return Math.max(1, dayN(rg.start, rg.end) + 1); }


  /* v64.123: инсулин по дням — столбики (базальный + болюсный) и описание вместо таблицы */
  function insChart(rows, per, a, note) {
    const n = rows.length, W = 640, H = 230, pl = 30, pr = 8, pt = 18, pb = 26, mx = Math.max(10, Math.ceil(Math.max(...rows.map(r => r.total)) / 5) * 5);
    const bw = Math.min(34, (W - pl - pr) / n * 0.7), X = i => pl + (i + .5) / n * (W - pl - pr), Y = v => pt + (1 - v / mx) * (H - pt - pb);
    let g = ''; for (let v = 0; v <= mx; v += mx / 5) g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#e2e8f0"/><text x="' + (pl - 4) + '" y="' + (Y(v) + 4) + '" font-size="11" text-anchor="end" fill="#64748b">' + Math.round(v) + '</text>';
    const step = n > 20 ? 3 : n > 12 ? 2 : 1;
    const bars = rows.map((r, i) => '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + Y(r.basal).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Y(0) - Y(r.basal)).toFixed(1) + '" fill="#6366f1"/>' +
      '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + Y(r.basal + r.bolus + r.other).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Y(r.basal) - Y(r.basal + r.bolus + r.other)).toFixed(1) + '" fill="#14b8a6"/>' +
      '<text x="' + X(i).toFixed(1) + '" y="' + (Y(r.total) - 4).toFixed(1) + '" font-size="10" font-weight="700" text-anchor="middle" fill="#0f172a">' + f1(r.total, r.total % 1 ? 1 : 0) + '</text>' +
      (i % step === 0 ? '<text x="' + X(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" text-anchor="middle" fill="#64748b">' + fs(r.date) + '</text>' : '')).join('');
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;max-width:720px">' + g + bars + '</svg>';
    const leg = '<p class="muted" style="font-size:12px;margin:2px 0 8px"><b style="color:#6366f1">■</b> базальный · <b style="color:#14b8a6">■</b> болюсный (над столбиком — сумма за день, ЕД)</p>';
    const done = rows.filter(r => r.date !== todayIso()), src = done.length ? done : rows;
    const hi = src.reduce((b, r) => r.total > b.total ? r : b, src[0]), lo = src.reduce((b, r) => r.total < b.total ? r : b, src[0]);
    const onlyBasal = rows.filter(r => r.bolus === 0 && r.basal > 0 && r.date !== todayIso()), bs = rows.map(r => r.basal).filter(v => v > 0);
    let t = 'Записи о введённом инсулине есть за ' + nd(n) + (n < per * 0.8 ? ' из ' + nd(per) + ' периода' : '') + '. ';
    if (a) t += 'В среднем в день ' + f1(a.total) + ' ЕД: базальный ' + f1(a.basal) + ', болюсный ' + f1(a.bolus) + ', в среднем ' + f1(a.nb, 1) + ' болюса в день. ';
    if (src.length > 2) t += 'Больше всего — ' + fs(hi.date) + ' (' + f1(hi.total) + ' ЕД), меньше всего — ' + fs(lo.date) + ' (' + f1(lo.total) + ' ЕД). ';
    if (bs.length > 1 && Math.max(...bs) - Math.min(...bs) > 0.01) t += 'Суточная доза базального менялась от ' + f1(Math.min(...bs)) + ' до ' + f1(Math.max(...bs)) + ' ЕД. ';
    if (onlyBasal.length) t += 'В дни ' + onlyBasal.map(r => fs(r.date)).join(', ') + ' записан только базальный инсулин — возможно, болюсы в эти дни не вносились. ';
    return svg + leg + '<p class="rptTxt">' + t + '</p><p class="muted" style="font-size:12px;margin:4px 0">Суммы — по записям семьи, без пересчёта. Описание не является рекомендацией по дозам.</p>';
  }

  function insulinTable(actual, rg) {
    const rows = perDay(actual);
    if (!rows.length) return '';
    const per = periodDays(rg), a = avgs(rows);
    const first = rows[0].date, last = rows[rows.length - 1].date;
    const note = '<p class="muted" style="margin:6px 0">Записи о введённом инсулине есть за ' + nd(rows.length) + ' (' + fs(first) + ' — ' + fs(last) + ')' +
      (rows.length < per * 0.8 ? ' из ' + nd(per) + ' периода' : '') + '. Суммы — по записям семьи, без пересчёта.</p>';
    if (rows.length <= 31) return insChart(rows, per, a, note);
    let head, body;
    if (rows.length <= 31) {
      head = ['Дата', 'Базальный, ЕД', 'Болюс, ЕД', 'Всего, ЕД', 'Болюсов'];
      body = rows.map(x => [fd(x.date), f1(x.basal), f1(x.bolus), '<b>' + f1(x.total) + '</b>', x.nb]);
      if (a) body.push(['<b>В среднем в день</b>', '<b>' + f1(a.basal) + '</b>', '<b>' + f1(a.bolus) + '</b>', '<b>' + f1(a.total) + '</b>', '<b>' + f1(a.nb, 1) + '</b>']);
    } else {
      const wk = {};
      rows.forEach(x => { const d = new Date(x.date + 'T12:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); const k = d.toISOString().slice(0, 10); (wk[k] = wk[k] || []).push(x); });
      head = ['Неделя', 'Дней', 'Базальный, ЕД/день', 'Болюс, ЕД/день', 'Всего, ЕД/день'];
      body = Object.keys(wk).sort().map(k => { const r = wk[k], n = r.length, s = f => r.reduce((q, x) => q + x[f], 0) / n; return [fs(k) + ' — ' + fs(r[r.length - 1].date), n, f1(s('basal')), f1(s('bolus')), '<b>' + f1(s('total')) + '</b>']; });
      if (a) body.push(['<b>В среднем</b>', rows.length, '<b>' + f1(a.basal) + '</b>', '<b>' + f1(a.bolus) + '</b>', '<b>' + f1(a.total) + '</b>']);
    }
    return '<table class="rptTbl"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      body.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>' + note;
  }

  /* ряд лабораторного показателя: db.labs + анализы из документов */
  function labSeries(type, re) {
    let r = [];
    try { if (window.DMLabTrend && DMLabTrend.rows) r = DMLabTrend.rows(type).map(x => ({ date: x.date, v: x.v })); } catch (e) { }
    if (!r.length && typeof db !== 'undefined') {
      (db.labs || []).forEach(l => { if (((l.type === type) || re.test(l.name || '')) && l.date && isFinite(+l.value)) r.push({ date: l.date, v: +l.value }); });
    }
    const seen = {}; r = r.filter(x => seen[x.date] ? false : (seen[x.date] = 1));
    return r.sort((a, b) => a.date.localeCompare(b.date));
  }

  function miniChart(r, unit, dec) {
    if (r.length < 2) return '';
    const W = 360, H = 110, pl = 16, pr = 16, pt = 22, pb = 24;
    const t = x => new Date(x.date + 'T12:00:00').getTime(), t0 = t(r[0]), t1 = t(r[r.length - 1]);
    const lo = Math.min(...r.map(x => x.v)), hi = Math.max(...r.map(x => x.v)), pad = (hi - lo) * 0.2 || 1;
    const X = x => pl + (t1 === t0 ? (W - pl - pr) / 2 : (t(x) - t0) / (t1 - t0) * (W - pl - pr));
    const Y = v => pt + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * (H - pt - pb);
    const line = r.map(x => X(x).toFixed(1) + ',' + Y(x.v).toFixed(1)).join(' ');
    const pts = r.map(x => '<circle cx="' + X(x).toFixed(1) + '" cy="' + Y(x.v).toFixed(1) + '" r="3.5" fill="#0d9488"/>' +
      '<text x="' + X(x).toFixed(1) + '" y="' + (Y(x.v) - 7).toFixed(1) + '" font-size="11" font-weight="700" text-anchor="middle" fill="#0f172a">' + f1(x.v, dec) + '</text>' +
      '<text x="' + X(x).toFixed(1) + '" y="' + (H - 8) + '" font-size="9.5" text-anchor="middle" fill="#64748b">' + fs(x.date) + '.' + String(x.date).slice(2, 4) + '</text>').join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block"><polyline points="' + line + '" fill="none" stroke="#0d9488" stroke-width="2"/>' + pts + '</svg>';
  }

  function tile(label, val, sub, tone) {
    const col = tone === 'ok' ? '#15803d' : tone === 'warn' ? '#b45309' : tone === 'bad' ? '#b91c1c' : '#0f172a';
    return '<div class="rptTile"><div class="tl">' + label + '</div><div class="tv" style="color:' + col + '">' + val + '</div>' + (sub ? '<div class="ts">' + sub + '</div>' : '') + '</div>';
  }

  function summary(c) {
    try {
      const { G, rg, p, actual, gv, avg, rows, cgmWait } = c;
      const per = periodDays(rg);
      let h = '<h3 class="rptH"><span>★</span>Краткая сводка</h3>';
      const pc = v => Math.round(v) + '%';
      if (G && G.n) {
        const cv = G.sd / G.mean * 100;
        h += '<div class="rptTiles">' +
          tile('Средняя глюкоза', f1(G.mean), 'ммоль/л · GMI ' + f1(G.v) + '%') +
          tile('В диапазоне', pc(G.tir), '3,9–10 · цель выше 70%', G.tir >= 70 ? 'ok' : 'warn') +
          tile('Ниже 3,9', pc(G.tbr), 'ниже 3,0: ' + pc(G.tbr54) + ' · цель ниже 4%', G.tbr < 4 ? 'ok' : 'bad') +
          tile('Данные сенсора', nd(G.days), 'полнота ' + pc(G.cover) + (G.days < 14 ? ' · мало для GMI' : '')) +
          tile('Вариабельность', Math.round(cv) + '%', 'CV · цель до 36%', cv <= 36 ? 'ok' : 'warn') +
          tile('Выше 10', pc(G.tar), 'выше 13,9: ' + pc(G.tar139) + ' · цель ниже 25%', G.tar < 25 ? 'ok' : 'warn') +
          '</div>';
        const seg = [[G.tbr54, '#991b1b'], [Math.max(0, G.tbr - G.tbr54), '#ef4444'], [G.tir, '#16a34a'], [Math.max(0, G.tar - G.tar139), '#f59e0b'], [G.tar139, '#ea580c']];
        h += '<div class="rptBar">' + seg.filter(s => s[0] > 0.2).map(s => '<div style="width:' + s[0].toFixed(1) + '%;background:' + s[1] + '"></div>').join('') + '</div>' +
          '<div class="rptBarLeg">' + [['ниже 3,0', '#991b1b'], ['3,0–3,8', '#ef4444'], ['3,9–10', '#16a34a'], ['10,1–13,9', '#f59e0b'], ['выше 13,9', '#ea580c']].map(s => '<span><i style="background:' + s[1] + '"></i>' + s[0] + '</span>').join('') + '</div>';
      } else if (cgmWait) {
        h += '<p class="muted">Загружаю данные сенсора за период…</p>';
      } else if (gv && gv.length) {
        h += '<div class="rptTiles">' + tile('Средняя (глюкометр)', f1(avg) + '<small> ммоль/л</small>', gv.length + ' измерений') + '</div>';
      } else h += '<p class="muted">Данных по глюкозе за период нет.</p>';

      /* анализы: HbA1c и С-пептид */
      const hb = labSeries('hba1c', /hba1c|гликир/i), cp = labSeries('cpep', /[cс][\s-]*пептид|c-?peptide/i);
      const lastLine = (r, name, unit, dec) => {
        if (!r.length) return '';
        const L = r[r.length - 1], P = r[r.length - 2];
        return '<b>' + name + ' ' + f1(L.v, dec) + (unit ? ' ' + unit : '') + '</b> <span class="muted">· ' + fd(L.date) + (P ? ' (раньше ' + f1(P.v, dec) + ' · ' + fd(P.date) + ')' : '') + '</span>';
      };
      const lab = [lastLine(hb, 'HbA1c', '%', 1), lastLine(cp, 'С-пептид', 'пмоль/л', 0)].filter(Boolean);
      if (lab.length || hb.length > 1) {
        h += '<div class="rptSumRow"><div class="rptSumTxt"><div class="rptSub" style="margin:0 0 4px">Анализы</div>' + lab.map(x => '<div>' + x + '</div>').join('') + '</div>' +
          (hb.length > 1 ? '<div class="rptSumChart"><div class="muted" style="font-size:11px">HbA1c, %</div>' + miniChart(hb, '%', 1) + '</div>' : '') + '</div>';
      }

      /* инсулин по записям */
      const days = perDay(actual), a = avgs(days);
      if (a) {
        let kg = 0; try { const w = window.DMWeight && DMWeight.latest(); kg = w ? w.kg : +p.weight; } catch (e) { kg = +p.weight; }
        h += '<div class="rptSumRow"><div class="rptSumTxt"><div class="rptSub" style="margin:0 0 4px">Инсулин <span class="muted" style="font-weight:400">(по записям, ' + nd(days.length) + (days.length < per * 0.8 ? ' из ' + nd(per) : '') + ')</span></div>' +
          '<div><b>В среднем ' + f1(a.total) + ' ЕД в день</b>' + (kg > 0 ? ' <span class="muted">(' + f1(a.total / kg, 2) + ' ЕД/кг)</span>' : '') + '</div>' +
          '<div class="muted">базальный ' + f1(a.basal) + ' · болюсный ' + f1(a.bolus) + ' · болюсов в день ' + f1(a.nb, 1) + '</div></div></div>';
      }
      /* вес и охват данных */
      const cov = [];
      if (p.weight) cov.push('вес ' + E(p.weight) + ' кг' + (window.DMWeight ? DMWeight.note() : ''));
      if (rows && rows.length) cov.push('питание записано за ' + nd(rows.length) + ' из ' + nd(per));
      if (cov.length) h += '<p class="muted" style="margin:8px 0 0;font-size:12px">' + cov.join(' · ') + '</p>';
      h += '<p class="muted" style="margin:6px 0 0;font-size:11px">Сводка составлена из записей и данных сенсора. Это не диагноз и не назначение; цели — международный консенсус по CGM (2019).</p>';
      return '<div class="rptSummary">' + h + '</div><div class="rptBreak"></div>';
    } catch (e) { return ''; }
  }

  window.DMRptSum = { summary, insulinTable, perDay };
})();
