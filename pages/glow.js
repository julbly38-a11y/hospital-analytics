import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'

/* ── Data hook ───────────────────────────────────── */
function useStats(key) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch('/api/stats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    }).then(r => r.json()).then(d => { setData(d.rows || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  return { data, loading }
}

/* ── Colors ──────────────────────────────────────── */
const BG = '#060e1c'
const GRID = 'rgba(0,200,255,0.07)'
const DOC_C  = ['#00e5ff','#00ff88','#ffaa00','#bf5fff','#ff66aa','#4d9fff','#ff8800','#ff2d55']
const DIAG_C = ['#00e5ff','#00ff88','#ffaa00','#ff2d55','#bf5fff','#4d9fff','#ff66aa','#ff8800']

/* ── Canvas helpers ───────────────────────────────── */
function ctx2d(canvas) {
  if (!canvas?.parentElement) return null
  const dpr = window.devicePixelRatio || 1
  const W = canvas.parentElement.clientWidth
  const H = canvas.parentElement.clientHeight
  if (canvas.width !== W * dpr) canvas.width = W * dpr
  if (canvas.height !== H * dpr) canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, W, H }
}

function glow(ctx, fn, col, lw = 1.5) {
  ctx.save()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col
  ctx.globalAlpha = 0.10; ctx.shadowBlur = 32; ctx.shadowColor = col
  ctx.lineWidth = lw * 6; fn(); ctx.stroke()
  ctx.globalAlpha = 0.30; ctx.shadowBlur = 16; ctx.lineWidth = lw * 2.5; fn(); ctx.stroke()
  ctx.globalAlpha = 1.00; ctx.shadowBlur = 8;  ctx.lineWidth = lw; fn(); ctx.stroke()
  ctx.restore()
}

function glowBar(ctx, x, y, w, h, col) {
  ctx.save(); ctx.fillStyle = col
  ctx.globalAlpha = 0.12; ctx.shadowBlur = 24; ctx.shadowColor = col; ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 0.38; ctx.shadowBlur = 12; ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1.00; ctx.shadowBlur = 6;  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function glowDot(ctx, x, y, r, col) {
  ctx.save(); ctx.fillStyle = col
  ctx.shadowBlur = 18; ctx.shadowColor = col
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.shadowBlur = 4; ctx.globalAlpha = 0.9
  ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function spline(ctx, pts) {
  if (pts.length < 2) return
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i]
    const p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)]
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y
    )
  }
}

function drawGrid(ctx, W, H, p) {
  ctx.save(); ctx.strokeStyle = GRID; ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = p.t + (H - p.t - p.b) * i / 4
    ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(W - p.r, y); ctx.stroke()
  }
  ctx.restore()
}

function lbl(ctx, text, x, y, col = 'rgba(120,180,255,0.5)', sz = 9, align = 'center') {
  ctx.save(); ctx.font = `${sz}px 'IBM Plex Mono',monospace`
  ctx.fillStyle = col; ctx.textAlign = align; ctx.shadowBlur = 0
  ctx.fillText(String(text), x, y); ctx.restore()
}

/* ── Chart 1: Monthly admissions ─────────────────── */
function drawMonthly(canvas, rows, pr) {
  const s = ctx2d(canvas); if (!s || !rows.length) return
  const { ctx, W, H } = s
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  const p = { t: 26, b: 32, l: 50, r: 20 }
  const cW = W - p.l - p.r, cH = H - p.t - p.b
  drawGrid(ctx, W, H, p)

  const av = rows.map(d => Number(d.поступлень) || 0)
  const dv = rows.map(d => Number(d.померло) || 0)
  const mn = Math.min(...av) - 80, mx = Math.max(...av)
  const mxD = Math.max(...dv) + 3
  const n = rows.length
  const sx = i => p.l + i / (n - 1) * cW
  const syA = v => p.t + (1 - (v - mn) / (mx - mn)) * cH
  const syD = v => p.t + (1 - v / mxD) * cH

  const ptA = av.map((v, i) => ({ x: sx(i), y: syA(v) }))
  const ptD = dv.map((v, i) => ({ x: sx(i), y: syD(v) }))

  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, p.l + cW * pr, H); ctx.clip()

  const gr = ctx.createLinearGradient(0, p.t, 0, p.t + cH)
  gr.addColorStop(0, 'rgba(0,229,255,0.20)'); gr.addColorStop(1, 'rgba(0,229,255,0)')
  ctx.save(); ctx.fillStyle = gr; ctx.beginPath()
  spline(ctx, ptA)
  ctx.lineTo(ptA[ptA.length - 1].x, p.t + cH); ctx.lineTo(ptA[0].x, p.t + cH)
  ctx.closePath(); ctx.fill(); ctx.restore()

  glow(ctx, () => spline(ctx, ptA), '#00e5ff', 2)
  glow(ctx, () => spline(ctx, ptD), '#ff2d55', 1.5)
  if (pr >= 1) {
    ptA.forEach(p2 => glowDot(ctx, p2.x, p2.y, 3, '#00e5ff'))
    ptD.forEach(p2 => glowDot(ctx, p2.x, p2.y, 2.5, '#ff2d55'))
  }
  ctx.restore()

  rows.forEach((d, i) => lbl(ctx, d.місяць || i + 1, sx(i), H - 9, 'rgba(120,180,255,0.5)', 9))
  ;[0, 0.25, 0.5, 0.75, 1].forEach(t =>
    lbl(ctx, Math.round(mn + (mx - mn) * t), p.l - 5, p.t + (1 - t) * cH + 3, 'rgba(120,180,255,0.4)', 9, 'right'))
  lbl(ctx, '● Поступлення', W - 3, p.t + 11, '#00e5ff', 9, 'right')
  lbl(ctx, '● Померло',     W - 3, p.t + 23, '#ff2d55', 9, 'right')
}

/* ── Chart 2: Doctor workload ─────────────────────── */
function drawDoctors(canvas, rows, pr) {
  const s = ctx2d(canvas); if (!s || !rows.length) return
  const { ctx, W, H } = s
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  const data = rows.slice(0, 8)
  const p = { t: 8, b: 8, l: 112, r: 46 }
  const cW = W - p.l - p.r, cH = H - p.t - p.b
  const mx = Number(data[0]?.випадків) || 1
  const rowH = cH / data.length

  data.forEach((d, i) => {
    const y = p.t + i * rowH + rowH / 2 - 6
    const bW = (Number(d.випадків) / mx) * cW * pr
    const col = DOC_C[i]
    glowBar(ctx, p.l, y, bW, 11, col)
    lbl(ctx, (d.лікар || '').slice(0, 16), p.l - 4, y + 9, col, 8.5, 'right')
    if (pr >= 0.9) lbl(ctx, d.випадків, p.l + bW + 4, y + 9, col, 8.5, 'left')
  })
}

/* ── Chart 3: Diagnoses ──────────────────────────── */
function drawDiagnoses(canvas, rows, pr) {
  const s = ctx2d(canvas); if (!s || !rows.length) return
  const { ctx, W, H } = s
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  const data = rows.slice(0, 8)
  const p = { t: 8, b: 8, l: 104, r: 46 }
  const cW = W - p.l - p.r, cH = H - p.t - p.b
  const mx = Number(data[0]?.випадків) || 1
  const rowH = cH / data.length

  data.forEach((d, i) => {
    const y = p.t + i * rowH + rowH / 2 - 6
    const bW = (Number(d.випадків) / mx) * cW * pr
    const col = DIAG_C[i]
    glowBar(ctx, p.l, y, bW, 11, col)
    const tag = `${d.код || ''} ${(d.діагноз || '').slice(0, 12)}`
    lbl(ctx, tag, p.l - 4, y + 9, col, 8, 'right')
    if (pr >= 0.9) lbl(ctx, d.випадків, p.l + bW + 4, y + 9, col, 8, 'left')
  })
}

/* ── Page component ──────────────────────────────── */
export default function GlowPage() {
  const monthly = useStats('peakMonth')
  const doctors = useStats('wDoctors')
  const diagnoses = useStats('wDiag')

  const c1 = useRef(null)
  const c2 = useRef(null)
  const c3 = useRef(null)

  const loading = monthly.loading || doctors.loading || diagnoses.loading

  useEffect(() => {
    if (loading) return
    let startTs = null
    let raf
    const frame = (ts) => {
      if (!startTs) startTs = ts
      const pr = Math.min((ts - startTs) / 1800, 1)
      const e = 1 - Math.pow(1 - pr, 3)
      drawMonthly(c1.current, monthly.data, e)
      drawDoctors(c2.current, doctors.data, e)
      drawDiagnoses(c3.current, diagnoses.data, e)
      if (pr < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [loading, monthly.data, doctors.data, diagnoses.data])

  const CV = { display: 'block', width: '100%', height: '100%' }

  return (
    <>
      <Head>
        <title>ЛСМД · Гло-аналітика</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <style jsx global>{`
        body { background: #060e1c !important; margin: 0; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.2); }
      `}</style>

      <div style={{ fontFamily: "'IBM Plex Mono',monospace", color: '#c8d8e8', minHeight: '100vh', padding: '20px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 18, borderBottom: '1px solid rgba(0,229,255,0.15)' }}>
          <span style={{ fontSize: 22, fontWeight: 300, color: '#00e5ff', textShadow: '0 0 14px #00e5ff', lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>ЛСМД · Гло-аналітика</span>
          {loading && <span style={{ fontSize: 10, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em' }}>завантаження…</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {[['← Дашборд', '/analytics'], ['AI Асистент', '/']].map(([t, h]) => (
              <Link key={h} href={h} style={{ fontSize: 11, color: 'rgba(120,180,255,0.6)', textDecoration: 'none', padding: '5px 12px', border: '1px solid rgba(0,229,255,0.18)', borderRadius: 5, transition: 'border-color .15s' }}>{t}</Link>
            ))}
          </div>
        </div>

        {/* Chart 1: Monthly */}
        <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(120,180,255,0.45)', marginBottom: 8 }}>
          ✚ поступлення по місяцях · динаміка смертності
        </div>
        <div style={{ position: 'relative', width: '100%', height: 230, marginBottom: 20 }}>
          <canvas ref={c1} style={CV} />
        </div>

        {/* Charts 2 & 3 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(120,180,255,0.45)', marginBottom: 8 }}>⚕ навантаження лікарів · топ 8</div>
            <div style={{ position: 'relative', width: '100%', height: 230 }}>
              <canvas ref={c2} style={CV} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(120,180,255,0.45)', marginBottom: 8 }}>℞ топ діагнози мкх-10</div>
            <div style={{ position: 'relative', width: '100%', height: 230 }}>
              <canvas ref={c3} style={CV} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: 'rgba(120,180,255,0.25)', letterSpacing: '0.1em' }}>
          ЛСМД · Чернівці · реальні дані Supabase
        </div>
      </div>
    </>
  )
}
