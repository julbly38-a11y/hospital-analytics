import { createClient } from '@supabase/supabase-js'

// Щоденне перенесення перевірки випадків із вкладки helsi.pro у
// lpz_case_quality_snapshot (scripts/helsi_quality_daily.js). Лише для
// локального dev-сервера: пише в базу сервісним ключем, тож на проді вимкнено.
export const config = { api: { bodyParser: { sizeLimit: '50mb' } } }

const ORGS = new Set(['43342788', '02005875'])
const norm = s => String(s || '').toLowerCase().replace(/[«»"'’ʼ`]/g, '').replace(/\s+/g, ' ').trim()

// Строк подачі змін до НСЗУ: 10-й робочий день місяця, наступного за місяцем
// виписки. У воєнний стан святкові дні робочі — рахуємо лише вихідні.
function fixDeadline(dischargeIso) {
  if (!dischargeIso) return null
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit' })
    .format(new Date(dischargeIso)).split('-').map(Number)
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 0 : m
  let count = 0
  for (let day = 1; day <= 31; day++) {
    const dt = new Date(Date.UTC(year, month, day))
    if (dt.getUTCMonth() !== month) break
    const wd = dt.getUTCDay()
    if (wd !== 0 && wd !== 6 && ++count === 10) return dt.toISOString().slice(0, 10)
  }
  return null
}

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') return res.status(404).end()
  res.setHeader('Access-Control-Allow-Origin', 'https://helsi.pro')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { org, rows: rawRows, runStartedAt } = req.body || {}
  if (!ORGS.has(org) || !Array.isArray(rawRows) || !runStartedAt) return res.status(400).json({ error: 'bad payload' })
  const rows = [...new Map(rawRows.map(r => [r.case_id, r])).values()]

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const lpz = sb.schema('lpz')

  const { data: depts } = await lpz.from('lpz_departments').select('structure_id, name').eq('org_edrpou', org)
  const { data: empl } = await lpz.from('lpz_empl').select('resource_id, last_name, first_name, middle_name').eq('org_edrpou', org).eq('role', 'doctor')
  const deptList = (depts || []).map(d => ({ id: d.structure_id, key: norm(d.name) }))
  const deptId = name => {
    const k = norm(name)
    return deptList.find(d => d.key === k)?.id || deptList.find(d => k.startsWith(d.key))?.id || null
  }
  const emplByName = new Map((empl || []).map(e => [norm([e.last_name, e.first_name, e.middle_name].join(' ')), e.resource_id]))
  // Підпис виписки в helsi — скорочено ("Прізвище І. П."); однофамільців з
  // тими самими ініціалами не зіставляємо — адресатом тоді стає завідувач.
  const shortKey = (last, first, middle) => norm(`${last} ${(first || '')[0] || ''} ${(middle || '')[0] || ''}`)
  const emplByShort = new Map()
  ;(empl || []).forEach(e => {
    const k = shortKey(e.last_name, e.first_name, e.middle_name)
    emplByShort.set(k, emplByShort.has(k) ? null : e.resource_id)
  })
  const signerId = s => {
    const m = String(s || '').match(/^\s*(\S+)\s+(\S)\S*\.?\s*(\S)?/)
    return m ? emplByShort.get(shortKey(m[1], m[2], m[3])) || null : null
  }

  const existing = new Map()
  const ids = rows.map(r => r.case_id)
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await lpz.from('lpz_case_quality_snapshot')
      .select('helsi_case_id, flags, warnings, first_flagged_at, resolved_at')
      .eq('org_edrpou', org).in('helsi_case_id', ids.slice(i, i + 150))
    ;(data || []).forEach(e => existing.set(e.helsi_case_id, e))
  }

  const now = new Date().toISOString()
  let resolved = 0, newlyFlagged = 0
  const out = rows.map(r => {
    const prev = existing.get(r.case_id)
    const hasNow = r.flags.length + r.warnings.length > 0
    const hadBefore = prev && (prev.flags?.length || 0) + (prev.warnings?.length || 0) > 0
    let first_flagged_at = prev?.first_flagged_at || null
    let resolved_at = prev?.resolved_at || null
    if (hasNow && !hadBefore) { first_flagged_at = first_flagged_at || now; resolved_at = null; newlyFlagged++ }
    if (hasNow && hadBefore) resolved_at = null
    if (!hasNow && hadBefore) { resolved_at = now; resolved++ }
    return {
      org_edrpou: org,
      helsi_case_id: r.case_id,
      card_number: r.number,
      is_open: r.is_open,
      admission_at: r.start,
      discharge_at: r.end,
      los_days: r.los_days,
      department_name: r.dept,
      department_structure_id: deptId(r.dept),
      doctor_name: r.doctor_short || r.signer_short || null,
      doctor_resource_id: (r.doctor_full && emplByName.get(norm(r.doctor_full))) || signerId(r.signer_short),
      doctor_position: r.position,
      primary_icd: r.primary,
      primary_name: r.primary_name,
      dx_codes: r.dx_codes,
      procedures_count: r.procs_count,
      disposition: r.disposition,
      discharge_ehealth_status: r.discharge_status,
      flags: r.flags,
      warnings: r.warnings,
      hints: r.hints || {},
      operations_count: r.operations_count || 0,
      admission_priority: r.priority || null,
      fix_deadline: r.is_open ? null : fixDeadline(r.end),
      snapshot_at: now,
      checked_at: now,
      first_flagged_at,
      resolved_at,
    }
  })

  for (let i = 0; i < out.length; i += 500) {
    const { error } = await lpz.from('lpz_case_quality_snapshot').upsert(out.slice(i, i + 500), { onConflict: 'org_edrpou,helsi_case_id' })
    if (error) return res.status(500).json({ error: error.message, at: i })
  }

  // Відкриті вчора, але відсутні в сьогоднішньому прогоні (скасовані або
  // закриті без виписки) — більше не актуальні.
  const { count: removed } = await lpz.from('lpz_case_quality_snapshot')
    .delete({ count: 'exact' })
    .eq('org_edrpou', org).eq('is_open', true).lt('checked_at', runStartedAt)

  res.status(200).json({
    upserted: out.length,
    open: out.filter(o => o.is_open).length,
    closed: out.filter(o => !o.is_open).length,
    newly_flagged: newlyFlagged,
    resolved,
    removed_stale_open: removed || 0,
    dept_unmatched: [...new Set(out.filter(o => !o.department_structure_id).map(o => o.department_name))],
    addressed_to_doctor: out.filter(o => o.doctor_resource_id && o.flags.length + o.warnings.length).length,
    addressed_to_head: out.filter(o => !o.doctor_resource_id && o.flags.length + o.warnings.length).length,
  })
}
