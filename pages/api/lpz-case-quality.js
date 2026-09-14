import { estimatePrice, estimateRisk, PRICING_SOURCE } from '../../lib/quality-pricing'
import { resolveQualityAccess, fetchSnapshotRows, segmentOf, kyivDate } from '../../lib/quality-access'

// Контроль записів (public/quality.html) — епізоди з ознаками помилок, що
// впливають на оплату НСЗУ. Хто що бачить — lib/quality-access.js.
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
