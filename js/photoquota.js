/* v64.23: счётчик распознаваний по фото и коды пополнения.
   Своя семья — без лимита. Новая семья получает несколько бесплатных распознаваний, дальше — по коду.
   Коды создаёт автор приложения в «Семье» (карточка видна только ему) и отправляет по WhatsApp. */
(function () {
  let Q = null, loading = false, err = '', showCode = false, adminMsg = '', lastCodes = [], adminData = null;
  const C = () => (window.db && db.cloud2) || {};
  const ready = () => !!(C().token && C().patientId);
  const server = () => (C().server || 'https://my-diabet.ajokendo.workers.dev').replace(/\/$/, '');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(path, method, body) {
    const r = await fetch(server() + path, { method: method || 'GET', headers: { 'Authorization': 'Bearer ' + C().token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json() } catch (e) {}
    if (!r.ok) { const e = new Error(j.error || ('Ошибка ' + r.status)); e.status = r.status; throw e } return j;
  }
  async function refresh() {
    if (!ready() || loading) { render(); return } loading = true;
    try { Q = await api(`/v1/patients/${encodeURIComponent(C().patientId)}/photo-quota`); err = '' } catch (e) { err = e.status === 404 ? '' : e.message }
    loading = false; render(); renderAdmin();
  }
  function set(q) { if (q) { Q = Object.assign({}, Q || {}, q); render() } }
  function render() {
    const el = document.getElementById('phQuota'); if (!el) return;
    if (!ready()) { const legacy = !!(db.settings && db.settings.photo && db.settings.photo.code); el.innerHTML = legacy ? '' : `<div class="pqLine empty"><span>Чтобы распознавать фото, войдите в «Семью»: «Ещё» → «Семья».</span></div>`; return }
    if (!Q) { el.innerHTML = err ? `<div class="muted">${esc(err)}</div>` : ''; return }
    const codeBox = `<div class="pqCode"><input id="pqCodeIn" class="input" placeholder="Код, например F-ABCD-EFGH" autocomplete="off"><button class="btn" onclick="DMPhotoQuota.redeem()">Активировать</button></div>`;
    if (Q.unlimited) { el.innerHTML = `<div class="pqLine"><span>Распознавание по фото: <b>без ограничений</b></span><span class="muted">${Q.used || 0} фото</span></div>`; return }
    const left = +Q.left || 0;
    if (left <= 0) {
      el.innerHTML = `<div class="pqLine empty"><span><b>Распознавания закончились.</b> Чтобы продолжить, получите код${Q.contact ? ': ' + esc(Q.contact) : ' у автора приложения'} и введите его.</span></div>${codeBox}<div id="pqMsg" class="muted" style="margin-top:6px"></div>`;
      return;
    }
    el.innerHTML = `<div class="pqLine"><span>Осталось распознаваний: <b>${left}</b>${Q.freeLeft > 0 && Q.paidLeft > 0 ? ` <span class="muted">(${Q.freeLeft} бесплатных)</span>` : Q.paidLeft ? '' : ' <span class="muted">бесплатных</span>'}</span><button class="btn small secondary" onclick="DMPhotoQuota.toggleCode()">Ввести код</button></div>${showCode ? codeBox + '<div id="pqMsg" class="muted" style="margin-top:6px"></div>' : ''}`;
  }
  async function redeem() {
    const inp = document.getElementById('pqCodeIn'), m = document.getElementById('pqMsg'), code = (inp && inp.value || '').trim();
    if (!code) { if (m) m.textContent = 'Введите код.'; return }
    try { const j = await api(`/v1/patients/${encodeURIComponent(C().patientId)}/photo-code`, 'POST', { code }); Q = j.quota; showCode = false; render(); alert(`Код принят: +${j.added} распознаваний.`) }
    catch (e) { if (m) m.textContent = e.message }
  }
  /* ---- для автора: создание кодов ---- */
  async function renderAdmin() {
    const host = document.getElementById('sync2'); if (!host || !ready() || !Q || !Q.owner) { const b = document.getElementById('pqAdmin'); if (b && !(Q && Q.owner)) b.remove(); return }
    let box = document.getElementById('pqAdmin');
    if (!box) { box = document.createElement('div'); box.id = 'pqAdmin'; box.className = 'card pqAdmin'; box.style.marginTop = '14px'; host.appendChild(box) }
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const codes = (adminData && adminData.codes) || [], fam = (adminData && adminData.families) || [];
    const share = c => `https://wa.me/?text=${encodeURIComponent(`Код для распознавания еды по фото в «Мой диабет»: ${c}\nОткройте «Фото еды» → «Ввести код».`)}`;
    box.innerHTML = `<h3 style="margin-top:0">Коды для фото <span class="muted" style="font-weight:400;font-size:13px">— видите только вы</span></h3>
<div class="formgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><label>Распознаваний в коде</label><input id="pqPh" class="input" type="number" value="50" min="1"><span></span></div><div><label>Сколько кодов</label><input id="pqN" class="input" type="number" value="1" min="1" max="20"><span></span></div><div><label>Кому (заметка)</label><input id="pqNote" class="input" placeholder="например, Асель"><span></span></div></div>
<button class="btn" style="width:100%;margin-top:8px" onclick="DMPhotoQuota.create()">Создать код</button>
${lastCodes.length ? `<div class="notice" style="margin-top:10px">${lastCodes.map(c => `<div class="row" style="justify-content:space-between;gap:8px;margin:4px 0"><code>${esc(c)}</code><span class="row" style="gap:6px"><button class="btn small secondary" onclick="navigator.clipboard&&navigator.clipboard.writeText('${c}');this.textContent='Скопировано'">Копировать</button><a class="btn small" target="_blank" rel="noopener" href="${share(c)}">WhatsApp</a></span></div>`).join('')}</div>` : ''}
${adminMsg ? `<div class="muted" style="margin-top:6px">${esc(adminMsg)}</div>` : ''}
${codes.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">Выданные коды (${codes.length})</summary><table><tr><th>Код</th><th>Фото</th><th>Кому</th><th>Статус</th></tr>${codes.map(c => `<tr><td><code>${esc(c.code)}</code></td><td>${c.photos}</td><td>${esc(c.note || '')}</td><td>${c.used_at ? 'использован' + (c.display_name ? ': ' + esc(c.display_name) : '') : 'не использован'}</td></tr>`).join('')}</table></details>` : ''}
${fam.length ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700">Семьи и расход</summary><table><tr><th>Семья</th><th>Всего фото</th><th>Остаток по кодам</th></tr>${fam.map(f => `<tr><td>${esc(f.display_name || '—')}</td><td>${f.total_used}</td><td>${f.paid_left}</td></tr>`).join('')}</table></details>` : ''}`;
    if (!adminData) { adminData = {}; try { adminData = await api('/v1/admin/photo-codes'); renderAdmin() } catch (e) { adminData = null } }
  }
  async function create() {
    const ph = +document.getElementById('pqPh').value || 50, n = +document.getElementById('pqN').value || 1, note = document.getElementById('pqNote').value || '';
    try { const j = await api('/v1/admin/photo-codes', 'POST', { photos: ph, count: n, note }); lastCodes = j.codes; adminMsg = `Создано кодов: ${j.codes.length}, по ${j.photos} распознаваний. Отправьте код человеку после оплаты.`; adminData = null; renderAdmin() }
    catch (e) { adminMsg = e.message; renderAdmin() }
  }
  const origShow = window.show;
  if (typeof origShow === 'function') window.show = function (id) { const r = origShow.apply(this, arguments); if (id === 'photo') refresh(); if (id === 'account') setTimeout(refresh, 100); return r };
  setTimeout(refresh, 2000);
  window.DMPhotoQuota = { refresh, render, renderAdmin, redeem, create, set, toggleCode() { showCode = !showCode; render() }, headers() { return ready() ? { 'Authorization': 'Bearer ' + C().token } : {} }, patientId: () => C().patientId || '' };
})();
