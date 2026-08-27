// Вставити в консоль (F12) на helsi.pro, залогінений під потрібною лікарнею.
// Витягує severity/admit_source/re_admission/discharge_disposition з encounter_cases
// (з 01.06.2026 по сьогодні) і зберігає у файл через звичайне завантаження.

(async () => {
  const limit = 100;
  let skip = 0;
  const out = [];
  while (true) {
    const r = await fetch(`/api/hospital/api/v1/encounter_cases/?skip=${skip}&limit=${limit}&page_size=${limit}`, {credentials: 'include'});
    const j = await r.json();
    if (!j.results || j.results.length === 0) break;
    let stop = false;
    for (const rec of j.results) {
      if (rec.start_datetime && rec.start_datetime < '2026-06-01') { stop = true; break; }
      out.push({
        number: rec.number,
        severity: rec.primary_diagnosis && rec.primary_diagnosis.condition ? rec.primary_diagnosis.condition.severity : null,
        admit_source_id: rec.admit_source ? rec.admit_source.id : null,
        re_admission_id: rec.re_admission ? rec.re_admission.id : null,
        discharge_disposition_id: rec.discharge_disposition ? rec.discharge_disposition.id : null
      });
    }
    if (stop || !j.has_next) break;
    skip += limit;
  }
  console.log('Зібрано записів:', out.length);
  const blob = new Blob([JSON.stringify(out)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ec_severity_merge.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
})();
