import { useState, useMemo, useEffect } from 'react'
import Head from 'next/head'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/router'

const SERIF = "'Cormorant Garamond', serif"

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])

  // "Забув пароль?" на статичних слайдах (staff-login.js) веде сюди з
  // ?mode=reset, щоб одразу відкрити форму скидання, а не форму входу
  // (без цього користувач бачив логін-форму й мусив ще раз клікати
  // "Забули пароль?" тут — саме той баг, що плутав з редіректом на логін).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('mode') === 'reset') setMode('reset')
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (!email) { setError('Введіть email'); return }
    setLoading(true); setError(null)
    const redirectTo = `${window.location.origin}/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (error) setError(error.message)
    else setResetSent(true)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!supabase) { setLoading(false); return }
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  const label = { fontSize: '11px', color: 'var(--c-taupe)', textTransform: 'uppercase', letterSpacing: '0.08em' }
  const input = {
    width: '100%', marginTop: '6px', padding: '10px 12px',
    background: 'rgba(240,236,232,0.5)', border: '1px solid var(--c-taupe-light)',
    borderRadius: '6px', color: 'var(--c-ink-1)', fontSize: '15px',
    boxSizing: 'border-box', outline: 'none', transition: 'border-color .2s ease',
  }
  const primaryBtn = (busy) => ({
    width: '100%', padding: '12px', background: 'var(--c-ink-3)', border: 'none',
    borderRadius: '20px', color: 'var(--c-white)', fontSize: '14px', fontWeight: 500,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, letterSpacing: '0.02em',
  })
  const linkBtn = { background: 'none', border: 'none', color: 'var(--c-taupe)', fontSize: '12px', cursor: 'pointer', padding: 0 }

  return (
    <>
      <Head>
        <title>Лікарняна аналітика — Вхід</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;500&subset=cyrillic&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/shared/theme.css" />
      </Head>

      <div style={{
        minHeight: '100vh', background: 'var(--c-cream)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          background: 'var(--c-white)', border: '1px solid rgba(178,124,139,0.25)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '26px', fontFamily: SERIF, fontWeight: 500, color: 'var(--c-accent-berry)' }}>
              Лікарняна аналітика
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--c-taupe)', marginTop: '6px' }}>Вхід для працівників</p>
          </div>

          {/* ── Login form ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '16px' }}>
                <label style={label}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={input} />
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={label}>Пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={input} />
              </div>

              <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                <button type="button" onClick={() => { setMode('reset'); setError(null) }} style={linkBtn}>
                  Забули пароль?
                </button>
              </div>

              {error && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--c-accent-red)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                {loading ? 'Вхід...' : 'Увійти →'}
              </button>
            </form>
          )}

          {/* ── Reset password form ── */}
          {mode === 'reset' && !resetSent && (
            <form onSubmit={handleReset}>
              <p style={{ fontSize: '13px', color: 'var(--c-taupe)', marginBottom: '20px', lineHeight: 1.6 }}>
                Введіть ваш email — надішлемо посилання для скидання пароля.
              </p>
              <div style={{ marginBottom: '20px' }}>
                <label style={label}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={input} />
              </div>

              {error && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--c-accent-red)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                {loading ? 'Надсилаємо…' : 'Надіслати посилання →'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" onClick={() => { setMode('login'); setError(null) }} style={linkBtn}>
                  ← Назад до входу
                </button>
              </div>
            </form>
          )}

          {/* ── Reset sent ── */}
          {mode === 'reset' && resetSent && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
              <div style={{ fontSize: 15, color: 'var(--c-ink-1)', marginBottom: 8 }}>Лист надіслано!</div>
              <div style={{ fontSize: 12, color: 'var(--c-taupe)', lineHeight: 1.6, marginBottom: 20 }}>
                Перевірте {email} і перейдіть за посиланням у листі.
              </div>
              <button onClick={() => { setMode('login'); setResetSent(false); setError(null) }}
                style={{ background: 'none', border: '1px solid var(--c-taupe-light)', borderRadius: 20, color: 'var(--c-taupe)', padding: '8px 20px', cursor: 'pointer', fontSize: 12 }}>
                ← Назад до входу
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
