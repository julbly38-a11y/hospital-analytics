// Масовий збір реального вердикту НСЗУ (package-validation) для епізодів,
// уже зібраних у lpz.lpz_episode_facts (scripts/collect_lpz_episode_facts.js).
// Заповнює лише "цінові" поля (package_number/name, dsg_code/name,
// validation_success/messages, dsg_coefficient, price, adjustment_*) —
// сирі факти епізоду не чіпає.
//
// Запуск у вкладці helsi.pro (після входу), у консолі:
//   collectPackageValidation({ org: '43342788', department: 'травматолог' })
//
// Payload підтверджено живими викликами 2026-09-18 на 4 картках (15645,
// 15547 — хірургія одного дня, package №47; 12559 — без операцій, package
// №4; 15649 — контрольний), усі 4 повернули 200. `package` у payload не
// надсилається — ендпоінт сам визначає правильний пакет.
// Кожен рядок результату (window.__pv.result / window.__pvJson()) містить
// і витяг (dsg_code/price/...), і повний `_requestPayload`/`_rawResponse`
// для очного огляду перед завантаженням у Supabase. limit=25 за
// замовчуванням — щоб перший запуск на новому org/профілі не пішов одразу
// на всі епізоди; збільшити після перевірки вибірки (уже оброблені
// helsi_case_id пропускаються при повторному виклику).
window.collectPackageValidation = async function ({
  org,
  department = 'травматолог',
  closedSince,
  limit = 25,
  concurrency = 3,
  statuses = ['closed', 'pending_registration', 'registered'], // виписані епізоди (документ виписки є лише в них)
  ids = null, // масив helsi_case_id — для точкової перевірки конкретних епізодів
  cardNumbers = null, // масив номерів карток (напр. [15645, 15547, 12559, 15649]) — резолвиться в id пошуком по відкритих+закритих за весь період збору (04.05-...)
} = {}) {
  if (!closedSince) {
    const n = new Date()
    closedSince = new Date(Date.UTC(n.getFullYear(), n.getMonth() - 2, 1)).toISOString().slice(0, 10)
  }
  const prev = window.__pv
  const resume = prev && prev.org === org && prev.closedSince === closedSince && prev.done_ids
  const state = window.__pv = {
    stage: 'list', listed: 0, processed: 0, ok: 0, failed: 0, skipped: 0, total: 0,
    done: false, err: null, result: resume ? prev.result : [], done_ids: resume ? prev.done_ids : new Set(),
    org, department, closedSince, limit,
  }
  const API = '/api/hospital/api/v1'
  const sinceMs = new Date(closedSince + 'T00:00:00+03:00').getTime()
  const stopMs = sinceMs - 60 * 86400000

  const getJson = async (url, opts) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      // Збій мережі (fetch кидає TypeError "Failed to fetch") — теж повторюємо
      const r = await fetch(url, { credentials: 'include', ...opts }).catch(() => null)
      if (!r) { await new Promise(ok => setTimeout(ok, 1500 * (attempt + 1))); continue }
      if (r.status === 401) throw new Error('Сесія helsi завершилась — увійдіть знову й викличте collectPackageValidation з тими самими параметрами')
      if (r.status >= 200 && r.status < 500) return r // 4xx повертаємо як є — це дані про помилку валідації, не збій мережі
      await new Promise(ok => setTimeout(ok, 800))
    }
    throw new Error('helsi не відповідає: ' + url)
  }

  // Payload package-validation — поля з чернетки виписки. Достеменно
  // підтверджено лише що вони існують ("start_datetime","end_datetime",
  // "participant","admit_source","discharge_disposition","package","priority",
  // "registration_in_helsi","division","injury_type","resistance_category",
  // "extra_data") — джерела кожного конкретного значення на закритому епізоді
  // ще НЕ перевірено на всіх полях (лише injury_type/admit_source/discharge_disposition
  // точно на root `d`). Тому пробуємо root `d`, з фолбеком на `d.discharge`.
  // ПІДТВЕРДЖЕНО живими викликами 2026-09-18 (пілот на картках 15645/15547/
  // 12559/15649): API очікує ПЕРВИННИЙ КЛЮЧ (число/UUID), не весь об'єкт —
  // помилка була "Некоректний тип. Очікувалось значення первинного ключа,
  // отримано dict." для admit_source/discharge_disposition, "Must be a valid
  // UUID" для division. `package` можна не надсилати взагалі — ендпоінт сам
  // визначає правильний пакет за фактичними даними епізоду (це й є суть
  // "package-validation"); підставляти власний package недоцільно.
  // `priority` іноді "" (порожній рядок) у сирих даних — API вимагає саме
  // null, не "": звідси `||`, не `??`.
  const pick = (d, key) => (d[key] !== undefined ? d[key] : d.discharge ? d.discharge[key] : undefined)
  const toId = v => (v && typeof v === 'object') ? (v.id ?? v.code ?? v) : v
  const buildPayload = d => ({
    start_datetime: d.start_datetime,
    end_datetime: d.discharge?.end_datetime || d.end_datetime,
    participant: toId(pick(d, 'participant')),
    admit_source: toId(d.admit_source),
    discharge_disposition: toId(d.discharge_disposition),
    package: toId(pick(d, 'package')),
    priority: d.priority || d.discharge?.priority || null,
    registration_in_helsi: pick(d, 'registration_in_helsi'),
    division: toId(pick(d, 'division')),
    injury_type: d.injury_type ?? null,
    resistance_category: toId(pick(d, 'resistance_category')),
    extra_data: pick(d, 'extra_data') ?? null,
  })

  const validateOne = async (id) => {
    const dRes = await getJson(`${API}/encounter_cases/${id}/`)
    if (!dRes.ok) return { helsi_case_id: id, _skipped: 'encounter_cases fetch failed: ' + dRes.status }
    const d = await dRes.json()
    if (!d.discharge && !d.discharge_disposition) {
      return { helsi_case_id: id, card_number: d.number, _skipped: 'немає документа виписки — package-validation не застосовний' }
    }
    const discEncId = d.discharge?.id
    if (!discEncId) return { helsi_case_id: id, card_number: d.number, _skipped: 'немає discharge.id для URL package-validation' }
    const payload = buildPayload(d)
    const vRes = await getJson(`${API}/encounter_cases/${id}/encounters/${discEncId}/package-validation/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await vRes.json().catch(() => null)
    return {
      helsi_case_id: id,
      card_number: d.number,
      package_number: body?.package?.number ?? null,
      package_name: body?.package?.name ?? null,
      dsg_code: body?.code ?? null,
      dsg_name: body?.name ?? null,
      validation_success: vRes.ok,
      validation_messages: body?.fin ?? body ?? null,
      dsg_coefficient: body?.coefficient != null ? Number(body.coefficient) : null,
      price: body?.price ?? null,
      adjustment_coefficient: body?.adjustment_coefficient != null ? Number(body.adjustment_coefficient) : null,
      adjustment_price: body?.adjustment_price ?? null,
      _requestPayload: payload,
      _rawResponse: body,
      _httpStatus: vRes.status,
    }
  }

  try {
    let targets
    if (ids && ids.length) {
      targets = ids.map(id => ({ id }))
    } else if (cardNumbers && cardNumbers.length) {
      state.stage = 'resolve-card-numbers'
      const wanted = new Set(cardNumbers.map(String))
      const found = new Map()
      for (const status of ['open', 'closed']) {
        if (found.size === wanted.size) break
        for (let skip = 0; ; skip += 100) {
          const j = await (await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)).json()
          for (const c of j.results) if (wanted.has(String(c.number))) found.set(String(c.number), c.id)
          if (!j.has_next || found.size === wanted.size) break
        }
      }
      const missing = [...wanted].filter(n => !found.has(n))
      if (missing.length) console.warn('Не знайдено картки (перевірте номер/період): ' + missing.join(', '))
      targets = [...found.values()].map(id => ({ id }))
    } else {
      state.stage = 'list-closed'
      const cases = []
      for (const status of statuses) listing: for (let skip = 0; ; skip += 100) {
        const j = await (await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)).json()
        for (const c of j.results) {
          const end = c.end_datetime ? new Date(c.end_datetime).getTime() : null
          const start = new Date(c.start_datetime).getTime()
          if (start < stopMs) break listing
          if (!(c.last_department?.name || '').toLowerCase().includes(department.toLowerCase())) continue
          if (end && end >= sinceMs) cases.push({ id: c.id, end })
        }
        state.listed = cases.length
        if (!j.has_next) break
      }
      cases.sort((a, b) => (b.end || 0) - (a.end || 0)) // свіжі спершу
      targets = cases
    }
    targets = targets.filter(t => !state.done_ids.has(t.id)).slice(0, limit)
    state.total = targets.length
    state.stage = 'validating'

    let cursor = 0
    const worker = async () => {
      while (cursor < targets.length) {
        const { id } = targets[cursor++]
        try {
          const row = await validateOne(id)
          if (row._skipped) state.skipped++
          else if (row.validation_success) state.ok++
          else state.failed++
          state.result.push(row)
          state.done_ids.add(id)
        } catch (e) {
          state.result.push({ helsi_case_id: id, _error: String(e && e.message || e) })
          state.failed++
        }
        state.processed++
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))

    state.done = true
    window.__pvJson = () => JSON.stringify(state.result, null, 2)
    console.log(`package-validation: ${state.ok} success, ${state.failed} failed, ${state.skipped} skipped з ${state.total}. Огляньте window.__pv.result перед завантаженням у Supabase.`)
    return { ok: state.ok, failed: state.failed, skipped: state.skipped, total: state.total }
  } catch (e) {
    state.err = String(e && e.message || e)
    throw e
  }
}
