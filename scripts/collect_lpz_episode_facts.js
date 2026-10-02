// Збір сирих фактів епізоду (не готових висновків) для lpz.lpz_episode_facts.
// Бере і відкриті, і закриті епізоди обраного профілю (за замовчуванням —
// травматологія). Запускається у вкладці helsi.pro (після входу), у консолі:
//   collectEpisodeFacts({ org: '43342788', department: 'травматолог' })
// Прогрес — window.__ef. Результат — window.__ef.result (масив рядків) і
// window.__efJson() → рядок JSON для збереження у файл (~/Documents/,
// не в репо). У Supabase нічого не пишеться напряму: JSON завантажується
// окремим кроком.
//
// Не збирає package-validation (реальний ДСГ/ціну) — це окремий, повільніший
// крок per-епізод (потребує package id, якого немає в об'єкті епізоду
// напряму). Ці поля (dsg_code, price, ...) лишаються null; заповнюються
// пізніше вручну для вибірки епізодів, якщо знадобиться.
//
// ПІБ пацієнта й лікаря НЕ збираються — лише id (як і в
// lpz_case_quality_snapshot / scripts/helsi_quality_daily.js).
window.collectEpisodeFacts = async function ({
  org,
  department = 'травматолог', // підрядок для last_department.name, регістр не важливий
  closedSince,
  concurrency = 5,
  statuses = null, // напр. ['on_discharge','pending_registration','registered'] — лише ці статуси (докомплект); за замовчуванням усі 5
} = {}) {
  if (!closedSince) {
    const n = new Date()
    closedSince = new Date(Date.UTC(n.getFullYear(), n.getMonth() - 2, 1)).toISOString().slice(0, 10)
  }
  const state = window.__ef = {
    stage: 'list-cases', listedCases: 0, listedCards: 0, detailed: 0, total: 0,
    done: false, err: null, result: null, org, department, closedSince,
  }
  const API = '/api/hospital/api/v1'
  const INTERVENTION_CODE = /^\d{5}-\d{2}$/
  const EXTERNAL_CAUSE = c => /^[VWXY]/.test(c) || /^U(5[0-9]|6[0-9]|7[0-3])/.test(c)
  const sinceMs = new Date(closedSince + 'T00:00:00+03:00').getTime()
  const stopMs = sinceMs - 60 * 86400000

  const getJson = async url => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Збій мережі (fetch кидає TypeError "Failed to fetch") — теж повторюємо
      const r = await fetch(url, { credentials: 'include' }).catch(() => null)
      if (!r) { await new Promise(ok => setTimeout(ok, 1500 * (attempt + 1))); continue }
      if (r.status === 401) throw new Error('Сесія helsi завершилась — увійдіть знову й викличте collectEpisodeFacts з тими самими параметрами')
      if (r.ok) return r.json()
      await new Promise(ok => setTimeout(ok, 800))
    }
    throw new Error('helsi не відповідає: ' + url)
  }

  try {
    // 1. список випадків обраного профілю — і відкриті, і закриті
    //    (department — підрядок назви last_department.name)
    // У helsi 5 статусів епізоду: open, on_discharge — ще у відділенні;
    // closed, pending_registration, registered — виписані.
    const wanted = s => !statuses || statuses.includes(s)
    const cases = []
    for (const status of ['open', 'on_discharge'].filter(wanted)) for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)
      for (const c of j.results) {
        if ((c.last_department?.name || '').toLowerCase().includes(department.toLowerCase())) cases.push({ id: c.id })
      }
      if (!j.has_next) break
    }
    for (const status of ['closed', 'pending_registration', 'registered'].filter(wanted)) listing: for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)
      for (const c of j.results) {
        const end = c.end_datetime ? new Date(c.end_datetime).getTime() : null
        const start = new Date(c.start_datetime).getTime()
        if (start < stopMs) break listing
        if (!(c.last_department?.name || '').toLowerCase().includes(department.toLowerCase())) continue
        if (end && end >= sinceMs) cases.push({ id: c.id })
      }
      state.listedCases = cases.length
      if (!j.has_next) break
    }
    state.listedCases = cases.length

    // 2. картки (reception-модуль) — відкриті й закриті за той самий період,
    //    для esoz_episode_status. Індексуємо за номером картки (== номеру
    //    encounter_case). У відкритих карток цих полів ще немає — це очікувано.
    state.stage = 'list-cards'
    const cardsByNumber = new Map()
    const cardsBase = API.replace('/hospital/api/v1', '')
    for (let skip = 0; ; skip += 50) {
      const j = await getJson(`${cardsBase}/cards?columns=resolution,patientSeverity,patientData&limit=50&skip=${skip}&loadNonInpatientDepartments=false&startDateTo=${encodeURIComponent(new Date().toISOString())}`)
      const rows = j.data || []
      if (!rows.length) break
      for (const r of rows) cardsByNumber.set(r.number, r)
      if (rows.length < 50) break
    }
    for (let skip = 0; ; skip += 50) {
      const j = await getJson(`${cardsBase}/cards?columns=resolution&isActive=false&limit=50&skip=${skip}`)
      const rows = j.data || []
      if (!rows.length) break
      let stop = false
      for (const r of rows) {
        const t = r.start ? new Date(r.start).getTime() : 0
        if (t < stopMs) { stop = true; break }
        cardsByNumber.set(r.number, r)
      }
      state.listedCards = cardsByNumber.size
      if (stop || rows.length < 50) break
    }

    // 3. деталі кожного епізоду
    state.stage = 'details'
    state.total = cases.length
    const result = new Array(cases.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < cases.length) {
        const i = cursor++
        const { id } = cases[i]
        const [d, pr, sv] = await Promise.all([
          getJson(`${API}/encounter_cases/${id}/`),
          getJson(`${API}/case-dashboard/${id}/procedures/?page=1`),
          getJson(`${API}/case-dashboard/${id}/services/?page=1`),
        ])
        const card = cardsByNumber.get(d.number)
        const dx = (d.case_diagnosis || []).map(cd => ({ code: cd.condition?.icd10am?.code, role: cd.role }))
        const primary = dx.find(x => x.role === 1)?.code || d.primary_diagnosis?.condition?.icd10am?.code || null
        const secondary = dx.filter(x => x.role === 2 && x.code && !EXTERNAL_CAUSE(x.code)).map(x => x.code)
        const complication = dx.filter(x => x.role === 3 && x.code).map(x => x.code)
        const externalCause = dx.filter(x => x.code && EXTERNAL_CAUSE(x.code)).map(x => x.code)
        const interventionCodes = [...(pr.results || []), ...(sv.results || [])]
          .map(x => x.service?.code).filter(c => c && INTERVENTION_CODE.test(c))
        const operationCodes = (pr.results || [])
          .filter(p => p.category?.code === 'surgical_procedure')
          .map(p => p.service?.code).filter(Boolean)

        result[i] = {
          org_edrpou: org,
          helsi_case_id: d.id,
          discharge_encounter_id: d.discharge?.id || null,
          card_number: d.number,
          status: d.status,
          admission_at: d.start_datetime,
          discharge_at: d.discharge?.end_datetime || d.end_datetime,
          department_id: d.last_department?.id || null,
          department_name: d.last_department?.name || null,
          doctor_id: d.care_manager?.id || null,
          doctor_position: d.care_manager?.position_name || null,
          admit_source: d.admit_source?.code || null,
          priority: d.priority || null,
          re_admission: d.re_admission?.code ?? (typeof d.re_admission === 'string' ? d.re_admission : null),
          injury_type: d.injury_type ?? null,
          primary_icd: primary,
          secondary_icd: secondary,
          complication_icd: complication,
          external_cause_icd: externalCause,
          intervention_codes: interventionCodes,
          operation_codes: operationCodes,
          discharge_disposition: d.discharge_disposition?.code || null,
          discharge_status: d.discharge?.status || null,
          discharge_ehealth_status: d.discharge?.helsi_status || null,
          discharge_signed_by_position: d.discharge?.participant_position || null,
          working_capacity: null, // не збирається масово, лише через live package-validation
          package_number: null, package_name: null, dsg_code: null, dsg_name: null,
          validation_success: null, validation_messages: null, dsg_coefficient: null,
          price: null, adjustment_coefficient: null, adjustment_price: null,
          card_status: card?.status || null,
          esoz_episode_status: card?.dischargeEpisodeStatus || null,
          discharge_event_id: card?.dischargeEventId || null,
          resolution_name: card?.resolution?.shortName || null,
        }
        state.detailed++
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))

    state.result = result
    state.done = true
    window.__efJson = () => JSON.stringify(result, null, 2)
    return { total: result.length }
  } catch (e) {
    state.err = String(e && e.message || e)
    throw e
  }
}
