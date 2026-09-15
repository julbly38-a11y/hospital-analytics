/**
 * Екстрактор результату лікування (discharge_disposition) з helsi.pro.
 *
 * ВАЖЛИВО: /api/cards (той самий, що використовують helsi_extract_closed.js/
 * helsi_extract_open.js) результату лікування НЕ віддає — там лише факт
 * виписки. Реальне значення (Помер/З поліпшенням/Здоровий/...) є в ОКРЕМОМУ,
 * набагато багатшому API /api/hospital/api/v1/encounter_cases/, знайдено
 * 2026-09-08 (перед цим двічі помилково вважали, що сигналу смерті в даних
 * взагалі нема).
 *
 * Коди discharge_disposition.id (звірено на реальних даних ЛШМД):
 *   1 = death (Помер),                    2 = discharge_better (З поліпшенням)
 *   3 = discharge_healthy (Здоровий),      4 = discharge_no_change (Без змін)
 *   5 = discharge_recovery (З одужанням),  6 = discharge_worse (З погіршенням)
 *   7 = left_by_patient (Самовільно пішов),8 = statistic_discharge
 *   9 = transfer_general (Переведено в інший ЗОЗ)
 * lpz_kpi_by_department вже рахує "з покращенням" як (2,3,5) і летальність
 * як (=1) — ця нумерація узгоджена з тим, що вже було в старому каноні.
 *
 * Список НЕ фільтрується по org/даті на рівні API — результати йдуть
 * НАЙНОВІШІ ПЕРШІ (сортування за start_datetime DESC), тому скрипт сам
 * зупиняється, щойно зустріне запис старіший за --min-date (за замовчуванням
 * 2026-01-01, підставити рік вручну при повторному використанні).
 *
 * ЯК ЗАПУСКАТИ: виконати в консолі залогіненої вкладки helsi.pro
 * (F12 → Console → вставити → Enter, або через claude-in-chrome
 * javascript_tool). УВАГА: цикл довгий (тисячі запитів) — CDP-виклик
 * таймаутиться на 45с, це нормально, скрипт продовжує роботу у сторінці
 * у фоні; результат забирати опитуванням window.__dispositionClosed.
 *
 * Результат: window.__dispositionClosed = [{id, number, disp}, ...],
 * де id = helsi_record_id (те саме, що id у /api/cards), disp = код 1-9
 * або null (ще не оформлена виписка).
 */
(async function extractDischargeDisposition(minDate = '2026-01-01') {
  let skip = 0, limit = 300, all = [], hasNext = true, stop = false;
  while (hasNext && !stop) {
    const url = `/api/hospital/api/v1/encounter_cases/?limit=${limit}&skip=${skip}&page_size=${limit}&status=closed`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) break;
    const d = await r.json();
    if (!d || !Array.isArray(d.results)) break;
    for (const c of d.results) {
      if (c.start_datetime && c.start_datetime < minDate) { stop = true; break; }
      all.push({ id: c.id, number: c.number, disp: c.discharge_disposition ? c.discharge_disposition.id : null });
    }
    hasNext = d.has_next;
    skip += limit;
    if (skip > 20000) break;
  }
  window.__dispositionClosed = all;
  console.log('Готово:', all.length, 'записів результату лікування');
  return { count: all.length, stopped: stop };
})();
