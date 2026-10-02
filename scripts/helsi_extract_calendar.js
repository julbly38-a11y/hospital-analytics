/**
 * Екстрактор календаря лікарів helsi.pro (/api/calendar) — розклад + фактичні
 * записи на прийом (events, з даними пацієнта) за СЬОГОДНІ.
 * Виконати в консолі залогіненої вкладки helsi.pro (F12 → Console → вставити → Enter).
 * limit максимум 6 на запит (helsi обмежує), тому пагінація дрібна.
 * Результат: helsi_calendar_<дата>.json
 */
(async function extractCalendar() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  let page = 1, limit = 6, all = [], hasNext = true;
  while (hasNext) {
    const url = `/api/calendar?limit=${limit}&page=${page}&periodFrom=${dateStr}&periodTo=${dateStr}&v=1`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) break;
    const d = await r.json();
    if (!d || !Array.isArray(d.data)) break;
    all.push(...d.data);
    const total = d.paging ? d.paging.length : all.length;
    hasNext = all.length < total && d.data.length > 0;
    page += 1;
    if (page > 500) break;
  }
  const bundle = { meta: { type: 'calendar', date: `${yyyy}-${mm}-${dd}`, extractedAt: new Date().toISOString(), count: all.length }, data: all };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url2; a.download = `helsi_calendar_${yyyy}-${mm}-${dd}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log('Готово:', all.length, 'лікарів у розкладі →', a.download);
  return { count: all.length, file: a.download };
})();
