import { createClient } from '@supabase/supabase-js'
import { displayDeptName } from '../../lib/department-display-names'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Реальні назви клінічних відділень (org-scoped), розбиті на терапевтичний/
// хірургічний напрямок — для лівого блоку перехідної сторінки (entry.html). Неклінічні
// відділення (block IS NOT NULL: параклінічні, приймально-діагностичні тощо)
// сюди не входять — у них немає напрямку.
export default async function handler(req, res) {
  const org = String(req.query.org || '').trim()
  if (!org) return res.status(400).json({ error: 'org (ЄДРПОУ) обовʼязковий' })

  try {
    const { data, error } = await sb()
      .schema('lpz')
      .from('lpz_departments')
      .select('name, direction, structure_id')
      .eq('org_edrpou', org)
      .not('direction', 'is', null)
      .order('name')

    if (error) return res.status(500).json({ error: error.message })

    const toEntry = d => ({ name: displayDeptName(d.name), structure_id: d.structure_id })
    const therapeutic = data.filter(d => d.direction === 'терапевтичний').map(toEntry)
    const surgical = data.filter(d => d.direction === 'хірургічний').map(toEntry)
    res.status(200).json({ therapeutic, surgical })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
