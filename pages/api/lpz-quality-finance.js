import { estimatePrice, estimateRisk, PRICING_SOURCE } from '../../lib/quality-pricing'
import { resolveQualityAccess, fetchSnapshotRows, segmentOf, kyivDate } from '../../lib/quality-access'

// Фінансовий режим кабінетів (клік на емблему): показники й динаміка
// контролю записів за обраний період — правильні / поправимі / непоправимі
// епізоди. Хто що бачить — lib/quality-access.js; суми (грн) — лише коли
// showMoney, решті — кількість епізодів.
//
// Період — як у звичайних трендах кабінетів: year=all → динаміка по роках,
// year → по місяцях, year+month → по днях; day звужує лише kpi. Закриті
// епізоди відносяться до періоду за датою виписки (Київ), відкриті входять у
// kpi, лише коли період містить сьогоднішній день. direction — терапевтичний/
// хірургічний (блоки напрямків на entry.html), у межах дозволеного обсягу.

const SEGMENTS = ['ok', 'fixable', 'lost']

function emptyBucket(money) {
  const b = { cases: 0, ok: 0, fixable: 0, lost: 0 }
  if (money) {
    SEGMENTS.forEach(s => { b[`${s}_price`] = 0 })
    b.fixable_risk = 0
    b.lost_risk = 0
  }
  return b
}

// *_price — повна вартість епізодів сегмента; *_risk — яку частину з неї
// орієнтовно втрачено (lost) або ще можна врятувати (fixable). У правильних
// епізодів ризику немає.
function addTo(b, r, money) {
  b.cases += 1
  b[r.segment] += 1
  if (money) {
    b[`${r.segment}_price`] += r.est_price
    if (r.segment !== 'ok') b[`${r.segment}_risk`] += r.est_risk
  }
}

export default async function handler(req, res) {
  try {
    const access = await resolveQualityAccess(req)
    if (access.error) return res.status(access.error.status).json(access.error.body)

    const year = String(req.query.year || 'all').trim().toLowerCase()
    const month = String(req.query.month || 'all').trim().toLowerCase()
    const day = String(req.query.day || 'all').trim().toLowerCase()
    const direction = req.query.direction ? String(req.query.direction).trim() : null
    // level=hospital — показники всієї лікарні для шапки кабінетів завідувача
    // й лікаря: лише агрегати (без епізодів), суми — як і раніше, лише тим,
    // кому showMoney.
    const wholeHospital = req.query.level === 'hospital'
    const money = access.showMoney
    const today = kyivDate(new Date())

    let rows = await fetchSnapshotRows(access, { wholeHospital, light: true })
    if (direction) {
      const { data: depts, error } = await access.sb.schema('lpz').from('lpz_departments')
        .select('structure_id').eq('org_edrpou', access.org).eq('direction', direction)
      if (error) return res.status(500).json({ error: error.message })
      const ids = new Set((depts || []).map(d => d.structure_id))
      rows = rows.filter(r => ids.has(r.department_structure_id))
    }

    const yyyy = year === 'all' ? null : year
    const mm = yyyy && month !== 'all' ? String(month).padStart(2, '0') : null
    const dd = mm && day !== 'all' ? String(day).padStart(2, '0') : null
    const inPeriod = date => (!yyyy || date.slice(0, 4) === yyyy) && (!mm || date.slice(5, 7) === mm) && (!dd || date.slice(8, 10) === dd)
    const inTrend = date => (!yyyy || date.slice(0, 4) === yyyy) && (!mm || date.slice(5, 7) === mm)
    const trendKey = date => Number(mm ? date.slice(8, 10) : yyyy ? date.slice(5, 7) : date.slice(0, 4))

    const kpi = { ...emptyBucket(money), open: 0, open_issues: 0 }
    const trend = new Map()
    let dataFrom = null
    rows.forEach(r => {
      r.segment = segmentOf(r, today)
      if (money) {
        r.est_price = estimatePrice(r)
        r.est_risk = estimateRisk(r, r.est_price)
      }
      if (r.segment === 'open') {
        if (inPeriod(today)) {
          kpi.open += 1
          if ((r.flags || []).length + (r.warnings || []).length) kpi.open_issues += 1
        }
        return
      }
      const date = r.discharge_at ? kyivDate(new Date(r.discharge_at)) : null
      if (!date) return
      if (!dataFrom || date < dataFrom) dataFrom = date
      if (inPeriod(date)) addTo(kpi, r, money)
      if (inTrend(date)) {
        const x = trendKey(date)
        if (!trend.has(x)) trend.set(x, emptyBucket(money))
        addTo(trend.get(x), r, money)
      }
    })

    // Порожні місяці/дні — нулями, щоб стовпці стояли на своїх місцях
    // (до травня 2026 епізодів стаціонару в helsi немає).
    if (yyyy) {
      const [ty, tm, td] = today.split('-')
      const last = mm
        ? (yyyy === ty && mm === tm ? Number(td) : new Date(Date.UTC(Number(yyyy), Number(mm), 0)).getUTCDate())
        : (yyyy === ty ? Number(tm) : 12)
      for (let x = 1; x <= last; x++) if (!trend.has(x)) trend.set(x, emptyBucket(money))
    }

    kpi.err_pct = kpi.cases ? Math.round((kpi.fixable + kpi.lost) / kpi.cases * 1000) / 10 : null
    res.status(200).json({
      scope: wholeHospital ? 'hospital' : access.scope,
      money,
      today,
      data_from: dataFrom,
      checked_at: rows.reduce((m, r) => ((r.checked_at || '') > m ? r.checked_at : m), ''),
      pricing_source: money ? PRICING_SOURCE : null,
      kpi,
      trend: [...trend.entries()].sort((a, b) => a[0] - b[0]).map(([x, b]) => ({ x, ...b })),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
