// Щоденна перевірка випадків на помилки, що впливають на оплату НСЗУ.
// Запускається у вкладці helsi.pro (після входу) — через консоль або
// javascript_tool: runQualityDaily({ org: '43342788' }). Прогрес —
// window.__qd. Результат іде на локальний dev-сервер
// (pages/api/local-quality-ingest.js), персональні дані пацієнтів не
// передаються — id пацієнта використовується лише тут, для пошуку накладок.
window.runQualityDaily = async function ({
  org,
  closedSince,
  ingestUrl = 'http://localhost:3000/api/local-quality-ingest',
  concurrency = 5,
} = {}) {
  const runStartedAt = new Date().toISOString()
  if (!closedSince) {
    const n = new Date()
    closedSince = new Date(Date.UTC(n.getFullYear(), n.getMonth() - 1, 1)).toISOString().slice(0, 10)
  }
  const state = window.__qd = { stage: 'list-open', listed: 0, detailed: 0, total: 0, done: false, err: null, result: null, closedSince }
  const API = '/api/hospital/api/v1'
  const SURG = /хірург|травмат|урол|нейрохір|опік|інтервенц|ортопед|гінек|оторин|офтальм|онко/i
  const EXT = c => c && /^[VWXY]/.test(c)
  const nowMs = Date.now()
  const sinceMs = new Date(closedSince + 'T00:00:00+03:00').getTime()
  const stopMs = sinceMs - 60 * 86400000

  const getJson = async url => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url)
      if (r.status === 401) throw new Error('Сесія helsi завершилась — увійдіть знову')
      if (r.ok) return r.json()
      await new Promise(ok => setTimeout(ok, 800))
    }
    throw new Error('helsi не відповідає: ' + url)
  }

  try {
    const picked = []
    for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=open`)
      j.results.forEach(c => picked.push({ id: c.id, open: true }))
      state.listed = picked.length
      if (!j.has_next) break
    }
    state.stage = 'list-closed'
    listing: for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=closed`)
      for (const c of j.results) {
        const start = new Date(c.start_datetime).getTime()
        const end = c.end_datetime ? new Date(c.end_datetime).getTime() : null
        if (start < stopMs) break listing
        if (end && end >= sinceMs && end - start > 20 * 3600000) picked.push({ id: c.id, open: false })
      }
      state.listed = picked.length
      if (!j.has_next) break
    }

    // Поки йде збір, частину пацієнтів виписують — той самий епізод може
    // потрапити і в список відкритих, і в список закритих.
    const seen = new Set()
    for (let i = picked.length - 1; i >= 0; i--) {
      if (seen.has(picked[i].id)) picked.splice(i, 1)
      else seen.add(picked[i].id)
    }

    state.stage = 'details'
    state.total = picked.length
    const details = new Array(picked.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < picked.length) {
        const i = cursor++
        const { id, open } = picked[i]
        const [d, pr] = await Promise.all([
          getJson(`${API}/encounter_cases/${id}/`),
          getJson(`${API}/case-dashboard/${id}/procedures/?page=1`),
        ])
        details[i] = { d, pr, open }
        state.detailed++
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))

    state.stage = 'rules'
    const byPatient = new Map()
    details.forEach(({ d }) => {
      const pid = d.patient?.id
      if (!pid) return
      const s = new Date(d.start_datetime).getTime()
      const e = d.end_datetime ? new Date(d.end_datetime).getTime() : nowMs
      if (d.status !== 'open' && e - s < 0.85 * 86400000) return
      if (!byPatient.has(pid)) byPatient.set(pid, [])
      byPatient.get(pid).push({ id: d.id, s, e })
    })
    const overlapping = new Set()
    byPatient.forEach(list => {
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        if (list[a].s < list[b].e && list[b].s < list[a].e) { overlapping.add(list[a].id); overlapping.add(list[b].id) }
      }
    })

    const rows = details.map(({ d, pr }) => {
      const open = d.status === 'open'
      const dx = (d.case_diagnosis || []).map(cd => cd.condition?.icd10am?.code).filter(Boolean)
      const primary = d.primary_diagnosis?.condition?.icd10am?.code || null
      const dept = d.last_department?.name || null
      const cm = d.care_manager || null
      const endMs = d.end_datetime ? new Date(d.end_datetime).getTime() : nowMs
      const los = Math.round((endMs - new Date(d.start_datetime).getTime()) / 86400000 * 10) / 10
      if (!open && los < 0.85) return null
      const procs = pr.count ?? (pr.results || []).length
      const surgical = SURG.test((dept || '') + ' ' + (cm?.position_name || ''))
      const death = d.discharge_disposition?.code === 'death'
      const flags = []
      const warnings = []
      if (!primary && (!open || los >= 1)) flags.push('no_primary')
      if (overlapping.has(d.id)) flags.push('overlap')
      // Поле «лікуючий лікар» у частині відділень не заповнюють, хоча виписку
      // підписує лікар — тож для закритих це помилка лише без обох.
      if (!cm && (open || !d.discharge?.participant_name)) (open ? warnings : flags).push('no_doctor')
      if (open) {
        if (/^R/.test(primary || '') && los >= 2) warnings.push('symptom_primary')
        if (/^[ST]/.test(primary || '') && !dx.some(EXT)) warnings.push('injury_no_external_cause')
        if (surgical && !procs && los >= 2) warnings.push('surgical_no_procedure')
        if (dx.length <= 1 && los >= 2) warnings.push('single_diagnosis')
        if (los > 30) warnings.push('open_too_long')
      } else {
        if (/^R/.test(primary || '')) flags.push('symptom_primary')
        if (/^[ST]/.test(primary || '') && !dx.some(EXT)) flags.push('injury_no_external_cause')
        if (surgical && !procs) flags.push('surgical_no_procedure')
        if (dx.length <= 1) flags.push(death ? 'death_single_diagnosis' : 'single_diagnosis')
        if (d.discharge?.helsi_status !== 'registered') flags.push('discharge_not_registered')
      }
      return {
        case_id: d.id, number: d.number, is_open: open,
        start: d.start_datetime, end: open ? null : d.end_datetime, los_days: los,
        dept,
        doctor_full: cm ? [cm.last_name, cm.first_name, cm.second_name].filter(Boolean).join(' ') : null,
        doctor_short: cm?.last_name ? `${cm.last_name} ${(cm.first_name || '')[0] || ''}.${cm.second_name ? ' ' + cm.second_name[0] + '.' : ''}` : (d.discharge?.participant_name || null),
        position: cm?.position_name || d.discharge?.participant_position || null,
        primary, primary_name: d.primary_diagnosis?.condition?.icd10am?.name || null,
        dx_codes: dx, procs_count: procs, disposition: d.discharge_disposition?.code || null,
        discharge_status: d.discharge?.helsi_status || null,
        flags, warnings,
      }
    }).filter(Boolean)

    state.rows = rows
    state.stage = 'ingest'
    const r = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org, rows, runStartedAt }),
    })
    state.result = { http: r.status, body: await r.json().catch(() => null) }
  } catch (e) {
    state.err = String(e.message || e)
  }
  state.done = true
  return state
}
