import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClient } from '../../lib/supabase'

const SERIF = "'Cormorant Garamond', serif"

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

  const label = { fontSize: '11px', color: 'var(--c-taupe)', textTransform: 'uppercase', letterSpacing: '0.08em' }
  const inp = {
    width: '100%', marginTop: '6px', padding: '10px 12px',
    background: 'rgba(240,236,232,0.5)', border: '1px solid var(--c-taupe-light)',
    borderRadius: '6px', color: 'var(--c-ink-1)', fontSize: '15px',
    boxSizing: 'border-box', outline: 'none',
  }
  const primaryBtn = {
    width: '100%', padding: '12px', background: 'var(--c-ink-3)', border: 'none',
    borderRadius: '20px', color: 'var(--c-white)', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
  }

  return (
    <>
      <Head>
        <title>Лікарняна аналітика — Новий пароль</title>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;500&subset=cyrillic&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/shared/theme.css" />
      </Head>

      <div style={{ minHeight: '100vh', background: 'var(--c-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          background: 'var(--c-white)', border: '1px solid rgba(178,124,139,0.25)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          borderRadius: '12px', padding: '40px', width: '100%', maxWidth: '380px'
        }}>

          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '24px', fontFamily: SERIF, fontWeight: 500, color: 'var(--c-accent-berry)' }}>
              Лікарняна аналітика
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--c-taupe)', marginTop: '6px' }}>Встановити новий пароль</p>
          </div>

          {status === 'loading' && (
            <div style={{ textAlign: 'center', color: 'var(--c-taupe)', fontSize: 13 }}>
              Перевірка посилання…
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={label}>Новий пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Мінімум 6 символів" style={inp} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={label}>Підтвердити пароль</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="Повторіть пароль" style={inp} />
              </div>

              {message && (
                <div style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--c-accent-red)' }}>
                  {message}
                </div>
              )}

              <button type="submit" style={primaryBtn}>
                Зберегти пароль →
              </button>
            </form>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, color: 'var(--c-sage)', marginBottom: 8 }}>✓</div>
              <div style={{ color: 'var(--c-sage)', fontSize: 15, marginBottom: 20 }}>Пароль успішно змінено</div>
              <button onClick={() => router.push('/login')} style={primaryBtn}>
                Увійти →
              </button>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--c-accent-red)', fontSize: 13, marginBottom: 16 }}>
                {message || 'Посилання недійсне або прострочене'}
              </div>
              <button onClick={() => router.push('/login')}
                style={{ background: 'transparent', border: '1px solid var(--c-taupe-light)', borderRadius: 20, color: 'var(--c-taupe)', padding: '8px 20px', cursor: 'pointer', fontSize: 12 }}>
                На сторінку входу
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
