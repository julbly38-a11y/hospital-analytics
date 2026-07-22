import { createClient } from '@supabase/supabase-js'

// Скидання пароля напряму зі слайд-форми (public/js/staff-login.js) — без
// переходу на /login: якщо email вже введений у полі LOGIN, "Забув пароль?"
// одразу шле лист, замість того щоб змушувати вводити той самий email ще раз
// на іншій сторінці. redirectTo береться з origin запиту (той самий домен,
// звідки натиснули кнопку), не хардкодиться.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не підтримується' })
  }

  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Введіть email' })

  const origin = req.headers.origin || `https://${req.headers.host}`
  const redirectTo = `${origin}/auth/reset-password`

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim(), { redirectTo })
  if (error) return res.status(400).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
