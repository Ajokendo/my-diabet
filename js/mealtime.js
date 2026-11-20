/* v64.116: время приёма пищи. Поле «🕒 Время приёма» в карточке приёма (db.mealTimes[день][приём] = 'ЧЧ:ММ').
 * Нужно для точного разбора «еда → сахар через 1–3 часа»; если не указано, время берётся из записи укола или типовое. */
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = () => (document.getElementById('day')?.value) || (typeof today === 'function' ? today() : '');
  function set(meal, v) {
    const d = day(); db.mealTimes = db.mealTimes || {};
    if (!v) { if (db.mealTimes[d]) { delete db.mealTimes[d][meal]; if (!Object.keys(db.mealTimes[d]).length) delete db.mealTimes[d] } }
    else (db.mealTimes[d] = db.mealTimes[d] || {})[meal] = v;
    save(); inject();
  }
  function inject() {
    const host = document.getElementById('meals'); if (!host) return;
    const d = day();
    host.querySelectorAll('.meal').forEach(card => {
      const title = card.querySelector('.mealhead b')?.textContent; if (!title || card.querySelector('.mealTimeRow')) return;
      const val = db.mealTimes?.[d]?.[title] || '';
      let hint = '';
      if (!val) { try { const mt = mealTime(d, title); hint = mt.exact ? 'по записи укола: ' + hhmm(mt.min) : 'не указано — берётся типовое ' + hhmm(mt.min) } catch (e) {} }
      const row = document.createElement('div'); row.className = 'mealTimeRow';
      row.innerHTML = `<label>🕒 Время приёма</label><input type="time" class="input" value="${esc(val)}" onchange="DMMealTime.set('${esc(title)}',this.value)"><span class="muted">${esc(hint)}</span>`;
      const anchor = card.querySelector('.addFoodBtn'); anchor ? card.insertBefore(row, anchor) : card.appendChild(row);
    });
  }
  window.DMMealTime = { set, inject };
  const start = () => {
    const _rm = window.renderMeals;
    if (typeof _rm === 'function' && !_rm._mt) { window.renderMeals = function () { const r = _rm.apply(this, arguments); try { inject() } catch (e) {} return r }; window.renderMeals._mt = true; try { renderMeals() } catch (e) {} }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 400)); else setTimeout(start, 400);
})();
