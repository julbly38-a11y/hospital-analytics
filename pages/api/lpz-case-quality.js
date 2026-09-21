import { estimatePrice, estimateRisk, PRICING_SOURCE } from '../../lib/quality-pricing'
import { resolveQualityAccess, fetchSnapshotRows, segmentOf, kyivDate, hasIssues, getLosNorms, buildReminder } from '../../lib/quality-access'

// Контроль записів (public/quality.html, кабінети у фінансовому режимі) —
// епізоди з ознаками помилок, що впливають на оплату НСЗУ. Хто що бачить —
// lib/quality-access.js.
//
// names=1 — ПІБ пацієнта (і повне ПІБ лікаря) для епізодів із зауваженнями.
// У lpz_case_quality_snapshot персональних даних немає навмисно: ПІБ
// пацієнта — з lpz_hospitalizations (helsi_record_id = helsi_case_id), лікаря —
// з lpz_empl. Обсяг той самий, що й самих епізодів: лікар — свої пацієнти,
// завідувач — відділення, головний лікар і власник сайту — уся лікарня.
const IN_CHUNK = 150

// Порції запитів ідуть паралельно: .in() по тисячах id однією порцією — надто
// довгий URL, а послідовно — десятки секунд для всієї лікарні.
async function inChunks(ids, query) {
  const chunks = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK))
  const results = await Promise.all(chunks.map(query))
  return results.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message)
    return data || []
  })
}

async function attachNames(access, rows) {
  const lpz = access.sb.schema('lpz')
  const caseIds = [...new Set(rows.map(r => r.helsi_case_id).filter(Boolean))]
  const doctorIds = [...new Set(rows.map(r => r.doctor_resource_id).filter(Boolean))]
  const [hosp, empl] = await Promise.all([
    inChunks(caseIds, chunk => lpz.from('lpz_hospitalizations')
      .select('helsi_record_id, patient_name, last_name, first_name, middle_name')
      .eq('org_edrpou', access.org).in('helsi_record_id', chunk)),
    inChunks(doctorIds, chunk => lpz.from('lpz_empl')
      .select('resource_id, last_name, first_name, middle_name')
      .eq('org_edrpou', access.org).in('resource_id', chunk)),
  ])
  const patientByCase = new Map()
  hosp.forEach(h => {
    const name = h.patient_name || [h.last_name, h.first_name, h.middle_name].filter(Boolean).join(' ')
    if (name) patientByCase.set(String(h.helsi_record_id), name)
  })
  const doctorById = new Map(empl.map(e => [String(e.resource_id), [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(' ')]))
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
    // Покриття точною ціною: скільки епізодів мають розрахунок НСЗУ (real_price)
    // і — лише для showMoney — яку частку суми вони становлять.
    let nszuPriced = 0, priceAll = 0, priceNszu = 0
    rows.forEach(r => {
      r.segment = segmentOf(r, today)
      r.addressee = r.doctor_resource_id ? 'doctor' : 'head'
      r.nszu_priced = Boolean(r.real_price)
      if (r.nszu_priced) nszuPriced += 1
      if (access.showMoney) {
        r.est_price = estimatePrice(r)
        r.est_risk = estimateRisk(r, r.est_price)
        r.est_from_nszu = r.nszu_priced
        priceAll += r.est_price
        if (r.nszu_priced) priceNszu += r.est_price
      }
      // Ціна — лише в est_price (тільки для тих, кому showMoney).
      delete r.real_price
    })
    // Віддаємо лише епізоди із зауваженнями (сторінки показують тільки їх);
    // правильні — лише загальною кількістю перевірених (total_checked).
    const withIssues = rows.filter(hasIssues)
    // reminders=1 — нагадування по відкритих епізодах (lib/quality-access.js:
    // buildReminder): від 3-ї доби, з нормою перебування по діагнозу.
    if (req.query.reminders === '1') {
      const norms = await getLosNorms(access.sb, access.org)
      withIssues.forEach(r => { r.reminder = buildReminder(r, norms) })
    }
    if (req.query.names === '1') await attachNames(access, withIssues)
    res.status(200).json({
      scope: access.scope,
      today,
      pricing_source: access.showMoney ? PRICING_SOURCE : null,
      checked_at: rows.reduce((m, r) => ((r.checked_at || '') > m ? r.checked_at : m), ''),
      total_checked: rows.length,
      nszu_priced_total: nszuPriced,
      nszu_money_share: access.showMoney && priceAll ? priceNszu / priceAll : null,
      rows: withIssues,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
