/* v64.115: автоматическая копия раз в сутки внутри приложения.
 * Раз в день (при открытии) приложение само сохраняет снимок дневника в памяти телефона (IndexedDB), хранит последние 14.
 * Снимок можно восстановить кнопкой в «Безопасность → Резервная копия». Это страховка от ошибок и случайных удалений;
 * от потери телефона защищает общий дневник на сервере и файловая копия (кнопка «Сохранить копию», напоминание — раз в сутки). */
(function () {
  const KEEP = 14, DB = 'dm-autobackup', ST = 'snaps';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dayOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function open() {
    return new Promise((ok, bad) => {
      if (!window.indexedDB) return bad(new Error('IndexedDB недоступна'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'date' });
      r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error);
    });
  }
  const run = (db, mode, fn) => new Promise((ok, bad) => { const t = db.transaction(ST, mode), s = t.objectStore(ST), q = fn(s); t.oncomplete = () => ok(q && q.result); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error) });
  async function list() { const d = await open(); try { return (await run(d, 'readonly', s => s.getAll())) || [] } finally { d.close() } }
  function hasData() { try { return Object.keys(db.menus || {}).length > 2 || (db.medical?.actualInsulinLog || []).length > 0 } catch (e) { return false } }
  async function snapshot(force) {
    if (!hasData()) return false;
    const d = await open();
    try {
      const date = dayOf(new Date()), all = (await run(d, 'readonly', s => s.getAll())) || [];
      if (!force && all.some(x => x.date === date)) return false;
      const env = core.transfer.createEnvelope(db, { sourceInstallationId: db.device?.id || null, sourcePlatform: db.device?.platform || 'web', encryption: 'none' });
      const text = JSON.stringify(env);
      await run(d, 'readwrite', s => s.put({ date, ts: Date.now(), size: text.length, text }));
      const keys = all.map(x => x.date).concat(date).filter((v, i, a) => a.indexOf(v) === i).sort();
      const drop = keys.slice(0, Math.max(0, keys.length - KEEP));
      if (drop.length) await run(d, 'readwrite', s => { drop.forEach(k => s.delete(k)) });
      return true;
    } finally { d.close() }
  }
  async function restore(date) {
    const d = await open(); let rec;
    try { rec = await run(d, 'readonly', s => s.get(date)) } finally { d.close() }
    if (!rec) return alert('Копия не найдена.');
    if (!confirm('Восстановить дневник из автоматической копии за ' + date.split('-').reverse().join('.') + '?\n\nВСЕ текущие данные на этом устройстве будут заменены данными из копии. Отменить это нельзя.\n\nПеред этим текущее состояние будет сохранено отдельной копией.')) return;
    try {
      try { await snapshot(true) } catch (e) {}
      const raw = JSON.parse(rec.text), env = raw.manifest ? raw : raw.data?.manifest ? raw.data : null;
      if (!env) throw new Error('Копия повреждена');
      db = core.transfer.restore(db, env); save(); location.reload();
    } catch (e) { alert('Не удалось восстановить: ' + (e.message || e)) }
  }
  async function paint() {
    const card = document.getElementById('careBackup'); if (!card) return;
    let box = document.getElementById('autoSnaps');
    if (!box) { box = document.createElement('div'); box.id = 'autoSnaps'; box.style.marginTop = '12px'; card.appendChild(box) }
    let items = []; try { items = (await list()).sort((a, b) => b.date.localeCompare(a.date)) } catch (e) { box.innerHTML = ''; return }
    box.innerHTML = `<details><summary><b>Автоматические копии на телефоне</b> (${items.length})</summary>
<p class="muted" style="margin:6px 0">Раз в сутки приложение само сохраняет снимок дневника, хранятся последние ${KEEP}. Это страховка от ошибок и случайных удалений. Если телефон потеряется, они пропадут вместе с ним, поэтому держите и файловую копию.</p>
${items.length ? items.map(x => `<div class="row" style="justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #e2e8f0"><span>${esc(x.date.split('-').reverse().join('.'))} <span class="muted">· ${Math.round(x.size / 1024)} КБ</span></span><button class="btn secondary small" onclick="DMAutoBackup.restore('${esc(x.date)}')">Восстановить</button></div>`).join('') : '<p class="muted">Пока нет копий.</p>'}
<button class="btn secondary small" style="margin-top:8px" onclick="DMAutoBackup.now()">Сделать снимок сейчас</button></details>`;
  }
  async function now() { try { await snapshot(true) } catch (e) { alert('Не удалось: ' + (e.message || e)) } paint() }
  async function tick() { try { await snapshot(false) } catch (e) {} }
  window.DMAutoBackup = { snapshot, restore, paint, now, list };
  const start = () => { setTimeout(tick, 8000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick() }); setInterval(tick, 3 * 3600e3) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
