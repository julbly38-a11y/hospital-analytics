import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClient } from '../../lib/supabase'

const MONO = { fontFamily: 'IBM Plex Mono, monospace' }

export default function ResetPassword() {
  const router = useRouter()
  const supabase = useMemo(() => typeof window !== 'undefined' ? createClient() : null, [])

  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [status,   setStatus]   = useState('loading') // loading | ready | success | error
  const [message,  setMessage]  = useState('')

  useEffect(() => {
    if (!supabase) return
    let done = false
    const ready = () => { if (!done) { done = true; setStatus('ready') } }
    const fail = (msg) => { if (!done) { done = true; setStatus('error'); setMessage(msg) } }

    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search) : new URLSearchParams()
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    const code = params.get('code')
    const hasHash = typeof window !== 'undefined' && window.location.hash.includes('access_token')

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || session) ready()
    })

    if (tokenHash) {
      // Надійний механізм: верифікація OTP за token_hash (без code_verifier)
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'recovery' })
        .then(({ error }) => error
          ? fail('Посилання недійсне або застаріле. Запросіть новий лист.')
          : ready())
    } else {
      // Фолбек на старі формати (?code= / #access_token), які SDK обробляє сам
      supabase.auth.getSession().then(({ data }) => { if (data?.session) ready() })
      const hasToken = code || hasHash
      setTimeout(() => fail(hasToken
        ? 'Посилання недійсне або застаріле. Запросіть новий лист.'
        : 'Немає токена. Відкрийте посилання з листа.'), 6000)
    }

    return () => subscription.unsubscribe()
  }, [supabase]) // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setMessage('Паролі не збігаються'); return }
    if (password.length < 6)  { setMessage('Мінімум 6 символів');   return }

    setStatus('loading')
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus('ready')
      setMessage(error.message || 'Помилка оновлення пароля')
    } else {
      setStatus('success')
    }
  }

  const inp = {
    width: '100%', marginTop: '6px', padding: '10px 12px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: '6px', color: 'var(--text)', fontSize: '14px',
    ...MONO, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <>
      <Head>
        <title>ЛСМД — Новий пароль</title>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px' }}>

          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '28px', color: 'var(--accent)', ...MONO }}>+</div>
            <h1 style={{ fontSize: '16px', ...MONO, fontWeight: 500, marginTop: '8px' }}>ЛСМД</h1>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>Встановити новий пароль</p>
          </div>

          {status === 'loading' && (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, ...MONO }}>
              Перевірка посилання…
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', ...MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Новий пароль
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Мінімум 6 символів" style={inp} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', ...MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Підтвердити пароль
                </label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="Повторіть пароль" style={inp} />
              </div>

              {message && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '12px', color: '#ef4444', ...MONO }}>
                  {message}
                </div>
              )}

              <button type="submit" style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#000', fontSize: '13px', ...MONO, fontWeight: 500, cursor: 'pointer' }}>
                Зберегти пароль →
              </button>
            </form>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, color: '#7fd99a', marginBottom: 8 }}>✓</div>
              <div style={{ color: '#7fd99a', fontSize: 14, ...MONO, marginBottom: 20 }}>Пароль успішно змінено</div>
              <button onClick={() => router.push('/login')} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#000', padding: '10px 24px', cursor: 'pointer', fontSize: 13, ...MONO, fontWeight: 500 }}>
                Увійти →
              </button>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#ef4444', fontSize: 13, ...MONO, marginBottom: 16 }}>
                {message || 'Посилання недійсне або прострочене'}
              </div>
              <button onClick={() => router.push('/login')} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', padding: '8px 20px', cursor: 'pointer', fontSize: 12, ...MONO }}>
                На сторінку входу
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
