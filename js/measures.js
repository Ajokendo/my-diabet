/* v64.38: порции в бытовых мерах — ломтик, стакан, ложка, штука, тарелка.
   Вес мер — средний, ориентировочный; итог всё равно в граммах и виден в строке меню. */
(function () {
  const L = (re, list) => [re, list];
  // сначала конкретные продукты, потом категории
  const BY_NAME = [
    L(/лепёшк|лепешк/i, [['целая', 250], ['половина', 125], ['четверть', 60], ['кусок', 40]]),
    L(/^чай|ак чай/i, [['пиала', 150], ['чашка', 200], ['стакан', 250]]),
    L(/карамель/i, [['штука', 5]]), L(/конфеты|конфета/i, [['штука', 13]]),
    L(/шоколадная плитка/i, [['долька', 5], ['ряд (4 дольки)', 20], ['плитка 100 г', 100]]),
    L(/^хлеб|батон|бородин/i, [['ломтик', 30], ['кусок толстый', 50]]),
    L(/лаваш/i, [['лист', 60], ['половина листа', 30]]),
    L(/самс/i, [['штука', 100]]), L(/пирож/i, [['штука', 70]]), L(/круассан/i, [['штука', 60]]), L(/маффин/i, [['штука', 80]]),
    L(/боорсок/i, [['штука', 15], ['горсть', 60]]), L(/печенье/i, [['штука', 10]]), L(/хлебц/i, [['штука', 8]]), L(/сухари/i, [['горсть', 25]]),
    L(/манты/i, [['штука', 50]]), L(/пельмен/i, [['штука', 12], ['тарелка (15 шт)', 180]]), L(/вареник/i, [['штука', 25]]),
    L(/котлет|бифштекс/i, [['штука', 80]]), L(/фрикадел/i, [['штука', 25]]), L(/сырник/i, [['штука', 60]]), L(/блин/i, [['штука', 50]]), L(/оладь/i, [['штука', 35]]),
    L(/пицц/i, [['кусок', 110]]), L(/ролл/i, [['штука', 30], ['порция (8 шт)', 240]]), L(/шаурм/i, [['штука', 300]]), L(/бургер/i, [['штука', 220]]),
    L(/сосиск/i, [['штука', 50]]), L(/колбас|ветчин/i, [['ломтик', 15]]), L(/наггет/i, [['штука', 18]]), L(/шашлык/i, [['шампур', 120]]),
    L(/яйц|яичниц|омлет|скрембл/i, [['яйцо', 55]]),
    L(/^сыр(?!ник)/i, [['ломтик', 20]]), L(/сметан/i, [['ст. ложка', 20]]), L(/масло сливоч/i, [['ч. ложка', 5], ['бутерброд', 10]]), L(/масло/i, [['ч. ложка', 5], ['ст. ложка', 15]]),
    L(/^мёд|^мед\b/i, [['ч. ложка', 8], ['ст. ложка', 25]]), L(/сахар/i, [['ч. ложка', 5], ['ст. ложка', 18], ['кусочек', 5]]), L(/варень|джем/i, [['ч. ложка', 10], ['ст. ложка', 25]]),
    L(/шоколад/i, [['долька', 5], ['плитка', 90]]), L(/конфет/i, [['штука', 12]]), L(/мороженое/i, [['стаканчик', 80]]), L(/торт|пирожн|пахлав|чак-чак/i, [['кусок', 100]]),
    L(/яблок|груш/i, [['штука средняя', 160]]), L(/банан/i, [['штука (без кожуры)', 120]]), L(/апельсин|грейпфрут/i, [['штука (без кожуры)', 150]]), L(/мандарин/i, [['штука (без кожуры)', 70]]),
    L(/персик|нектарин/i, [['штука', 130]]), L(/абрикос/i, [['штука', 35]]), L(/слив/i, [['штука', 30]]), L(/киви/i, [['штука', 75]]), L(/хурм/i, [['штука', 160]]), L(/гранат/i, [['штука', 200]]),
    L(/арбуз|дын/i, [['ломтик', 250]]), L(/финик/i, [['штука', 8]]), L(/кураг|изюм/i, [['горсть', 30]]), L(/огурец/i, [['штука', 100]]), L(/помидор(?! черри)/i, [['штука', 120]]),
    L(/картофель отвар|картофель запеч/i, [['картофелина', 80]]), L(/кукуруз/i, [['початок', 150]]),
    L(/компот|сок|молоко|кефир|айран|ряженк|напиток|вода|чалап|тан|максым|бозо|кумыс|квас|жарма|аралаш/i, [['стакан', 200], ['кружка', 300], ['банка 0,33', 330], ['бутылка 0,5', 500]]),
  ];
  const BY_CAT = {
    'Супы': [['тарелка', 300], ['половник', 150]], 'Крупы и гарниры': [['ст. ложка', 25], ['тарелка', 200]], 'Готовые блюда': [['тарелка', 250], ['ст. ложка', 25]],
    'Салаты и закуски': [['ст. ложка', 25], ['порция', 150]], 'Ягоды': [['горсть', 50], ['стакан', 150]], 'Орехи и семена': [['горсть', 30], ['ст. ложка', 15]],
    'Бобовые': [['ст. ложка', 25], ['порция', 150]], 'Мясо и птица': [['порция', 100]], 'Рыба и морепродукты': [['порция', 100]], 'Напитки': [['стакан', 200], ['кружка', 300]],
    'Молочные продукты': [['стакан', 200], ['ст. ложка', 25]], 'Овощи и зелень': [['горсть', 50], ['порция', 150]], 'Фрукты': [['штука средняя', 150]]
  };
  function list(f) {
    if (!f) return [];
    let out = [];
    for (const [re, l] of BY_NAME) if (re.test(f.name)) { out = l; break }
    const cat = BY_CAT[f.category] || [];
    const w1 = l => l.split(' ')[0], seen = new Set(out.map(x => w1(x[0])));
    return out.concat(cat.filter(x => !seen.has(w1(x[0])))).slice(0, 4);
  }
  const N = [0.5, 1, 1.5, 2, 3, 4, 5];
  const fmtN = n => String(n).replace('.', ',');
  let ctx = null;
  function open(meal, id) {
    const it = (getMenu()[meal] || []).find(x => x.id === id); if (!it) return;
    const f = db.foods.find(x => x.id === it.foodId), L = list(f);
    ctx = { meal, id, m: it.measure && L.find(x => x[0] === it.measure.l) ? it.measure.l : (L[0] || [])[0], n: it.measure ? it.measure.n : 1 };
    let el = document.getElementById('measureBox');
    if (!el) { el = document.createElement('div'); el.id = 'measureBox'; el.className = 'measureBox'; el.addEventListener('click', e => { if (e.target === el) close() }); document.body.appendChild(el) }
    el.classList.add('open'); paint(f, L);
  }
  function paint(f, L) {
    const el = document.getElementById('measureBox'); if (!el || !ctx) return;
    if (!f) { const it = (getMenu()[ctx.meal] || []).find(x => x.id === ctx.id); f = it && db.foods.find(x => x.id === it.foodId); L = list(f) }
    const cur = L.find(x => x[0] === ctx.m), g = cur ? Math.round(cur[1] * ctx.n) : 0;
    el.innerHTML = `<div class="measureCard" role="dialog"><div class="row" style="justify-content:space-between;align-items:center"><b>${f.name}</b><button class="navClose" onclick="DMMeasure.close()">✕</button></div>
${L.length ? `<div class="muted" style="margin:6px 0 4px">Мера</div><div class="mBtns">${L.map(([l, w]) => `<button class="btn small ${l === ctx.m ? '' : 'secondary'}" onclick="DMMeasure.pick('${l}')">${l} <span class="muted">≈${w} г</span></button>`).join('')}</div>
<div class="muted" style="margin:10px 0 4px">Сколько</div><div class="mBtns">${N.map(n => `<button class="btn small ${n === ctx.n ? '' : 'secondary'}" onclick="DMMeasure.count(${n})">${fmtN(n)}</button>`).join('')}</div>
<div class="mSum">${fmtN(ctx.n)} × ${ctx.m} ≈ <b>${g} г</b></div>
<button class="btn" style="width:100%" onclick="DMMeasure.apply(${g})">Записать ${g} г</button>` : `<p class="muted">Для этого продукта мер нет — введите вес в граммах.</p>`}
<div class="muted" style="font-size:12px;margin-top:8px">Вес меры — средний. Если есть весы, точнее взвесить.</div></div>`;
  }
  function close() { const el = document.getElementById('measureBox'); if (el) el.classList.remove('open'); ctx = null }
  function apply(g) {
    if (!ctx || !(g > 0)) return; const it = (getMenu()[ctx.meal] || []).find(x => x.id === ctx.id);
    if (it) { it.g = g; it.measure = { l: ctx.m, n: ctx.n } }
    close(); save(); loadDay();
  }
  window.DMMeasure = { list, open, close, apply, pick(l) { if (ctx) { ctx.m = l; paint() } }, count(n) { if (ctx) { ctx.n = n; paint() } }, label(it) { return it && it.measure ? `${fmtN(it.measure.n)} × ${it.measure.l}` : '' } };
})();
