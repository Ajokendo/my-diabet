/* v64.55: раздел «Безопасность»: экстренный экран SOS, памятка для школы,
   ротация мест уколов, напоминание о резервной копии.
   Данные — db.care (синхронизируется с семьёй как запись care|1). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const HYPO_DEFAULT = 'Признаки: бледность, пот, дрожь, слабость, сильный голод, раздражительность, сонливость, странное поведение.\n' +
    'Что делать: сразу дать 15 г быстрых углеводов — полстакана (150 мл) сока или сладкого напитка (не «лайт»), или 3–4 таблетки глюкозы, или 1 столовую ложку сахара.\n' +
    'Через 15 минут проверить сахар. Если всё ещё ниже 3,9 — повторить.\n' +
    'Если ребёнок без сознания или не может глотать: НИЧЕГО не давать в рот, повернуть на бок, ввести глюкагон (если есть и вы обучены), вызвать скорую 103 и позвонить родителям.';
  function C() {
    db.care = db.care || {};
    const c = db.care;
    c.contacts = Array.isArray(c.contacts) ? c.contacts : [];
    c.sites = Array.isArray(c.sites) ? c.sites : [];
    c.school = c.school || {};
    if (c.hypo == null) c.hypo = HYPO_DEFAULT;
    return c;
  }
  const pname = () => (C().name || (db.profile && (db.profile.firstName || db.profile.name)) || '').trim();
  const tel = p => String(p || '').replace(/[^\d+]/g, '');
  function saveCare() { C().updatedAt = Date.now(); save(); }

  /* ---------- SOS ---------- */
  function sos() {
    const c = C(), L = window.DMCgm && DMCgm.latest ? DMCgm.latest() : null;
    const g = L && L.age < 30 ? `<div class="sosG">Последний сахар: <b>${f1(L.g)}</b> ммоль/л ${esc(L.arrow || '')} <small>(${Math.round(L.age)} мин назад)</small></div>` : '';
    const contacts = c.contacts.filter(x => x && x.phone);
    const el = document.createElement('div'); el.id = 'sosScreen'; el.className = 'sosScreen';
    el.innerHTML = `<button class="sosClose" onclick="DMCare.closeSos()" aria-label="Закрыть">✕</button>
<div class="sosTop">🆘</div>
<h1>У меня диабет 1 типа</h1>
<h2 lang="ky">Менде 1-типтеги кант диабети бар</h2>
${pname() ? `<div class="sosName">${esc(pname())}${c.birth ? ', ' + esc(c.birth) : ''}</div>` : ''}
${g}
<div class="sosBox"><b>Если я бледный, потею, дрожу, веду себя странно — у меня может быть низкий сахар.</b><br>Дайте мне сладкое: сок, сладкий чай, сахар, конфету.<div class="ky" lang="ky">Эгер мен кубарып, тердеп, калтырап же өзүмдү түшүнүксүз алып жүрсөм — канымда кант азайып кетиши мүмкүн. Мага таттуу бериңиз: шире, таттуу чай, кант же конфет.</div></div>
<div class="sosBox red"><b>Если я без сознания — ничего не давайте в рот.</b> Положите на бок и вызовите скорую <b>103</b>.${c.glucagon ? `<br>Глюкагон: ${esc(c.glucagon)}` : ''}<div class="ky" lang="ky">Эгер эсимди жоготсом — оозума эч нерсе салбаңыз. Капталыма жаткырып, тез жардамга <b>103</b> чалыңыз.</div></div>
<div class="sosCalls">${contacts.map(x => `<a class="sosCall" href="tel:${esc(tel(x.phone))}">📞 ${esc(x.name || 'Позвонить')}<small>${esc(x.phone)}</small></a>`).join('')}<a class="sosCall amb" href="tel:103">🚑 Скорая 103</a></div>
${contacts.length ? '' : '<p class="sosHint">Добавьте телефоны родителей: «Ещё» → «Безопасность».</p>'}`;
    document.body.appendChild(el); document.body.classList.add('sheetOpen');
  }
  function closeSos() { const el = $('sosScreen'); if (el) el.remove(); document.body.classList.remove('sheetOpen') }

  /* ---------- памятка для школы ---------- */
  function schoolHtml(print) {
    const c = C(), s = c.school, contacts = c.contacts.filter(x => x && x.phone);
    const rows = [['Ученик', pname() + (c.birth ? ', ' + c.birth : '')], ['Класс', s.cls], ['Классный руководитель', s.teacher], ['Где глюкагон', c.glucagon], ['Аллергии', c.allergy], ['Лечащий врач', c.doctor]].filter(r => r[1]);
    return `<div class="schoolCard${print ? ' print' : ''}">
<h1>Памятка: ученик с сахарным диабетом 1 типа</h1>
<table>${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>
<h2>Низкий сахар (гипогликемия) — самое важное</h2>
<p>${esc(c.hypo).replace(/\n/g, '<br>')}</p>
<h2>Что ещё нужно знать</h2>
<ul><li>Ребёнку можно есть и пить в любой момент урока, если он чувствует низкий сахар, и выходить в туалет.</li>
<li>Перед физкультурой и после неё ребёнок может проверить сахар и перекусить.</li>
<li>Не отпускайте ребёнка с признаками низкого сахара одного — ни в медпункт, ни домой.</li>
${s.notes ? `<li>${esc(s.notes)}</li>` : ''}</ul>
<h2>Кому звонить</h2>
<table>${contacts.map(x => `<tr><th>${esc(x.name || '')}</th><td><b>${esc(x.phone)}</b></td></tr>`).join('')}<tr><th>Скорая помощь</th><td><b>103</b></td></tr></table>
<p class="small">Памятка составлена родителями в приложении «Мой диабет». План помощи согласуйте с лечащим врачом.</p></div>`;
  }
  function printSchool() {
    const w = window.open('', '_blank');
    if (!w) return alert('Браузер не дал открыть окно печати. Разрешите всплывающие окна для этого сайта.');
    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Памятка для школы</title><style>
body{font:15px/1.5 Arial,sans-serif;color:#111;margin:24px}h1{font-size:22px;margin:0 0 12px}h2{font-size:17px;margin:18px 0 6px;color:#b91c1c}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}th{width:38%;background:#f5f5f5}
.small{color:#555;font-size:12px;margin-top:18px}@media print{body{margin:10mm}}</style></head><body>${schoolHtml(true)}
<script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- места уколов ---------- */
  const ZONES = [
    ['bellyL', 'Живот слева', 'front', 88, 128, 16, 18], ['bellyR', 'Живот справа', 'front', 122, 128, 16, 18],
    ['thighL', 'Бедро левое', 'front', 84, 205, 12, 26], ['thighR', 'Бедро правое', 'front', 126, 205, 12, 26],
    ['armL', 'Плечо левое (сзади)', 'back', 52, 98, 9, 18], ['armR', 'Плечо правое (сзади)', 'back', 158, 98, 9, 18],
    ['buttL', 'Ягодица левая', 'back', 88, 165, 15, 13], ['buttR', 'Ягодица правая', 'back', 122, 165, 15, 13]];
  const zname = z => (ZONES.find(x => x[0] === z) || [, z])[1];
  function lastUse() { const m = {}; C().sites.forEach(x => { if (!m[x.z] || x.t > m[x.z]) m[x.z] = x.t }); return m }
  function suggest() { const m = lastUse(); return ZONES.map(z => z[0]).sort((a, b) => (m[a] || 0) - (m[b] || 0))[0] }
  function ago(t) { if (!t) return 'ещё не кололи'; const h = (Date.now() - t) / 36e5; if (h < 1) return 'меньше часа назад'; if (h < 24) return Math.round(h) + ' ч назад'; const d = Math.round(h / 24); return d + ' ' + (d === 1 ? 'день' : d < 5 ? 'дня' : 'дней') + ' назад' }
  let pickKind = 'короткий';
  function body(side) {
    const m = lastUse(), sug = suggest();
    const sil = `<circle cx="105" cy="28" r="18"/><rect x="72" y="50" width="66" height="96" rx="22"/><rect x="44" y="56" width="20" height="78" rx="10"/><rect x="146" y="56" width="20" height="78" rx="10"/><rect x="74" y="140" width="28" height="110" rx="13"/><rect x="108" y="140" width="28" height="110" rx="13"/>`;
    const zs = ZONES.filter(z => z[2] === side).map(([id, nm, , x, y, rx, ry]) => {
      const t = m[id], h = t ? (Date.now() - t) / 36e5 : 1e9;
      const cls = id === sug ? 'sug' : h < 72 ? 'rest' : 'ok';
      return `<ellipse class="z ${cls}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" onclick="DMCare.site('${id}')"><title>${esc(nm)}</title></ellipse>`;
    }).join('');
    return `<figure class="bodyFig"><svg viewBox="0 0 210 260" role="img" aria-label="${side === 'front' ? 'Спереди' : 'Сзади'}"><g class="sil">${sil}</g>${zs}</svg><figcaption>${side === 'front' ? 'Спереди' : 'Сзади'}</figcaption></figure>`;
  }
  function sitesHtml() {
    const m = lastUse(), sug = suggest(), last = C().sites.slice(-5).reverse();
    return `<h3>Места уколов</h3>
<p class="muted">Меняйте места уколов, чтобы под кожей не появлялись уплотнения (липодистрофии) — из них инсулин всасывается хуже. Нажмите на зону после укола.</p>
<div class="siteSug">Сегодня лучше колоть: <b>${esc(zname(sug))}</b> <small class="muted">(${esc(ago(m[sug]))})</small></div>
<div class="afChips careKinds" style="margin:8px 0">${['короткий', 'длинный'].map(k => `<button class="${k === pickKind ? 'on' : ''}" onclick="DMCare.kind('${k}')">${k === 'короткий' ? 'Короткий (на еду)' : 'Длинный (базальный)'}</button>`).join('')}</div>
<div class="bodyWrap">${body('front')}${body('back')}</div>
<div class="siteLegend"><span><i class="sug"></i>советуем</span><span><i class="rest"></i>отдыхает (до 3 дней)</span><span><i class="ok"></i>можно</span></div>
${last.length ? `<div class="siteLast"><b>Последние уколы</b>${last.map(x => `<div>${new Date(x.t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${esc(zname(x.z))}${x.k ? ' · ' + esc(x.k) : ''}</div>`).join('')}<button class="btn secondary small" style="margin-top:6px" onclick="DMCare.undoSite()">Отменить последнюю отметку</button></div>` : ''}
<p class="muted" style="font-size:13px">Какие места подходят для какого инсулина, подскажет врач или медсестра школы диабета.</p>`;
  }
  function site(z) {
    if (!confirm(`Отметить укол: ${zname(z)} (${pickKind}) — сейчас?`)) return;
    C().sites.push({ t: Date.now(), z, k: pickKind }); C().sites = C().sites.slice(-300); saveCare(); paint();
  }

  /* ---------- резервная копия (для работы без сервера) ---------- */
  const BK = 'dm-backup-at';
  const lastBackup = () => { try { return +localStorage.getItem(BK) || 0 } catch (e) { return 0 } };
  const hasFamily = () => !!(db.cloud2 && db.cloud2.token);
  async function backupNow() {
    try {
      const env = core.transfer.createEnvelope(db, { sourceInstallationId: db.device?.id || null, sourcePlatform: db.device?.platform || 'web', encryption: 'none' });
      const name = 'moy-diabet-kopiya-' + today() + '.json', text = JSON.stringify(env);
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Мой диабет — резервная копия', text: 'Резервная копия дневника «Мой диабет» от ' + today() }) }
        catch (e) { if (e && e.name === 'AbortError') return; DMBackup.download(text, name) }
      } else DMBackup.download(text, name);
      try { localStorage.setItem(BK, String(Date.now())) } catch (e) {}
      paint(); banner();
    } catch (e) { alert('Не удалось сделать копию: ' + (e.message || e)) }
  }
  function backupHtml() {
    const t = lastBackup(), days = t ? Math.floor((Date.now() - t) / 864e5) : null;
    return `<h3>Резервная копия</h3>
<p class="muted">${hasFamily() ? 'Записи хранятся и на телефоне, и в общем дневнике семьи. Копия — дополнительная страховка.' : 'Без сервера записи хранятся только на этом телефоне. Если телефон потеряется или сломается, они пропадут. Раз в неделю сохраняйте копию — себе в Telegram, WhatsApp «Избранное», Google Диск или на почту.'}</p>
<div class="siteSug backupInfo">${t ? `Последняя копия: <b>${days === 0 ? 'сегодня' : days + ' дн. назад'}</b>` : '<b>Копий ещё не было.</b>'}</div>
<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn" onclick="DMCare.backup()">Сохранить копию</button><button class="btn secondary" onclick="document.getElementById('careRestore').click()">Восстановить из файла</button></div>
<input type="file" id="careRestore" accept=".json,application/json" hidden onchange="importData(event)">
<p class="muted" style="font-size:13px">Копия не зашифрована: храните её только у себя. Зашифрованная копия с паролем — в «Настройках».</p>`;
  }
  function banner() {
    const id = 'bkBanner', old = $(id); if (old) old.remove();
    if (hasFamily()) return;
    const t = lastBackup(); let snooze = 0; try { snooze = +localStorage.getItem('dm-backup-snooze') || 0 } catch (e) {}
    const hasData = Object.keys(db.menus || {}).length > 2;
    if (!hasData || Date.now() - t < 7 * 864e5 || Date.now() < snooze) return;
    const host = document.querySelector('#dashboard .grid'); if (!host) return;
    const d = document.createElement('div'); d.id = id; d.className = 'card s12 bkBanner';
    d.innerHTML = `<div><b>💾 Пора сохранить резервную копию</b><div class="muted">${t ? 'Последняя — ' + Math.floor((Date.now() - t) / 864e5) + ' дн. назад.' : 'Записи хранятся только на этом телефоне.'}</div></div><div class="row" style="gap:6px"><button class="btn small" onclick="DMCare.backup()">Сохранить</button><button class="btn secondary small" onclick="DMCare.snooze()">Позже</button></div>`;
    host.prepend(d);
  }

  /* ---------- раздел ---------- */
  function contactsHtml() {
    const c = C(); const list = c.contacts.length ? c.contacts : [{ name: '', phone: '' }];
    return list.map((x, i) => `<div class="careContact"><input class="input" placeholder="Кто (мама, папа…)" value="${esc(x.name)}" onchange="DMCare.setContact(${i},'name',this.value)"><input class="input" type="tel" inputmode="tel" placeholder="+996 …" value="${esc(x.phone)}" onchange="DMCare.setContact(${i},'phone',this.value)"><button class="btn secondary small" onclick="DMCare.delContact(${i})" aria-label="Удалить">✕</button></div>`).join('') +
      `<button class="btn secondary small" onclick="DMCare.addContact()">＋ Ещё телефон</button>`;
  }
  const field = (k, label, ph, path) => `<label>${label}</label><input class="input" placeholder="${ph}" value="${esc(path ? (C()[path] || {})[k] : C()[k])}" onchange="DMCare.set('${k}',this.value${path ? `,'${path}'` : ''})">`;
  function paint() {
    const el = $('careBody'); if (!el) return; const c = C();
    el.innerHTML = `
<div class="card s12 sosCard"><div><h3 style="margin:0">🆘 Экстренный экран</h3><p class="muted" style="margin:4px 0 0">Крупно, на русском и кыргызском: «у меня диабет 1 типа», что делать и кнопки звонка. Покажите прохожему, водителю, охраннику.</p></div><button class="btn sosBtn" onclick="DMCare.sos()">Открыть SOS</button></div>
<div class="card s6"><h3>Данные для экстренной помощи</h3>
${field('name', 'Имя ребёнка', pname() || 'Айдар')}${field('birth', 'Возраст или дата рождения', '10 лет')}
<label>Телефоны родителей</label>${contactsHtml()}
${field('glucagon', 'Где глюкагон / сладкое', 'в рюкзаке, в переднем кармане')}${field('allergy', 'Аллергии', 'нет')}${field('doctor', 'Лечащий врач (имя, телефон)', '')}
<label>План при низком сахаре <small class="muted">— сверьте с врачом и при необходимости измените</small></label>
<textarea class="input" rows="7" onchange="DMCare.set('hypo',this.value)">${esc(c.hypo)}</textarea>
<button class="btn secondary small" onclick="DMCare.resetHypo()">Вернуть стандартный текст</button></div>
<div class="card s6"><h3>Памятка для школы</h3><p class="muted">Для учителя, медсестры, тренера, бабушки: признаки низкого сахара, что дать, кому звонить. Распечатайте или сохраните в PDF и отдайте классному руководителю.</p>
${field('cls', 'Класс', '4 «Б»', 'school')}${field('teacher', 'Классный руководитель', '', 'school')}${field('notes', 'Особые указания', 'перекус на 2-й перемене', 'school')}
<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" onclick="DMCare.printSchool()">🖨 Распечатать / PDF</button><button class="btn secondary" onclick="DMCare.previewSchool()">Посмотреть</button></div>
<div id="schoolPreview"></div>
<p class="muted" style="font-size:13px;margin-top:10px">Учителю можно дать и доступ к сахару в реальном времени — приглашение с ролью «Только просмотр» в «Семье» (нужен сервер семьи).</p></div>
<div class="card s12" id="careSites">${sitesHtml()}</div>
<div class="card s12" id="careBackup">${backupHtml()}</div>`;
  }
  function render() { paint() }
  function addSosChip() {
    const top = document.querySelector('#dashboard .glucoseHero'); if (!top || $('sosChip')) return;
    const b = document.createElement('button'); b.id = 'sosChip'; b.className = 'sosChip'; b.textContent = 'SOS'; b.title = 'Экстренный экран'; b.onclick = sos;
    top.appendChild(b);
  }
  function init() {
    addSosChip(); banner();
    const _show = window.show;
    if (typeof _show === 'function' && !_show._care) {
      window.show = function (id) { const r = _show.apply(this, arguments); if (id === 'care') render(); if (id === 'dashboard') { addSosChip(); banner() } return r };
      window.show._care = true;
    }
  }
  window.DMCare = {
    sos, closeSos, printSchool, render, backup: backupNow,
    previewSchool() { const p = $('schoolPreview'); if (p) p.innerHTML = p.innerHTML ? '' : schoolHtml(false) },
    set(k, v, path) { if (path) { C()[path] = C()[path] || {}; C()[path][k] = v.trim() } else C()[k] = k === 'hypo' ? v : v.trim(); saveCare() },
    setContact(i, k, v) { const c = C(); while (c.contacts.length <= i) c.contacts.push({ name: '', phone: '' }); c.contacts[i][k] = v.trim(); saveCare() },
    addContact() { C().contacts.push({ name: '', phone: '' }); paint() },
    delContact(i) { C().contacts.splice(i, 1); saveCare(); paint() },
    resetHypo() { if (confirm('Вернуть стандартный текст плана при низком сахаре?')) { C().hypo = HYPO_DEFAULT; saveCare(); paint() } },
    site, kind(k) { pickKind = k; const s = $('careSites'); if (s) s.innerHTML = sitesHtml() },
    undoSite() { if (confirm('Удалить последнюю отметку укола?')) { C().sites.pop(); saveCare(); paint() } },
    snooze() { try { localStorage.setItem('dm-backup-snooze', String(Date.now() + 2 * 864e5)) } catch (e) {} banner() },
    suggest, zname
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400)); else setTimeout(init, 400);
})();
