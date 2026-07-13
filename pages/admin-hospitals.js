import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

const SANS = { fontFamily: '"IBM Plex Sans", sans-serif' }
const MONO = { fontFamily: '"IBM Plex Mono", monospace' }

export default function AdminHospitals() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(null)
  const [hospitals, setHospitals] = useState(null)
  const [err, setErr] = useState(null)
  const [active, setActive] = useState(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(me => {
      if (me.role !== 'admin') { router.replace('/'); return }
      setAllowed(true)
    })
  }, [router])

  useEffect(() => {
    if (!allowed) return
    fetch('/api/hospitals').then(r => {
      if (!r.ok) throw new Error('hospitals ' + r.status)
      return r.json()
    }).then(d => {
      setHospitals(d.hospitals || [])
      if (d.hospitals?.[0]) setActive(d.hospitals[0].edrpou)
    }).catch(e => setErr(e.message))
  }, [allowed])

  if (!allowed) return null

  return (
    <>
      <Head><title>Лікарні — адмін</title></Head>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f0ece8', ...SANS }}>
        <div style={{ width: 260, padding: '32px 20px', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: '#1a1a1a' }}>Лікарні</h1>
          {err && <div style={{ color: '#c0392b', fontSize: 13 }}>{err}</div>}
          {!hospitals && !err && <div style={{ fontSize: 13, color: '#888', ...MONO }}>завантаження…</div>}
          {hospitals?.map(h => (
            <div
              key={h.edrpou}
              onClick={() => setActive(h.edrpou)}
              style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 8, cursor: 'pointer',
                background: active === h.edrpou ? 'rgba(74,152,112,0.15)' : 'transparent',
                border: `1px solid ${active === h.edrpou ? '#4a9870' : 'transparent'}`,
              }}
            >
              <div style={{ fontSize: 14, color: '#1a1a1a' }}>{h.display_name || h.edrpou}</div>
              <div style={{ fontSize: 11, color: '#888', ...MONO }}>{h.edrpou}</div>
            </div>
          ))}
          {active && (
            <a
              href={`/khotyn_slide.html?org=${encodeURIComponent(active)}`}
              target="_blank" rel="noreferrer"
              style={{ display: 'block', marginTop: 20, fontSize: 12, color: '#4a9870', ...MONO }}
            >
              відкрити в новій вкладці →
            </a>
          )}
        </div>
        <div style={{ flex: 1, padding: 20 }}>
          {active ? (
            <iframe
              key={active}
              src={`/khotyn_slide.html?org=${encodeURIComponent(active)}`}
              style={{ width: '100%', height: '100%', minHeight: 600, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, background: '#fff' }}
            />
          ) : (
            <div style={{ color: '#888', fontSize: 13, ...MONO }}>Обери лікарню зліва</div>
          )}
        </div>
      </div>
    </>
  )
}
