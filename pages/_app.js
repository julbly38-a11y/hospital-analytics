import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import '../styles/globals.css'

/* Сторінки без авторизації */
const PUBLIC = ['/login']

/* Сторінки тільки для адміна */
const ADMIN_ONLY = ['/admit', '/import', '/glow', '/analytics', '/dept']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [auth, setAuth] = useState({ loaded: false, role: null })

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => setAuth({ loaded: true, role: d?.role || null }))
      .catch(() => setAuth({ loaded: true, role: null }))
  }, [router.pathname])

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

  /* Не адмін намагається зайти на адмін-сторінку → на кабінет (якщо лікар) або логін */
  if (ADMIN_ONLY.includes(path) && auth.role !== 'admin') {
    if (typeof window !== 'undefined') router.replace(auth.role === 'doctor' ? '/cabinet' : '/')
    return null
  }

  return <Component {...pageProps} />
}
