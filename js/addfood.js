/* v64.40: понятное добавление еды.
   Кнопка «＋ Добавить еду» в каждом приёме пищи открывает окно:
   1) выбрать приём пищи и найти продукт (недавние, избранное, поиск);
   2) указать сколько — граммы или мера (ломтик, стакан, штука…), сразу видно углеводы и ХЕ;
   3) «Добавить» — окно остаётся открытым, можно добавить ещё; «Готово» — закрыть. */
(function () {
  let meal = 'Завтрак', tab = 'recent', q = '', pick = null, grams = 100, msr = null, cnt = 1, added = [];
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"„“]/g, '');
  const xeG = () => +(db.settings && db.settings.xe) || 12;
  const mealList = () => (typeof meals !== 'undefined' && Array.isArray(meals) ? meals : ['Завтрак', 'Перекус 1', 'Обед', 'Перекус 2', 'Ужин', 'Перекус 3']);

  function recent() {
    const cnt = {}, days = Object.keys(db.menus || {}).sort().slice(-21);
    days.forEach(d => Object.values(db.menus[d] || {}).forEach(a => Array.isArray(a) && a.forEach(r => { if (r && r.foodId) cnt[r.foodId] = (cnt[r.foodId] || 0) + 1 })));
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id]) => db.foods.find(f => f.id === id)).filter(f => f && isFoodVisible(f)).slice(0, 40);
  }
  function list() {
    const all = db.foods.filter(isFoodVisible);
    if (q) { const n = norm(q); return all.filter(f => norm(f.name).includes(n)).sort((a, b) => norm(a.name).indexOf(n) - norm(b.name).indexOf(n) || a.name.localeCompare(b.name, 'ru')).slice(0, 80) }
    if (tab === 'fav') return all.filter(f => isFoodVisible(f) && isFavoriteFood(f.id));
    if (tab === 'recent') return recent();
    return all.sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 400);
  }
  function box() {
    let el = $('addFood'); if (el) return el;
    el = document.createElement('div'); el.id = 'addFood'; el.className = 'addFood';
    el.addEventListener('click', e => { if (e.target === el) close() });
    document.body.appendChild(el); return el;
  }
  function open(m, foodId) {
    meal = m && mealList().includes(m) ? m : (window.activeMeal && mealList().includes(activeMeal) ? activeMeal : (typeof curMealDefault === 'function' ? curMealDefault() : 'Завтрак'));
    q = ''; added = []; pick = null; tab = recent().length ? 'recent' : 'all';
    box().classList.add('open'); document.body.classList.add('sheetOpen');
    if (foodId) choose(foodId); else paint(true);
  }
  function close() {
    const el = $('addFood'); if (el) el.classList.remove('open'); document.body.classList.remove('sheetOpen');
    try { if (window.activeMeal !== 'all') { activeMeal = meal; const mp = $('mealPick'); if (mp) mp.value = meal } loadDay() } catch (e) {}
  }
  function choose(id) {
    pick = db.foods.find(f => f.id === id); if (!pick) return;
    const L = window.DMMeasure ? DMMeasure.list(pick) : [];
    msr = L[0] ? L[0][0] : null; cnt = 1; grams = L[0] ? L[0][1] : 100; paint();
  }
  function head() {
    return `<div class="afHead"><b>${pick ? 'Сколько?' : 'Добавить еду'}</b><button class="btn small" onclick="DMAddFood.close()">Готово</button></div>
<div class="afMeals">${mealList().map(m => `<button class="${m === meal ? 'on' : ''}" onclick="DMAddFood.meal('${m}')">${m}</button>`).join('')}</div>
${added.length ? `<div class="afAdded">✓ Добавлено в «${esc(meal)}»: ${added.map(esc).join(', ')}</div>` : ''}`;
  }
  function chipScroll() { setTimeout(() => { const b = document.querySelector('.afMeals .on'); b && b.scrollIntoView({ inline: 'center', block: 'nearest' }) }, 0) }
  function paint(focus) {
    const el = box(); chipScroll();
    if (pick) return paintPick();
    const L = list();
    const tabs = [['recent', 'Недавние'], ['fav', 'Избранное'], ['all', 'Все']];
    el.innerHTML = `<div class="afCard">${head()}
<div class="afSearchRow"><input id="afQ" class="input afSearch" placeholder="Найти: гречка, хлеб, плов…" value="${esc(q)}" autocomplete="off" oninput="DMAddFood.search(this.value)">${window.DMVoice && DMVoice.ok() ? `<button class="afMic" onclick="DMVoice.start()" aria-label="Сказать голосом" title="Сказать голосом">🎤</button>` : ''}</div><div id="afVoice"></div>
${q ? '' : `<div class="afTabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" onclick="DMAddFood.tab('${k}')">${l}</button>`).join('')}</div>`}
<div class="afList" id="afList">${rows(L)}</div>
<div class="afFoot muted">Нет нужного? Добавьте свой продукт в «Продукты» → «＋ Свой продукт».</div></div>`;
    if (focus && !('ontouchstart' in window)) setTimeout(() => { const i = $('afQ'); i && i.focus() }, 50);
  }
  function rows(L) {
    if (!L.length) return `<div class="muted afEmpty">${q ? 'Ничего не найдено. Попробуйте другое слово.' : tab === 'fav' ? 'Пока нет избранного — отмечайте ★ в списке «Все».' : 'Пока пусто.'}</div>`;
    return L.map(f => `<button class="afRow" onclick="DMAddFood.choose('${f.id}')"><span class="afImg">${foodIcon(f.name)}</span><span class="afName"><b>${esc(f.name)}</b><small>${f1(f.c / xeG())} ХЕ на 100 г · ${Math.round(f.kcal)} ккал</small></span><span class="afPlus">＋</span></button>`).join('');
  }
  function paintPick() {
    const el = box(), f = pick, L = window.DMMeasure ? DMMeasure.list(f) : [];
    const c = (+f.c || 0) * grams / 100, xe = c / xeG();
    el.innerHTML = `<div class="afCard">${head()}
<div class="afPick"><span class="afImg big">${foodIcon(f.name)}</span><div><b>${esc(f.name)}</b><div class="muted">${f1(f.c)} г углеводов на 100 г</div></div></div>
${L.length ? `<div class="afLbl">Мера</div><div class="afChips">${L.map(([l, w]) => `<button class="${l === msr ? 'on' : ''}" onclick="DMAddFood.msr('${l}',${w})">${l} <small>≈${w} г</small></button>`).join('')}<button class="${!msr ? 'on' : ''}" onclick="DMAddFood.msr(null)">в граммах</button></div>` : ''}
${msr ? `<div class="afLbl">Сколько</div><div class="afChips">${[0.5, 1, 1.5, 2, 3, 4, 5].map(n => `<button class="${n === cnt ? 'on' : ''}" onclick="DMAddFood.count(${n})">${String(n).replace('.', ',')}</button>`).join('')}</div>`
        : `<div class="afLbl">Вес, г</div><div class="afGrams"><button onclick="DMAddFood.step(-10)">−</button><input id="afG" type="number" inputmode="numeric" class="input" value="${grams}" oninput="DMAddFood.grams(this.value)"><button onclick="DMAddFood.step(10)">+</button></div>`}
<div class="afSum" id="afSum">${sumHtml(c, xe)}</div>
<button class="btn afAdd" onclick="DMAddFood.add()">Добавить в «${esc(meal)}»</button>
<button class="btn secondary afBack" onclick="DMAddFood.back()">‹ Назад к списку</button></div>`;
  }
  const sumHtml = (c, xe) => `<b>${grams} г</b> · углеводы ${f1(c)} г · <b>${f1(xe)} ХЕ</b>`;
  function add() {
    if (!pick || !(grams > 0)) return;
    if (typeof canAddToMeal === 'function' && !canAddToMeal(pick.id, meal)) return;
    const day = key(); db.menus[day] = db.menus[day] || Object.fromEntries(mealList().map(m => [m, []]));
    const m = db.menus[day]; m[meal] = m[meal] || [];
    const it = { id: crypto.randomUUID(), foodId: pick.id, g: Math.round(grams) }; if (msr) it.measure = { l: msr, n: cnt };
    m[meal].push(it); save(); added.push(pick.name); pick = null; q = ''; paint();
    try { loadDay() } catch (e) {}
  }
  window.DMAddFood = {
    open, close, choose, add,
    curMeal() { return meal },
    addItem(foodId, g, measure) {
      const f = db.foods.find(x => x.id === foodId); if (!f || !(g > 0)) return false;
      if (typeof canAddToMeal === 'function' && !canAddToMeal(foodId, meal)) return false;
      const day = key(); db.menus[day] = db.menus[day] || Object.fromEntries(mealList().map(m => [m, []]));
      const m = db.menus[day]; m[meal] = m[meal] || [];
      const it = { id: crypto.randomUUID(), foodId, g: Math.round(g) }; if (measure) it.measure = measure;
      m[meal].push(it); added.push(f.name); return true;
    },
    done() { save(); pick = null; q = ''; paint(); try { loadDay() } catch (e) {} },
    meal(m) { meal = m; added = []; paint() }, tab(t) { tab = t; paint() },
    search(v) { q = v; const l = $('afList'); if (l) { l.innerHTML = rows(list()); const t = document.querySelector('.afTabs'); if (t) t.style.display = q ? 'none' : '' } else paint() },
    msr(l, w) { msr = l; if (l) { cnt = 1; grams = w } paint() }, count(n) { cnt = n; const L = DMMeasure.list(pick), w = (L.find(x => x[0] === msr) || [0, 100])[1]; grams = Math.round(w * n); paint() },
    grams(v) { grams = Math.max(0, +v || 0); const c = (+pick.c || 0) * grams / 100; const s = $('afSum'); if (s) s.innerHTML = sumHtml(c, c / xeG()) },
    step(d) { grams = Math.max(0, grams + d); paint() }, back() { pick = null; paint() }
  };
  /* «＋ В меню» в «Продуктах» теперь тоже спрашивает приём пищи и количество */
  window.quickAddFromCatalog = id => open(null, id);
})();
