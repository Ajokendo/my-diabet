/* v64.45: откуда берётся сахар — xDrip+, облака LibreLinkUp (FreeStyle Libre), Dexcom Share, Nightscout.
   Карточка в «Семье» под «Сенсор (xDrip+)». Пароли уходят только на наш сервер, хранятся там зашифрованными. */
(function () {
  let src = null, loaded = false, busy = false, msg = '', form = '';
  const C = () => (window.db && db.cloud2) || {};
  const ready = () => !!(C().token && C().patientId);
  const server = () => (C().server || 'https://my-diabet.ajokendo.workers.dev').replace(/\/$/, '');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  async function api(method, body) {
    const r = await fetch(server() + `/v1/patients/${encodeURIComponent(C().patientId)}/cgm-source`, { method, headers: { Authorization: 'Bearer ' + C().token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch (e) {}
    if (r.status === 404 && j.error === 'Не найдено') throw new Error('Сервер ещё старой версии: в Cloudflare нужно вставить новый код (cloudflare-worker-NEW-v64.js) и нажать Deploy.');
    if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status)); return j;
  }
  async function load() { if (!ready()) return; try { const j = await api('GET'); src = j.source; loaded = true } catch (e) { loaded = true; src = null; if (!/404|Не найдено|старой версии/.test(e.message)) msg = '' } render() }
  const ago = t => { if (!t) return 'ещё не было'; const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : Math.round(m / 60) + ' ч назад' };
  const OPT = [
    ['libre', 'FreeStyle Libre 2 / 3', 'через LibreLinkUp'],
    ['dexcom', 'Dexcom G6 / G7 / ONE+', 'через Dexcom Share'],
    ['nightscout', 'Nightscout', 'если сахар уже уходит в Nightscout'],
  ];
  function formHtml(k) {
    if (k === 'libre') return `<ol class="srcSteps"><li>На телефоне родителя установите приложение <b>LibreLinkUp</b> и создайте аккаунт.</li><li>На телефоне ребёнка в приложении <b>FreeStyle LibreLink</b> (или Libre 3): «Подключённые приложения» → LibreLinkUp → пригласите эту почту.</li><li>В LibreLinkUp примите приглашение. Затем введите здесь почту и пароль <b>LibreLinkUp</b>.</li></ol>
<label>Почта LibreLinkUp</label><input id="srcUser" class="input" type="email" autocomplete="off"><label style="margin-top:8px">Пароль LibreLinkUp</label><input id="srcPass" class="input" type="password" autocomplete="new-password">`;
    if (k === 'dexcom') return `<ol class="srcSteps"><li>В приложении Dexcom на телефоне ребёнка включите <b>Share</b> и добавьте хотя бы одного наблюдателя (Follow) — без этого Dexcom не отдаёт данные.</li><li>Введите здесь логин и пароль <b>аккаунта Dexcom ребёнка</b> (того, что в приложении Dexcom, а не Follow).</li></ol>
<label>Логин Dexcom (почта, телефон или имя)</label><input id="srcUser" class="input" autocomplete="off"><label style="margin-top:8px">Пароль Dexcom</label><input id="srcPass" class="input" type="password" autocomplete="new-password">
<label style="margin-top:8px">Регион аккаунта</label><select id="srcRegion" class="select"><option value="ous" selected>Вне США (Кыргызстан, Европа и др.)</option><option value="us">США</option><option value="jp">Япония</option></select>`;
    if (k === 'nightscout') return `<p class="muted" style="margin:0 0 6px">Подойдёт, если приложение сенсора (Juggluco, xDrip+, AiDEX и др.) уже отправляет сахар в ваш Nightscout. Новые значения будут подтягиваться каждые 5 минут.</p>
<label>Адрес Nightscout</label><input id="srcUrl" class="input" placeholder="https://имя.ваш-nightscout.ru" autocomplete="off"><label style="margin-top:8px">API secret или токен для чтения (если сайт закрыт)</label><input id="srcPass" class="input" type="password" autocomplete="new-password" placeholder="можно оставить пустым">`;
    return '';
  }
  function render() {
    const host = $('sync2'); if (!host || !ready()) return;
    let box = $('cgmSources');
    if (!box) { box = document.createElement('div'); box.id = 'cgmSources'; box.className = 'card'; box.style.marginTop = '14px'; const after = $('cgmFamily'); after && after.nextSibling ? host.insertBefore(box, after.nextSibling) : host.appendChild(box) }
    if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    const otherOpen = !!window.DMSources && DMSources._o;
    const canWrite = C().role !== 'viewer';
    let html = `<h3 style="margin-top:0">Другие сенсоры</h3>`;
    if (src) {
      html += `<div class="srcNow"><div><b>Подключено: ${esc(src.name)}</b>${src.person ? ` · ${esc(src.person)}` : ''}<div class="muted">${esc(src.user || '')} · последнее получение ${ago(src.lastOk)}</div>${src.lastErr ? `<div class="srcErr">${esc(src.lastErr)}</div>` : ''}</div></div>
${canWrite ? `<div class="srcBtns"><button class="btn secondary" ${busy ? 'disabled' : ''} onclick="DMSources.poll()">Обновить сейчас</button><button class="btn secondary" ${busy ? 'disabled' : ''} onclick="DMSources.remove()">Отключить</button></div>` : ''}`;
    } else if (canWrite) {
      html += `<p class="muted" style="margin-top:0">Если у ребёнка не xDrip+, сахар можно брать из облака производителя сенсора. Выберите свой сенсор:</p>
<div class="srcOpts">${OPT.map(([k, t, s]) => `<button class="srcOpt${form === k ? ' on' : ''}" onclick="DMSources.pick('${k}')"><b>${t}</b><span>${s}</span></button>`).join('')}</div>
${form ? `<div class="srcForm">${formHtml(form)}<button class="btn" style="width:100%;margin-top:10px" ${busy ? 'disabled' : ''} onclick="DMSources.save()">${busy ? 'Проверяю…' : 'Подключить'}</button>
<div class="muted srcNote">Пароль сохраняется на нашем сервере в зашифрованном виде и нужен только для того, чтобы забирать сахар каждые 5 минут. Это неофициальный способ, которым пользуются Nightscout и другие приложения: производитель может его изменить, тогда подключение придётся обновить.</div></div>` : ''}`;
    } else html += '<p class="muted">Подключить может только родитель или сам пациент.</p>';
    html += `<details class="srcOther"${otherOpen?' open':''} ontoggle="DMSources._o=this.open"><summary>LinX, AiDEX, Yuwell Anytime, Sibionics, Ottai и другие</summary><p class="muted">У этих сенсоров нет открытого облака. Работает так: <b>xDrip+</b> (режим «Companion App» читает уведомления официального приложения) или <b>Juggluco</b>, а они отправляют сахар сюда — карточка «Сенсор (xDrip+)» выше. Если ваше приложение сенсора умеет отправлять в Nightscout — выберите «Nightscout».</p></details>`;
    if (msg) html += `<div class="srcMsg">${msg}</div>`;
    box.innerHTML = html;
  }
  async function save() {
    const k = form, v = id => ($(id) && $(id).value || '').trim();
    const body = { kind: k, user: v('srcUser'), pass: $('srcPass') ? $('srcPass').value : '', region: v('srcRegion') || 'ous', url: v('srcUrl') };
    try { document.activeElement && document.activeElement.blur() } catch (e) {}
    busy = true; msg = ''; render();
    try { const j = await api('POST', body); msg = `✓ Подключено${j.person ? ': ' + esc(j.person) : ''}. Получено показаний: ${j.added}.${j.people && j.people.length > 1 ? ' В аккаунте несколько человек — показан первый.' : ''}`; form = ''; await load(); try { DMCgm.refresh(true) } catch (e) {} }
    catch (e) { msg = '<span class="srcErr">' + esc(e.message) + '</span>' }
    busy = false; render();
  }
  async function poll() { busy = true; render(); try { const j = await api('POST', { poll: true }); msg = j.err ? '<span class="srcErr">' + esc(j.err) + '</span>' : `Получено новых показаний: ${j.added}.`; await load(); try { DMCgm.refresh(true) } catch (e) {} } catch (e) { msg = '<span class="srcErr">' + esc(e.message) + '</span>' } busy = false; render() }
  async function remove() { if (!confirm('Отключить облако сенсора? Уже полученные показания останутся.')) return; busy = true; render(); try { await api('POST', { remove: true }); src = null; msg = 'Отключено.' } catch (e) { msg = esc(e.message) } busy = false; render() }
  const _show = window.show; if (typeof _show === 'function') window.show = function (id) { const r = _show.apply(this, arguments); if (id === 'account') setTimeout(load, 200); return r };
  window.DMSources = { load, render, save, poll, remove, pick(k) { form = form === k ? '' : k; msg = ''; render() } };
  setTimeout(load, 2500);
})();
