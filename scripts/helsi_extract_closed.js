/**
 * Екстрактор ЗАКРИТИХ карток госпіталізації helsi.pro (/api/cards, isActive=false).
 * Виконати в консолі залогіненої вкладки helsi.pro (F12 → Console → вставити → Enter).
 * Результат: helsi_hospitalizations_closed_<рік>.json
 */
(async function extractClosed() {
  const cols = 'resolution,patientSeverity,patientData,diagnosisIcd10Am,inpatientDepartment,inpatientDepartmentName';
  const year = new Date().getFullYear();
  let skip = 0, limit = 50, all = [], hasNext = true;
  while (hasNext) {
    const url = `/api/cards?columns=${cols}&limit=${limit}&skip=${skip}&isActive=false`
      + `&startDateFrom=${year}-01-01T00%3A00%3A00%2B03%3A00&startDateTo=${year}-12-31T23%3A59%3A59%2B03%3A00`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) break;
    const d = await r.json();
    if (!d || !Array.isArray(d.data)) break;
    all.push(...d.data);
    hasNext = d.meta && d.meta.hasNext;
    skip += limit;
    if (skip > 50000) break;
  }
  const bundle = { meta: { type: 'closed', year, extractedAt: new Date().toISOString(), count: all.length }, data: all };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url2; a.download = `helsi_hospitalizations_closed_${year}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log('Готово:', all.length, 'закритих карток →', a.download);
  return { count: all.length, file: a.download };
})();
