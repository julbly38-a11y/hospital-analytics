import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import { createClient } from '../lib/supabase'

/* Сторінки без авторизації */
const PUBLIC = ['/', '/login', '/auth/reset-password']

/* Сторінки тільки для адміна */
const ADMIN_ONLY = ['/admit', '/import', '/glow', '/analytics', '/dept']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [auth, setAuth] = useState({ loaded: false, role: null })
  const supabase = useMemo(() => typeof window !== 'undefined' ? createClient() : null, [])

  useEffect(() => {
    if (!supabase) return

    // Перша перевірка при старті
    fetch('/api/me')
      .then(r => r.json())
      .then(d => setAuth({ loaded: true, role: d?.role || null }))
      .catch(() => setAuth({ loaded: true, role: null }))

    // Слухаємо зміни авторизації (логін/логаут)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuth({ loaded: true, role: null })
      } else if (event === 'SIGNED_IN') {
        fetch('/api/me')
          .then(r => r.json())
          .then(d => setAuth({ loaded: true, role: d?.role || null }))
          .catch(() => setAuth({ loaded: true, role: null }))
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const path = router.pathname
  const isPublic = PUBLIC.includes(path)

  /* Чекаємо завантаження (не на публічних сторінках) */
  if (!isPublic && !auth.loaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: '#0f1117'
      }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#555' }}>
          завантаження…
        </span>
      </div>
    )
  }

  /* Не авторизований → на логін */
  if (!isPublic && !auth.role) {
    if (typeof window !== 'undefined') router.replace('/login')
    return null
  }

  /* Не адмін намагається зайти на адмін-сторінку → на кабінет (якщо лікар) або головну */
  if (ADMIN_ONLY.includes(path) && auth.role !== 'admin') {
    if (typeof window !== 'undefined') router.replace(auth.role === 'doctor' ? '/cabinet' : '/')
    return null
  }

  return <Component {...pageProps} />
}
