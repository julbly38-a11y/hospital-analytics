import { createClient } from '@supabase/supabase-js'
import { displayDeptName } from '../../lib/department-display-names'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ТЕСТОВИЙ РЕЖИМ: реального графіка чергувань у lpz-моделі ще немає.
// Тимчасово — по одному лікарю (role='doctor') на кожне клінічне відділення,
// перший за алфавітом прізвища. Коли з'явиться джерело даних про реальні
// чергування — замінити цей запит на нього, інтерфейс (department/doctor) лишити.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })

  try {
    const { data: depts, error: deptErr } = await sb()
      .schema('lpz')
      .from('lpz_departments')
      .select('structure_id, name, direction')
      .eq('org_edrpou', org)
      .not('direction', 'is', null)
      .order('name')
    if (deptErr) return res.status(500).json({ error: deptErr.message })

    const { data: docs, error: docErr } = await sb()
      .schema('lpz')
      .from('lpz_empl')
      .select('department_structure_id, last_name, first_name, middle_name, position_name')
      .eq('org_edrpou', org)
      .eq('role', 'doctor')
      .order('last_name')
    if (docErr) return res.status(500).json({ error: docErr.message })

    const firstDoctorByDept = new Map()
    for (const d of docs) {
      if (!firstDoctorByDept.has(d.department_structure_id)) {
        const initials = [d.first_name, d.middle_name].filter(Boolean).map(n => n.charAt(0) + '.').join('')
        firstDoctorByDept.set(d.department_structure_id, {
          short: [d.last_name, initials].filter(Boolean).join(' '),
          full: [d.last_name, d.first_name, d.middle_name].filter(Boolean).join(' '),
          position: d.position_name || '',
        })
      }
    }

    const rows = depts
      .map(d => {
        const doc = firstDoctorByDept.get(d.structure_id)
        return doc ? { department: displayDeptName(d.name), doctor: doc.short, doctorFull: doc.full, position: doc.position } : null
      })
      .filter(Boolean)

    res.status(200).json({ rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
