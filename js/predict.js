/* v64.30: краткосрочный прогноз сахара по сенсору — как простой прогноз в xDrip+.
   По последним ~20 минутам строится прямая (метод наименьших квадратов). Если сахар падает или растёт быстро
   и линия пересекает порог в ближайшие 45 минут — показываем «через ~N мин может быть гипо/гипер».
   Инсулин и еду прогноз не учитывает, поэтому это только подсказка. Тот же алгоритм — в воркере для уведомлений. */
(function () {
  const MIN = 60e3;
  function calc(r, opt) {
    opt = opt || {};
    const low = +opt.low || 3.9, high = +opt.high || 10, now = opt.now || Date.now();
    if (!r || r.length < 3) return null;
    const last = r[r.length - 1];
    if (now - last.t > 12 * MIN) return null;
    const pts = r.filter(x => x.t >= last.t - 21 * MIN);
    if (pts.length < 3 || (last.t - pts[0].t) < 9 * MIN) return null;
    const n = pts.length, xs = pts.map(p => (p.t - last.t) / MIN), ys = pts.map(p => p.g);
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my) }
    if (!sxx) return null;
    const rate = sxy / sxx, now0 = my - rate * mx;                      // ммоль/л в минуту; значение «сейчас» по прямой
    let sd = 0; for (let i = 0; i < n; i++) sd += (ys[i] - (now0 + rate * xs[i])) ** 2; sd = Math.sqrt(sd / n);
    if (sd > 0.6) return null;                                         // слишком шумно — не прогнозируем
    const g = last.g, res = { rate, per5: rate * 5, from: last.t, g, type: null, minutes: null, line: [] };
    if (rate <= -0.05 && g > low) { const m = (g - low) / -rate; if (m <= 45) { res.type = 'low'; res.minutes = Math.max(5, Math.round(m / 5) * 5) } }
    else if (rate >= 0.07 && g < high) { const m = (high - g) / rate; if (m <= 45) { res.type = 'high'; res.minutes = Math.max(5, Math.round(m / 5) * 5) } }
    if (res.type) {
      const H = Math.min(60, (res.minutes || 30) + 15);
      for (let m = 0; m <= H; m += 5) res.line.push({ t: last.t + m * MIN, g: Math.min(25, Math.max(1.5, g + rate * m)) });
    }
    return res;
  }
  const f1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  function banner(p) {
    if (!p || !p.type) return '';
    const low = p.type === 'low';
    return `<div class="predBanner ${low ? 'low' : 'high'}"><b>${low ? 'Прогноз: гипогликемия' : 'Прогноз: высокий сахар'} примерно через ${p.minutes} мин</b><span>${low ? 'Падает' : 'Растёт'} на ${f1(Math.abs(p.per5))} ммоль/л за 5 мин · прогноз приблизительный, без учёта инсулина и еды</span></div>`;
  }
  /* пунктир прогноза для SVG-графика; X и Y — функции перевода из графика */
  function svg(p, X, Y) {
    if (!p || !p.type || !p.line.length) return '';
    const col = p.type === 'low' ? '#dc2626' : '#d97706';
    return p.line.map(q => `<circle cx="${X(q.t).toFixed(1)}" cy="${Y(q.g).toFixed(1)}" r="2.3" fill="${col}" opacity=".85"/>`).join('');
  }
  /* пороги — те же, что в уведомлениях этого телефона */
  function thr() { let a = {}; try { a = JSON.parse(localStorage.getItem('dm-alerts') || '{}') } catch (e) {} return { low: +a.low || 3.9, high: +a.high || 10 } }
  function now(readings) { return calc(readings, thr()) }
  window.DMPredict = { calc, banner, svg, thr, now };
})();
