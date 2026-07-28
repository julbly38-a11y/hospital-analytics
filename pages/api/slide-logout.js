import { createServerClient } from '@supabase/ssr'

// Серверний логаут для статичного кабінету (public/cabinet.html).
// Викликає Supabase signOut і чистить auth-cookie через @supabase/ssr.

function serializeCookie(name, value, opt = {}) {
  let str = `${name}=${encodeURIComponent(value)}`
  if (opt.maxAge != null) str += `; Max-Age=${Math.floor(opt.maxAge)}`
  if (opt.expires) str += `; Expires=${new Date(opt.expires).toUTCString()}`
  str += `; Path=${opt.path || '/'}`
  if (opt.domain) str += `; Domain=${opt.domain}`
  if (opt.httpOnly) str += `; HttpOnly`
  if (opt.secure) str += `; Secure`
  if (opt.sameSite) {
    const s = String(opt.sameSite)
    str += `; SameSite=${s.charAt(0).toUpperCase() + s.slice(1)}`
  }
  return str
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не підтримується' })
  }

  const cookiesToSet = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }))
        },
        setAll(list) {
          list.forEach((c) => cookiesToSet.push(c))
        },
      },
    }
  )

  await supabase.auth.signOut()

  if (cookiesToSet.length) {
    res.setHeader('Set-Cookie', cookiesToSet.map(({ name, value, options }) =>
      serializeCookie(name, value, options)))
  }

  return res.status(200).json({ ok: true })
}
