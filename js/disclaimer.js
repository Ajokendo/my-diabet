/* v64.53: предупреждение при первом запуске — один раз на устройстве. */
(function () {
  const KEY = 'dm-disclaimer-v1';
  try { if (localStorage.getItem(KEY)) return } catch (e) { return }
  function show() {
    if (document.getElementById('dmDisc')) return;
    const d = document.createElement('div'); d.id = 'dmDisc';
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    d.innerHTML = `<div style="background:#fff;color:#0f172a;max-width:460px;width:100%;max-height:90vh;overflow:auto;border-radius:18px;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-size:16px;line-height:1.5">
<h2 style="margin:0 0 10px;font-size:21px">Перед началом</h2>
<p style="margin:0 0 10px">«Мой диабет» — помощник для самоконтроля. Он <b>не является медицинским изделием и не заменяет врача</b>.</p>
<ul style="padding-left:20px;margin:0 0 12px">
<li>Дозу инсулина приложение считает <b>только по коэффициентам, которые назначил ваш врач</b>. Без них расчёт не работает.</li>
<li>Углеводы, ХЕ и вес — ориентир. Сверяйте с упаковкой и весами; распознавание по фото приблизительное.</li>
<li>Окончательное решение о дозе принимаете вы вместе с лечащим врачом. При плохом самочувствии, гипогликемии или кетонах действуйте по плану врача.</li>
<li>Записи хранятся на этом устройстве. Общий дневник семьи работает, только если вы сами подключите сервер.</li></ul>
<button id="dmDiscOk" style="width:100%;padding:13px;border:0;border-radius:12px;background:#0f8f80;color:#fff;font-weight:700;font-size:16px;cursor:pointer">Понятно</button></div>`;
    document.body.appendChild(d);
    document.getElementById('dmDiscOk').onclick = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch (e) {} d.remove() };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
