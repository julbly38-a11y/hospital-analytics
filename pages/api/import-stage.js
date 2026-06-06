import { createServerClient } from '@supabase/ssr'
import { IMPORT_TABLES } from '../../lib/import-config'

async function getMe(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: {
        getAll() { return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value })) },
        setAll() {},
      } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: appUser } = await supabase.from('app_users').select('role, empl_name_id').eq('auth_user_id', user.id).single()
    if (!appUser) return null
    return { role: appUser.role, email: user.email }
  } catch {
    return null
  }
}

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_HEAD = {
  'Content-Type': 'application/json',
  'apikey': process.env.SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
}

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const me = await getMe(req)
  if (!me || me.role !== 'admin') {
    return res.status(403).json({ error: 'Імпорт даних доступний лише адміністраторам' })
  }

  const { table, sourceFile, rows } = req.body || {}
  const cfg = IMPORT_TABLES[table]
  if (!cfg) return res.status(400).json({ error: 'Невідома цільова таблиця' })
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Немає рядків для завантаження' })
  if (rows.length > 5000) return res.status(400).json({ error: 'Забагато рядків за раз (максимум 5000). Розбийте файл.' })

  const allowedKeys = new Set(cfg.fields.map(f => f.key))
  const batchId = `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Готуємо рядки для вставки в staging — пропускаємо невідомі ключі мапінгу
  const stagingRows = rows.map(r => {
    const row = { import_batch: batchId }
    for (const k of Object.keys(r || {})) {
      if (allowedKeys.has(k)) {
        const v = r[k]
        row[k] = (v === undefined || v === null || v === '') ? null : String(v).trim()
      }
    }
    return row
  })

  try {
    // Журнал імпорту
    const logRow = {
      batch_id: batchId,
      target_table: table,
      source_file: sourceFile || null,
      imported_by: me.email || null,
      total_rows: stagingRows.length,
      status: 'running',
    }
    const rLog = await fetch(`${SB}/rest/v1/import_log`, {
      method: 'POST',
      headers: { ...SERVICE_HEAD, 'Prefer': 'return=minimal' },
      body: JSON.stringify(logRow),
    })
    if (!rLog.ok) {
      const t = await rLog.text()
      return res.status(500).json({ error: 'Не вдалося створити запис журналу імпорту: ' + t })
    }

    // Вставка пачками по 500 рядків
    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < stagingRows.length; i += CHUNK) {
      const chunk = stagingRows.slice(i, i + CHUNK)
      const rIns = await fetch(`${SB}/rest/v1/${cfg.staging}`, {
        method: 'POST',
        headers: { ...SERVICE_HEAD, 'Prefer': 'return=minimal' },
        body: JSON.stringify(chunk),
      })
      if (!rIns.ok) {
        const t = await rIns.text()
        // Позначаємо журнал як помилковий
        await fetch(`${SB}/rest/v1/import_log?batch_id=eq.${encodeURIComponent(batchId)}`, {
          method: 'PATCH',
          headers: SERVICE_HEAD,
          body: JSON.stringify({ status: 'error', notes: 'Помилка вставки у staging: ' + t.slice(0, 500), finished_at: new Date().toISOString() }),
        })
        return res.status(500).json({ error: 'Помилка завантаження у проміжну таблицю: ' + t })
      }
      inserted += chunk.length
    }

    return res.status(200).json({ ok: true, batchId, staged: inserted })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Невідома помилка' })
  }
}
