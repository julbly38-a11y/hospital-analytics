import { createServerClient } from '@supabase/ssr'

// Серверний логін для статичного слайда (public/khotyn_slide.html).
// Приймає { email, password }, виконує Supabase signInWithPassword
// і виставляє auth-cookie через @supabase/ssr, щоб middleware впізнав сесію.

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

  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Введіть логін і пароль' })
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

  const { error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password),
  })

  if (error) {
    return res.status(401).json({ error: 'Невірний логін або пароль' })
  }

  if (cookiesToSet.length) {
    res.setHeader('Set-Cookie', cookiesToSet.map(({ name, value, options }) =>
      serializeCookie(name, value, options)))
  }

  return res.status(200).json({ ok: true })
}
