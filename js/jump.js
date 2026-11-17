/* v64.89: переходы с главной и внутри приложения приводят ровно к нужному полю.
   Раньше show() не сбрасывал прокрутку: если нажать «Базальный» внизу главной, раздел «Инсулин» открывался на том же
   смещении — посередине калькулятора, и поле «Введено, ЕД» приходилось искать прокруткой.
   Теперь:
   – любой переход show() открывает раздел сверху;
   – плитки «Болюс» и «Базальный» открывают «Фактически введённый инсулин» с выбранным типом, текущими датой и временем
     и курсором в поле «Введено, ЕД»;
   – «Записать сахар» — поле сахара; HbA1c по анализу — динамика (или форма добавления, если анализа нет);
   – HbA1c по сенсору — тенденции сенсора (или подключение сенсора); углеводы/калории/белки/жиры/ХЕ/БЖЕ — меню дня.
   DMJump.go('раздел') или DMJump.go('раздел:цель'). */
(function () {
  'use strict';
  const os = window.show;
  let pending = false;
  const head = () => { const h = document.querySelector('.section.active > .stickyHead'); const b = h ? h.getBoundingClientRect().bottom : 0; return Math.max(b, 0); };
  function scrollToEl(el, gap) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - head() - (gap == null ? 10 : gap);
    window.scrollTo(0, Math.max(0, top));
  }
  function focusField(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (x) { } } }
  const card = el => (el && (el.closest('.card') || el.parentElement)) || el;
  const pad = n => String(n).padStart(2, '0');
  const nowT = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const todayS = () => { try { return today(); } catch (e) { return new Date().toISOString().slice(0, 10); } };

  if (typeof os === 'function') {
    window.show = function (id) {
      const r = os.apply(this, arguments);
      if (!pending) { try { window.scrollTo(0, 0); } catch (e) { } }
      return r;
    };
  }

  const A = {
    insulin(type) {
      const sel = document.getElementById('actualInsType'), u = document.getElementById('actualInsUnits');
      if (!sel || !u) return;
      try { if (window.actualInsEditId && typeof resetActualInsulinForm === 'function') resetActualInsulinForm(); } catch (e) { }
      if (type) { const o = [...sel.options].find(x => x.value === type || x.text === type); if (o) sel.value = o.value; }
      const d = document.getElementById('actualInsDate'), t = document.getElementById('actualInsTime');
      if (d && !d.value) d.value = todayS();
      if (t && !t.value) t.value = nowT();
      const c = document.getElementById('actualInsReason');
      if (c && !c.value && type === 'Базальный') c.value = 'Базальный (плановый)';
      scrollToEl(card(u)); focusField(u);
    },
    glucose() { const g = document.getElementById('dGlucose'); if (!g) return; scrollToEl(card(g)); focusField(g); },
    labs(arg) {
      const type = arg || 'hba1c';
      const has = (db.labs || []).some(x => x.type === type);
      if (has && window.DMLabTrend && document.getElementById('labTrend')) { try { DMLabTrend.pick(type); } catch (e) { } scrollToEl(document.getElementById('labTrend')); return; }
      const sel = document.getElementById('labType'), v = document.getElementById('labValue');
      if (sel) { sel.value = type; try { labUnitHint(); } catch (e) { } }
      if (v) { scrollToEl(card(v)); focusField(v); }
    },
    sensor() {
      const g = window.DMCgm && DMCgm.gmi ? DMCgm.gmi() : null;
      if (g && window.DMCgmBig) { try { DMCgmBig.open(24); DMCgmBig.mode('trends'); } catch (e) { } return true; }
      return false;
    },
    menu() { const m = document.getElementById('meals'); if (m) scrollToEl(m); }
  };

  /* spec: 'insulin:Болюс' | 'insulin:Базальный' | 'glucose:field' | 'labs:hba1c' | 'dayinsight:sensor' | 'menu:day' | любой раздел */
  function go(spec) {
    const [sec, arg] = String(spec).split(':');
    if (!arg) { show(sec); return; }
    if (sec === 'dayinsight' && arg === 'sensor') {
      if (A.sensor()) return;
      pending = true; show('family');
      setTimeout(() => { const b = document.getElementById('cgmFamily') || document.getElementById('sync2'); if (b) scrollToEl(b); else window.scrollTo(0, 0); pending = false; }, 260);
      return;
    }
    pending = true; show(sec);
    setTimeout(() => { try { (A[sec === 'glucose' ? 'glucose' : sec] || (() => { }))(arg); } catch (e) { } pending = false; }, sec === 'labs' ? 260 : 200);
  }
  window.DMJump = { go, scrollToEl };
})();
