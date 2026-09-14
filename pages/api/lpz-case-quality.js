import { estimatePrice, estimateRisk, PRICING_SOURCE } from '../../lib/quality-pricing'
import { resolveQualityAccess, fetchSnapshotRows, segmentOf, kyivDate, hasIssues } from '../../lib/quality-access'

// Контроль записів (public/quality.html, кабінети у фінансовому режимі) —
// епізоди з ознаками помилок, що впливають на оплату НСЗУ. Хто що бачить —
// lib/quality-access.js.
//
// names=1 — ПІБ пацієнта й лікаря (короткий список у кабінеті завідувача).
// У lpz_case_quality_snapshot персональних даних немає навмисно: ПІБ
// пацієнта — з lpz_hospitalizations (helsi_record_id = helsi_case_id), лікаря —
// з lpz_empl. Лише для обсягу відділення/лікаря — тих самих пацієнтів, що вже
// показує "Перебуває у відділенні"; для всієї лікарні не віддаємо.
const IN_CHUNK = 150

async function attachNames(access, rows) {
  const lpz = access.sb.schema('lpz')
  const caseIds = [...new Set(rows.map(r => r.helsi_case_id).filter(Boolean))]
  const patientByCase = new Map()
  for (let i = 0; i < caseIds.length; i += IN_CHUNK) {
    const { data, error } = await lpz.from('lpz_hospitalizations')
      .select('helsi_record_id, patient_name, last_name, first_name, middle_name')
      .eq('org_edrpou', access.org).in('helsi_record_id', caseIds.slice(i, i + IN_CHUNK))
    if (error) throw new Error(error.message)
    ;(data || []).forEach(h => {
      const name = h.patient_name || [h.last_name, h.first_name, h.middle_name].filter(Boolean).join(' ')
      if (name) patientByCase.set(String(h.helsi_record_id), name)
    })
  }
  const doctorIds = [...new Set(rows.map(r => r.doctor_resource_id).filter(Boolean))]
  const doctorById = new Map()
  for (let i = 0; i < doctorIds.length; i += IN_CHUNK) {
    const { data, error } = await lpz.from('lpz_empl')
      .select('resource_id, last_name, first_name, middle_name')
      .eq('org_edrpou', access.org).in('resource_id', doctorIds.slice(i, i + IN_CHUNK))
    if (error) throw new Error(error.message)
    ;(data || []).forEach(e => doctorById.set(String(e.resource_id), [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(' ')))
  }
  rows.forEach(r => {
    r.patient_name = patientByCase.get(String(r.helsi_case_id)) || null
    r.doctor_full_name = (r.doctor_resource_id && doctorById.get(String(r.doctor_resource_id))) || null
  })
}

export default async function handler(req, res) {
  try {
    const access = await resolveQualityAccess(req)
    if (access.error) return res.status(access.error.status).json(access.error.body)

    const rows = await fetchSnapshotRows(access)
    const today = kyivDate(new Date())
    rows.forEach(r => {
      r.segment = segmentOf(r, today)
      r.addressee = r.doctor_resource_id ? 'doctor' : 'head'
      if (access.showMoney) {
        r.est_price = estimatePrice(r)
        r.est_risk = estimateRisk(r, r.est_price)
      }
    })
    // Лише епізоди із зауваженнями — список показує тільки їх.
    if (req.query.names === '1' && access.scope !== 'hospital') await attachNames(access, rows.filter(hasIssues))
    res.status(200).json({
      scope: access.scope,
      today,
      pricing_source: access.showMoney ? PRICING_SOURCE : null,
      checked_at: rows.reduce((m, r) => ((r.checked_at || '') > m ? r.checked_at : m), ''),
      rows,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
