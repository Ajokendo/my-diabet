/* v64.53: предупреждение при первом запуске — один раз на устройстве. */
(function () {
  const KEY = 'dm-disclaimer-v1';
  try { if (localStorage.getItem(KEY)) return } catch (e) { return }
  function show() {
    if (document.getElementById('dmDisc')) return;
    const d = document.createElement('div'); d.id = 'dmDisc';
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    const T = {
      ru: { h: 'Перед началом', p: '«Мой диабет» — помощник для самоконтроля. Он <b>не является медицинским изделием и не заменяет врача</b>.', li: ['Дозу инсулина приложение считает <b>только по коэффициентам, которые назначил ваш врач</b>. Без них расчёт не работает.', 'Углеводы, ХЕ и вес — ориентир. Сверяйте с упаковкой и весами; распознавание по фото приблизительное.', 'Окончательное решение о дозе принимаете вы вместе с лечащим врачом. При плохом самочувствии, гипогликемии или кетонах действуйте по плану врача.', 'Записи хранятся на этом устройстве. Общий дневник семьи работает, только если вы сами подключите сервер.'], b: 'Понятно' },
      ky: { h: 'Баштоонун алдында', p: '«Менин диабетим» — өзүн-өзү көзөмөлдөө үчүн жардамчы. Ал <b>медициналык буюм эмес жана дарыгерди алмаштырбайт</b>.', li: ['Инсулиндин дозасын тиркеме <b>дарыгериңиз дайындаган коэффициенттер боюнча гана</b> эсептейт. Алар жок болсо, эсептөө иштебейт.', 'Углеводдор, ХЕ жана салмак — болжолдуу маалымат. Таңгактагы маалымат жана таразы менен салыштырыңыз; сүрөт боюнча таануу болжолдуу.', 'Доза жөнүндө акыркы чечимди дарылоочу дарыгер менен бирге сиз кабыл аласыз. Абалыңыз начарласа, гипогликемия же кетон болсо, дарыгердин планы боюнча аракеттениңиз.', 'Жазуулар ушул түзмөктө сакталат. Үй-бүлөнүн жалпы күндөлүгү серверди өзүңүз туташтырсаңыз гана иштейт.'], b: 'Түшүнүктүү' }
    };
    const cur = () => { try { return localStorage.getItem('dm-lang') === 'ky' ? 'ky' : 'ru' } catch (e) { return 'ru' } };
    const paint = () => { const L = cur(), t = T[L];
      d.innerHTML = `<div style="background:#fff;color:#0f172a;max-width:460px;width:100%;max-height:90vh;overflow:auto;border-radius:18px;padding:22px 20px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-size:16px;line-height:1.5">
<div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:6px">${['ru', 'ky'].map(k => `<button data-l="${k}" style="border:1px solid #99f6e4;border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer;background:${k === L ? '#0f8f80;color:#fff' : '#f0fdfa;color:#0f172a'}">${k === 'ru' ? 'Русский' : 'Кыргызча'}</button>`).join('')}</div>
<h2 style="margin:0 0 10px;font-size:21px">${t.h}</h2><p style="margin:0 0 10px">${t.p}</p>
<ul style="padding-left:20px;margin:0 0 12px">${t.li.map(x => `<li>${x}</li>`).join('')}</ul>
<button id="dmDiscOk" style="width:100%;padding:13px;border:0;border-radius:12px;background:#0f8f80;color:#fff;font-weight:700;font-size:16px;cursor:pointer">${t.b}</button></div>`;
      d.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { try { localStorage.setItem('dm-lang', b.dataset.l) } catch (e) {} if (window.DMI18N && DMI18N.set) DMI18N.set(b.dataset.l); paint() });
      document.getElementById('dmDiscOk').onclick = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch (e) {} d.remove(); if (cur() === 'ru' && document.documentElement.lang === 'ky') location.reload() };
    };
    document.body.appendChild(d); paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
