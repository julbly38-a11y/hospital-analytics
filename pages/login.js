import { useState, useMemo } from 'react'
import Head from 'next/head'
import { createClient } from '../lib/supabase'
import { useRouter } from 'next/router'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])

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

  return (
    <>
      <Head>
        <title>ЛСМД — Вхід</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '32px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>+</div>
            <h1 style={{ fontSize: '18px', fontFamily: 'var(--mono)', fontWeight: 500, marginTop: '8px' }}>ЛСМД</h1>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>Медичний Асистент</p>
          </div>

          {/* ── Login form ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Email
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', fontFamily: 'var(--mono)', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Пароль
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', fontFamily: 'var(--mono)', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                <button type="button" onClick={() => { setMode('reset'); setError(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', fontFamily: 'var(--mono)', cursor: 'pointer', padding: 0 }}>
                  Забули пароль?
                </button>
              </div>

              {error && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '12px', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Вхід...' : 'Увійти →'}
              </button>
            </form>
          )}

          {/* ── Reset password form ── */}
          {mode === 'reset' && !resetSent && (
            <form onSubmit={handleReset}>
              <p style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: '20px', lineHeight: 1.6 }}>
                Введіть ваш email — надішлемо посилання для скидання пароля.
              </p>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Email
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', fontFamily: 'var(--mono)', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              {error && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '12px', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Надсилаємо…' : 'Надіслати посилання →'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" onClick={() => { setMode('login'); setError(null) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '11px', fontFamily: 'var(--mono)', cursor: 'pointer' }}>
                  ← Назад до входу
                </button>
              </div>
            </form>
          )}

          {/* ── Reset sent ── */}
          {mode === 'reset' && resetSent && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✉️</div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--mono)', marginBottom: 8 }}>Лист надіслано!</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', lineHeight: 1.6, marginBottom: 20 }}>
                Перевірте {email} і перейдіть за посиланням у листі.
              </div>
              <button onClick={() => { setMode('login'); setResetSent(false); setError(null) }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', padding: '8px 20px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--mono)' }}>
                ← Назад до входу
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
