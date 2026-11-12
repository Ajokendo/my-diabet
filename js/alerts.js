/* v64.23: уведомления о сахаре на этом телефоне (Web Push).
   Работают при закрытом приложении. На iPhone — только если приложение добавлено на экран «Домой» (iOS 16.4+).
   Сервер присылает сигнал, когда xDrip+ передал новое значение: низкий, очень низкий, высокий, быстро падает;
   «нет данных» — если на сервере включён cron. Настройки хранятся на сервере для каждого телефона отдельно. */
(function () {
  const DEF = { predLowOn: true, predHighOn: false, low: 3.9, high: 13, lowOn: true, highOn: true, fallOn: true, staleOn: true, repeat: 30, quietOn: false, quietFrom: '23:00', quietTo: '07:00', sound: true };
  const LS = 'dm-alerts';
  let msg = '', busy = false;
  const C = () => (window.db && db.cloud2) || {};
  const ready = () => !!(C().token && C().patientId);
  const server = () => (C().server || 'https://my-diabet.ajokendo.workers.dev').replace(/\/$/, '');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = () => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(LS) || '{}')) } catch (e) { return Object.assign({}, DEF) } };
  const store = p => { try { localStorage.setItem(LS, JSON.stringify(p)) } catch (e) {} };
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function api(path, method, body) {
    const r = await fetch(server() + path, { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + C().token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch (e) {}
    if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status)); return j;
  }
  const b2u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++)o[i] = b.charCodeAt(i); return o };
  async function currentSub() { if (!supported()) return null; const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription() }
  async function send(p) {
    const sub = await currentSub(); if (!sub) return false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bishkek';
    await api(`/v1/patients/${encodeURIComponent(C().patientId)}/push`, 'POST', { subscription: sub.toJSON(), prefs: Object.assign({}, p, { tz }) });
    return true;
  }
  async function enable() {
    if (busy) return; busy = true; msg = ''; render();
    try {
      if (!supported()) throw new Error('Этот браузер не умеет получать уведомления.');
      if (isIOS() && !standalone()) throw new Error('На iPhone сначала добавьте приложение на экран «Домой» (Поделиться → «На экран Домой») и откройте его с иконки.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Уведомления запрещены. Разрешите их в настройках телефона для этого приложения.');
      const { key } = await api('/v1/push/key');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b2u(key) });
      const p = load(); p.on = true; store(p); await send(p);
      msg = 'Уведомления включены на этом телефоне.';
    } catch (e) { msg = e.message || String(e) }
    busy = false; render();
  }
  async function disable() {
    if (!confirm('Выключить уведомления о сахаре на этом телефоне?')) return;
    busy = true; render();
    try { const sub = await currentSub(); if (sub) { try { await api(`/v1/patients/${encodeURIComponent(C().patientId)}/push`, 'POST', { remove: true, endpoint: sub.endpoint }) } catch (e) {} await sub.unsubscribe() } const p = load(); p.on = false; store(p); msg = 'Уведомления выключены.' } catch (e) { msg = e.message || String(e) }
    busy = false; render();
  }
  async function test() {
    busy = true; msg = ''; render();
    try { const sub = await currentSub(); if (!sub) throw new Error('Сначала включите уведомления.'); await api(`/v1/patients/${encodeURIComponent(C().patientId)}/push-test`, 'POST', { endpoint: sub.endpoint }); msg = 'Тестовое уведомление отправлено — должно прийти через несколько секунд.' } catch (e) { msg = e.message || String(e) }
    busy = false; render();
  }
  let saveT;
  function set(k, v) {
    const p = load(); p[k] = v; store(p);
    clearTimeout(saveT); saveT = setTimeout(async () => { try { if (await send(load())) { msg = 'Настройки сохранены.'; render() } } catch (e) { msg = e.message; render() } }, 500);
    render();
  }
  async function render() {
    const host = document.getElementById('sync2'); if (!host || !ready()) return;
    let box = document.getElementById('alertsCard');
    if (!box) { box = document.createElement('div'); box.id = 'alertsCard'; box.className = 'card'; box.style.marginTop = '14px'; host.appendChild(box) }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'checkbox') return;
    const p = load();
    let on = false; try { on = !!(await currentSub()) && Notification.permission === 'granted' } catch (e) {}
    const chk = (k, t) => `<label class="alRow"><input type="checkbox" ${p[k] ? 'checked' : ''} onchange="DMAlerts.set('${k}',this.checked)"> <span>${t}</span></label>`;
    const num = (k, step) => `<input class="input alNum" type="number" step="${step}" value="${p[k]}" onchange="DMAlerts.set('${k}',+this.value)">`;
    let body = '';
    if (!supported()) body = `<div class="notice">Этот браузер не поддерживает уведомления. Откройте приложение в Chrome (Android) или установите на экран «Домой» (iPhone).</div>`;
    else if (isIOS() && !standalone()) body = `<div class="notice"><b>На iPhone уведомления работают только из установленного приложения.</b><br>Safari → кнопка «Поделиться» → «На экран Домой». Затем откройте «Мой диабет» с иконки и включите уведомления здесь.</div>`;
    else if (!on) body = `<p class="muted" style="margin:0 0 10px">Сигнал придёт, даже если приложение закрыто: низкий, очень низкий и высокий сахар, быстрое падение. Сахар берётся с сенсора через xDrip+.</p><button class="btn" style="width:100%" ${busy ? 'disabled' : ''} onclick="DMAlerts.enable()">Включить уведомления на этом телефоне</button>`;
    else body = `<div class="alGrid">
${chk('lowOn', 'Низкий сахар')}<div class="alVal">ниже ${num('low', 0.1)}</div>
${chk('highOn', 'Высокий сахар')}<div class="alVal">выше ${num('high', 0.5)}</div>
${chk('fallOn', 'Быстро падает')}<div class="alVal muted">стрелка ↓ или ⇊</div>
${chk('predLowOn', 'Прогноз низкого')}<div class="alVal muted">за 5–45 мин до</div>
${chk('predHighOn', 'Прогноз высокого')}<div class="alVal muted">за 5–45 мин до</div>
${chk('staleOn', 'Нет данных с сенсора')}<div class="alVal muted">дольше 30 мин</div>
</div>
<div class="muted alNote">Очень низкий сахар (ниже 3,0) приходит всегда и повторяется каждые 10 минут.</div>
<div class="alGrid alGrid2" style="margin-top:8px">
<label>Повтор</label><select class="select" onchange="DMAlerts.set('repeat',+this.value)">${[15, 30, 60, 120].map(m => `<option value="${m}" ${+p.repeat === m ? 'selected' : ''}>раз в ${m < 60 ? m + ' мин' : m / 60 + ' ч'}</option>`).join('')}</select>
<label>Звук</label><select class="select" onchange="DMAlerts.set('sound',this.value==='1')"><option value="1" ${p.sound ? 'selected' : ''}>Со звуком и вибрацией</option><option value="0" ${!p.sound ? 'selected' : ''}>Тихо (только на экране)</option></select>
</div>
${chk('quietOn', 'Ночной режим: без сигналов о высоком сахаре')}
<div class="alQuiet" style="${p.quietOn ? '' : 'display:none'}">с <input class="input alTime" type="time" value="${esc(p.quietFrom)}" onchange="DMAlerts.set('quietFrom',this.value)"> до <input class="input alTime" type="time" value="${esc(p.quietTo)}" onchange="DMAlerts.set('quietTo',this.value)"></div>
<div class="muted alNote">Громкость — как у остальных уведомлений телефона: кнопки громкости и режим «Не беспокоить». На iPhone сигнал не звучит в беззвучном режиме; проверьте, что для «Мой диабет» включены звуки в Настройки → Уведомления.</div>
<div class="alBtns"><button class="btn secondary" ${busy ? 'disabled' : ''} onclick="DMAlerts.test()">Прислать тестовое</button><button class="btn secondary" ${busy ? 'disabled' : ''} onclick="DMAlerts.disable()">Выключить</button></div>`;
    box.innerHTML = `<h3 style="margin-top:0">Уведомления о сахаре на этом телефоне</h3>${body}${msg ? `<div class="muted" style="margin-top:8px">${esc(msg)}</div>` : ''}`;
  }
  /* при каждом открытии — освежаем подписку на сервере (на случай смены ключей браузером) */
  async function refreshSub() { try { if (ready() && load().on && Notification.permission === 'granted') await send(load()) } catch (e) {} }
  const origShow = window.show;
  if (typeof origShow === 'function') window.show = function (id) { const r = origShow.apply(this, arguments); if (id === 'account') setTimeout(render, 50); return r };
  setTimeout(() => { render(); refreshSub() }, 1500);
  window.DMAlerts = { enable, disable, test, set, render };
})();
