/* v64.87: «Анализы» — группировка. Вместо длинного списка «Последние значения» и бесконечной таблицы «Все результаты»:
   – показатели собраны в группы (углеводный обмен, общий анализ крови, печень, почки, липиды, щитовидная и гормоны, витамины, моча, антитела и генетика, прочее);
   – группа — раскрывающаяся строка со счётчиком и числом значений вне нормы; открыта только «Углеводный обмен»;
   – у каждого показателя — последнее значение, изменение, «вне нормы» (если норма сохранена из документа) и вся история внутри;
   – «Журнал по датам» — по дням сдачи, порциями, чтобы список не рос рулоном.
   Данные не меняются: те же db.labs. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => { const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '.' + m[2] + '.' + m[1] : d; };
  const num = v => String(+(+v).toFixed(2));
  const GROUPS = [
    ['glyc', 'Углеводный обмен', /гликир|hba1c|глюкоз|с[\s-]*пептид|c[\s-]*peptide|инсулин|фруктозамин|лактат/i],
    ['cbc', 'Общий анализ крови', /гемоглобин|эритроцит|гематокрит|\bmc[vhc]+\b|цветовой|тромбоцит|тромбокрит|лейкоцит|лимфоцит|моноцит|нейтрофил|эозинофил|базофил|соэ|гранулоцит|\brdw|\bpdw|\bmpv|\bpct\b/i],
    ['liver', 'Печень', /(^|[^а-яё])(алт|аст)($|[^а-яё])|билирубин|ггт|гамма|щелочная|алкалин/i],
    ['kidney', 'Почки', /креатинин|мочевина|мочевая кислота|скф|цистатин/i],
    ['lipid', 'Липиды', /холестерин|лпнп|лпвп|триглицерид|липопротеид|ldl|hdl/i],
    ['thyr', 'Щитовидная железа и гормоны', /ттг|tsh|(^|[^а-яёa-z])т[34]($|[^а-яёa-z0-9])|тироксин|тиреоглобулин|тпо|кортизол|пролактин|(^|[^а-яё])(лг|фсг)($|[^а-яё])|тестостерон|соматомедин|ростовой/i],
    ['vit', 'Витамины и минералы', /витамин|25-?oh|b12|фолиев|ферритин|железо|кальций|магний|калий|натрий|цинк|фосфор|трансферрин/i],
    ['urine', 'Моча', /в моче|моча|мочи|урин|оксалат|кетон/i],
    ['imm', 'Антитела и генетика', /gad|ia-?2|znt8|антител|трансглутаминаз|генетич|\bhla\b|целиак/i],
    ['oth', 'Прочее', /./]
  ];
  /* порядок проверки: сначала моча и антитела, чтобы «глюкоза в моче» и «антитела к ТПО» не попали в другие группы */
  const MATCH = ['urine', 'imm', 'glyc', 'thyr', 'cbc', 'liver', 'kidney', 'lipid', 'vit', 'oth'];
  const gdef = id => GROUPS.find(g => g[0] === id);
  const groupOf = l => { const s = (l.name || '') + ' ' + (l.type || ''); if (l.type === 'hba1c' || l.type === 'cpep' || l.type === 'glu') return 'glyc'; if (l.type === 'chol' || l.type === 'ldl' || l.type === 'tg') return 'lipid'; if (l.type === 'creat') return 'kidney'; if (l.type === 'tsh') return 'thyr'; if (l.type === 'vitd') return 'vit'; if (l.type !== 'other') return 'oth'; if (/тпо|тиреоглобулин|тиреоидн/i.test(s)) return 'thyr'; for (const id of MATCH) { if (gdef(id)[2].test(s)) return id; } return 'oth'; };

  /* норма из примечания «… · норма 106–134» */
  function ref(note) {
    const m = String(note || '').match(/норма\s*([^·;]+)/i); if (!m) return null;
    const t = m[1].trim().replace(/,/g, '.'); let r;
    if ((r = t.match(/^([\d.]+)\s*[–—-]\s*([\d.]+)/))) return { lo: +r[1], hi: +r[2], txt: t };
    if ((r = t.match(/^(?:<|≤|до)\s*([\d.]+)/i))) return { lo: null, hi: +r[1], txt: t };
    if ((r = t.match(/^(?:>|≥|от)\s*([\d.]+)/i))) return { lo: +r[1], hi: null, txt: t };
    return null;
  }
  const flag = l => { const r = ref(l.note), v = +l.value; if (!r || !isFinite(v)) return ''; if (r.hi != null && v > r.hi) return 'up'; if (r.lo != null && v < r.lo) return 'down'; return ''; };

  const openG = new Set(['glyc']), openT = new Set(); let q = '', pageN = 8;
  const keyOf = l => l.type !== 'other' ? l.type : 'o:' + String(l.name || '').toLowerCase();

  function build() {
    const L = (db.labs || []).filter(x => x && x.date).slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
    const tests = {}; L.forEach(x => { (tests[keyOf(x)] = tests[keyOf(x)] || []).push(x); });
    const by = {}; Object.keys(tests).forEach(k => { const arr = tests[k], g = groupOf(arr[0]); (by[g] = by[g] || []).push({ key: k, arr }); });
    return { L, tests, by };
  }

  function row(t) {
    const x = t.arr[0], prev = t.arr.find(y => y !== x && y.date < x.date && String(y.unit || '').trim().toLowerCase() === String(x.unit || '').trim().toLowerCase());
    const d = prev ? +x.value - +prev.value : null, f = flag(x), r = ref(x.note), key = t.key, open = openT.has(key);
    const chg = d !== null && isFinite(d) ? ` · было ${esc(num(prev.value))} (${d > 0 ? '+' : ''}${+d.toFixed(2)})` : '';
    const fl = f ? `<span class="lgFlag ${f}">${f === 'up' ? '▲ выше нормы' : '▼ ниже нормы'}</span>` : '';
    const dyn = (x.type !== 'other' && window.DMLabTrend && DMLabTrend.rows(x.type).length > 1) ? `<button class="btn secondary small" onclick="DMLabGroups.chart('${esc(x.type)}')">График</button>` : '';
    const hist = t.arr.map(h => `<tr><td>${fmt(h.date)}</td><td><b>${esc(num(h.value))}</b> ${esc(h.unit || '')}</td><td class="muted">${esc(String(h.note || '').replace(/^из документа:\s*/, '').replace(/(^|\s*·\s*)норма.*$/, ''))}</td><td><button class="btn small secondary" aria-label="Удалить" onclick="delLab('${esc(h.id)}')">✕</button></td></tr>`).join('');
    return `<div class="lgRow${open ? ' open' : ''}" data-k="${esc(key)}"><button type="button" class="lgHead" onclick="DMLabGroups.tog('${esc(key).replace(/'/g, '&#39;')}')"><span class="lgName">${esc(x.name)}</span><span class="lgVal"><b>${esc(num(x.value))}</b> ${esc(x.unit || '')}</span><span class="lgSub muted">${fmt(x.date)}${chg}${t.arr.length > 1 ? ` · ${t.arr.length} знач.` : ''}</span>${fl ? `<span class="lgSub">${fl}${r ? ` <span class="muted">норма ${esc(r.txt)}</span>` : ''}</span>` : (r ? `<span class="lgSub muted">норма ${esc(r.txt)}</span>` : '')}</button>${open ? `<div class="lgHist"><div class="tablewrap"><table class="table" style="width:100%"><tr><th align="left">Дата</th><th align="left">Значение</th><th align="left">Комментарий</th><th></th></tr>${hist}</table></div>${dyn ? `<div class="row" style="margin-top:6px">${dyn}</div>` : ''}</div>` : ''}</div>`;
  }

  function paint() {
    const lat = document.getElementById('labLatest'), list = document.getElementById('labList'); if (!lat || !list || typeof db === 'undefined') return;
    const { L, by, tests } = build(), nT = Object.keys(tests).length;
    const h = lat.previousElementSibling; if (h && h.tagName === 'H3') h.textContent = 'Мои анализы по группам';
    if (!L.length) { lat.innerHTML = 'Пока нет записей.'; list.innerHTML = 'Пока нет записей.'; return; }
    const ql = q.trim().toLowerCase();
    let html = nT > 8 ? `<input id="lgSearch" class="input" type="search" placeholder="Найти показатель" value="${esc(q)}" oninput="DMLabGroups.find(this.value)" style="margin-bottom:8px">` : '';
    GROUPS.forEach(g => {
      let arr = by[g[0]]; if (!arr) return;
      if (ql) arr = arr.filter(t => String(t.arr[0].name).toLowerCase().includes(ql)); if (!arr.length) return;
      arr = arr.slice().sort((a, b) => b.arr[0].date.localeCompare(a.arr[0].date) || String(a.arr[0].name).localeCompare(String(b.arr[0].name), 'ru'));
      const bad = arr.filter(t => flag(t.arr[0])).length, last = arr[0].arr[0].date, open = ql || openG.has(g[0]);
      html += `<details class="lgGroup" data-g="${g[0]}" ${open ? 'open' : ''} ontoggle="DMLabGroups.gt(this)"><summary><span class="lgGT">${esc(g[1])}</span><span class="pill">${arr.length} показател${arr.length === 1 ? 'ь' : arr.length < 5 ? 'я' : 'ей'}</span>${bad ? `<span class="lgFlag up">вне нормы: ${bad}</span>` : ''}<span class="muted lgLast">${fmt(last)}</span></summary>${arr.map(row).join('')}</details>`;
    });
    lat.className = ''; lat.innerHTML = html || '<p class="muted">Ничего не найдено.</p>';

    /* журнал по датам: порциями */
    const byDate = {}; L.forEach(x => { (byDate[x.date] = byDate[x.date] || []).push(x); });
    const dates = Object.keys(byDate).sort().reverse(), shown = dates.slice(0, pageN);
    list.className = '';
    list.innerHTML = shown.map((d, i) => `<details class="lgDay" ${i === 0 ? 'open' : ''}><summary><b>${fmt(d)}</b> <span class="muted">· ${byDate[d].length} показател${byDate[d].length === 1 ? 'ь' : byDate[d].length < 5 ? 'я' : 'ей'}</span></summary><div class="tablewrap"><table class="table" style="width:100%">${byDate[d].map(x => `<tr><td>${esc(x.name)}</td><td><b>${esc(num(x.value))}</b> ${esc(x.unit || '')}</td><td class="muted">${esc(String(x.note || '').replace(/^из документа:\s*/, '').replace(/(^|\s*·\s*)норма.*$/, ''))}</td><td><button class="btn small secondary" aria-label="Удалить" onclick="delLab('${esc(x.id)}')">✕</button></td></tr>`).join('')}</table></div></details>`).join('')
      + (dates.length > pageN ? `<div class="row" style="margin-top:8px"><button class="btn secondary small" onclick="DMLabGroups.more()">Показать ещё (осталось дат: ${dates.length - pageN})</button></div>` : '');
    const jh = list.parentElement && list.parentElement.querySelector('h3'); if (jh) jh.textContent = 'Журнал по датам';
  }

  window.DMLabGroups = {
    groupOf,
    paint,
    tog(k) { if (openT.has(k)) openT.delete(k); else openT.add(k); paint(); },
    gt(el) { if (q) return; const g = el.dataset.g; if (el.open) openG.add(g); else openG.delete(g); },
    find(v) { q = v; paint(); const i = document.getElementById('lgSearch'); if (i) { i.focus(); try { i.setSelectionRange(v.length, v.length); } catch (e) {} } },
    more() { pageN += 8; paint(); },
    chart(t) { if (window.DMLabTrend) { DMLabTrend.pick(t); const b = document.getElementById('labTrend'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  };
  const orig = window.renderLabs;
  if (typeof orig === 'function' && !orig.__lg) { const w = function () { const r = orig.apply(this, arguments); try { paint(); } catch (e) { } return r; }; w.__lg = true; window.renderLabs = w; }
  const os = window.show;
  if (typeof os === 'function') window.show = function (id) { const r = os.apply(this, arguments); if (id === 'labs') setTimeout(paint, 100); return r; };
})();
