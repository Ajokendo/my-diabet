/* v64.55: голосовой ввод еды в окне «Добавить еду».
   «Кусок хлеба, сто граммов плова и стакан молока» → список продуктов с количеством → подтверждение → в приём пищи.
   Распознавание речи — встроенное в браузер (Chrome на Android, Safari на iPhone). */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"„“().!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const NUM = { 'пол': 0.5, 'половина': 0.5, 'половину': 0.5, 'половинка': 0.5, 'половинку': 0.5, 'полтора': 1.5, 'четверть': 0.25, 'четвертинка': 0.25, 'треть': 0.33, 'полторы': 1.5, 'один': 1, 'одна': 1, 'одну': 1, 'одно': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90, 'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400, 'пятьсот': 500 };
  const STOP = new Set(['я', 'он', 'она', 'мы', 'съел', 'съела', 'съели', 'выпил', 'выпила', 'выпили', 'кушал', 'кушала', 'поел', 'поела', 'ел', 'ела', 'пил', 'пила', 'добавь', 'добавить', 'запиши', 'на', 'завтрак', 'обед', 'ужин', 'перекус', 'еще', 'ещё', 'потом', 'немного', 'примерно', 'около', 'где-то', 'штуки', 'штук', 'штука', 'шт', 'грамм', 'граммов', 'грамма', 'гр', 'г', 'мл', 'миллилитров']);
  const UNIT_G = /^(г|гр|грамм[а-яё]*|мл|миллилитр[а-яё]*)$/;
  const UNIT_M = /^(стакан[а-яё]*|чаш[а-яё]*|кружк[а-яё]*|ложк[а-яё]*|ложеч[а-яё]*|кус[а-яё]*|ломтик[а-яё]*|ломт[а-яё]*|тарелк[а-яё]*|порци[а-яё]*|половник[а-яё]*|пиал[а-яё]*|горст[а-яё]*|штук[а-яё]*|шт|бутерброд[а-яё]*)$/;
  let rec = null, items = [], heard = '';
  function near(a, b) { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; const m = Math.min(a.length, b.length); return i >= 2 && i >= m - 1 && m >= 3 && (m >= 5 || Math.abs(a.length - b.length) <= 1) }
  const stem = w => w.length > 5 ? w.slice(0, w.length - 2) : w.length > 3 ? w.slice(0, w.length - 1) : w;

  function bestFood(words) {
    const qs = words.filter(w => w.length > 1 && !STOP.has(w) && !(w in NUM) && !/^\d/.test(w) && !UNIT_M.test(w) && !UNIT_G.test(w)).map(stem);
    if (!qs.length) return null;
    let best = null, bs = 0;
    for (const f of db.foods) {
      if (typeof isFoodVisible === 'function' && !isFoodVisible(f)) continue;
      const nt = norm(f.name).split(' ').filter(w => w.length > 1);
      let hit = 0; qs.forEach(q => { if (nt.some(n => n.startsWith(q) || q.startsWith(stem(n)) || near(q, n))) hit++ });
      if (!hit) continue;
      const first = nt[0] && qs.some(q => nt[0].startsWith(q)) ? 0.25 : 0;
      const sc = hit / qs.length + first - (nt.length - hit) * 0.04;
      if (sc > bs || (sc === bs && best && f.name.length < best.name.length)) { bs = sc; best = f }
    }
    return bs >= 0.5 ? best : null;
  }
  function parseChunk(ch) {
    const w = norm(ch).split(' ').filter(Boolean); if (!w.length) return null;
    let n = null, grams = null, unit = null;
    for (let i = 0; i < w.length; i++) {
      const t = w[i];
      if (/^\d+([.,]\d+)?$/.test(t)) { const v = parseFloat(t.replace(',', '.')); n = (n && n >= 100 && v < 100) ? n + v : v; continue }
      if (t in NUM) { const v = NUM[t]; n = (n && n >= 20 && v < n) ? n + v : (n == null ? v : n); continue }
      if (UNIT_G.test(t)) { grams = n; continue }
      if (UNIT_M.test(t)) { unit = t; continue }
    }
    const f = bestFood(w); if (!f) return { text: ch, food: null };
    const L = window.DMMeasure ? DMMeasure.list(f) : [];
    let g = 100, measure = null;
    if (grams) g = grams;
    else {
      let m = null;
      if (L.length) { const lw = w.filter(x => !STOP.has(x)); for (const it of L) { const first = norm(it[0]).split(' ')[0]; if (lw.some(x => x.length > 2 && (x.startsWith(stem(first)) || near(x, first)))) { m = it; break } } }
      if (m && (m[0] === 'четверть' || m[0] === 'половина') && n != null && n < 1) n = null;
      if (!m && unit) { const u = stem(unit); m = L.find(([l]) => norm(l).split(' ').some(x => x.startsWith(u) || u.startsWith(stem(x)))) }
      if (!m && (n != null || unit) && L.length) m = L[0];
      if (m) { const c = n != null ? n : 1; g = m[1] * c; measure = { l: m[0], n: c } }
      else if (n != null && n >= 20) g = n;
      else if (n != null) g = 100 * n;
    }
    return { text: ch, food: f, g: Math.round(g), measure };
  }
  function parse(text) {
    return norm(text).split(/,|;| и | плюс | ещ[её] | потом | а также /).map(s => s.trim()).filter(Boolean).map(parseChunk).filter(Boolean);
  }
  function xeG() { return +(db.settings && db.settings.xe) || 12 }
  function paint(status) {
    const el = $('afVoice'); if (!el) return;
    if (status) { el.innerHTML = `<div class="vcBox">${status}</div>`; return }
    if (!items.length) { el.innerHTML = ''; return }
    const ok = items.filter(x => x.food);
    el.innerHTML = `<div class="vcBox"><div class="muted">Услышано: «${esc(heard)}»</div>
${items.map((x, i) => x.food ? `<div class="vcRow"><span><b>${esc(x.food.name)}</b><small>${x.measure ? esc(f1(x.measure.n) + ' × ' + x.measure.l) + ' ≈ ' : ''}${x.g} г · ${f1((+x.food.c || 0) * x.g / 100 / xeG())} ХЕ</small></span><button class="btn secondary small" onclick="DMVoice.drop(${i})" aria-label="Убрать">✕</button></div>`
      : `<div class="vcRow bad"><span>Не нашёл: «${esc(x.text)}»<small>Найдите вручную через поиск</small></span><button class="btn secondary small" onclick="DMVoice.drop(${i})">✕</button></div>`).join('')}
${ok.length ? `<button class="btn" style="width:100%;margin-top:8px" onclick="DMVoice.addAll()">Добавить ${ok.length === 1 ? '' : 'всё '}в «${esc(window.DMAddFood ? DMAddFood.curMeal() : '')}»</button><div class="muted" style="font-size:13px;margin-top:4px">Проверьте вес — его можно поправить в меню после добавления.</div>` : ''}
<button class="btn secondary small" style="margin-top:6px" onclick="DMVoice.start()">🎤 Сказать ещё раз</button></div>`;
  }
  function start() {
    if (!SR) { alert('Голосовой ввод в этом браузере недоступен. На Android откройте приложение в Chrome. На iPhone можно нажать на микрофон на клавиатуре в поле поиска.'); return }
    try { if (rec) rec.abort() } catch (e) {}
    rec = new SR(); rec.lang = 'ru-RU'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    paint('🎤 <b>Говорите…</b> например: «кусок хлеба, сто граммов плова и стакан молока»');
    rec.onresult = e => { heard = Array.from(e.results).map(r => r[0].transcript).join(' '); items = parse(heard); paint() };
    rec.onerror = e => { paint(e.error === 'not-allowed' ? 'Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.' : e.error === 'no-speech' ? 'Ничего не услышал. Нажмите 🎤 и говорите сразу.' : 'Не получилось распознать (' + esc(e.error) + '). Попробуйте ещё раз.') };
    rec.onend = () => { if (!items.length && $('afVoice') && /Говорите/.test($('afVoice').textContent)) paint('Ничего не услышал. Нажмите 🎤 и говорите сразу.') };
    try { rec.start() } catch (e) { paint('Микрофон занят. Попробуйте ещё раз.') }
  }
  window.DMVoice = {
    ok: () => !!SR, start, parse,
    drop(i) { items.splice(i, 1); paint() },
    addAll() { let n = 0; items.filter(x => x.food).forEach(x => { if (DMAddFood.addItem(x.food.id, x.g, x.measure)) n++ }); items = []; heard = ''; DMAddFood.done() }
  };
})();
