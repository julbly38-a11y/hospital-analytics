/**
 * Екстрактор ВІДКРИТИХ карток госпіталізації helsi.pro (/api/cards, поточні пацієнти).
 * Виконати в консолі залогіненої вкладки helsi.pro (F12 → Console → вставити → Enter).
 * Запускати ПІСЛЯ helsi_extract_closed.js, в новій вкладці або після F5
 * (Chrome блокує другий download поспіль з того самого домену).
 * Результат: helsi_hospitalizations_open.json
 */
(async function extractOpen() {
  const cols = 'resolution,patientSeverity,patientData,diagnosisIcd10Am,inpatientDepartment,inpatientDepartmentName';
  let skip = 0, limit = 50, all = [], hasNext = true;
  while (hasNext) {
    const url = `/api/cards?columns=${cols}&limit=${limit}&skip=${skip}`
      + `&loadNonInpatientDepartments=false&startDateTo=2030-01-01T00%3A00%3A00%2B03%3A00`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) break;
    const d = await r.json();
    if (!d || !Array.isArray(d.data)) break;
    all.push(...d.data);
    hasNext = d.meta && d.meta.hasNext;
    skip += limit;
    if (skip > 50000) break;
  }
  const bundle = { meta: { type: 'open', extractedAt: new Date().toISOString(), count: all.length }, data: all };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url2; a.download = 'helsi_hospitalizations_open.json';
  document.body.appendChild(a); a.click(); a.remove();
  console.log('Готово:', all.length, 'відкритих карток →', a.download);
  return { count: all.length, file: a.download };
})();
