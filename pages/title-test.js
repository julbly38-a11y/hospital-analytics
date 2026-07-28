import Head from 'next/head'

export default function TitleTest() {
  return (
    <>
      <Head>
        <title>Текстовий блок — ЛСМД</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#eeeae4',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ══ Текстове поле: x=285 y=59 w=315 h=139 ══ */}
        <div style={{
          position: 'absolute',
          left: 285,
          top: 59,
          width: 315,
          height: 139,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          outline: '1px dashed rgba(0,0,0,0.18)',
        }}>
          <div style={{
            fontFamily: "'ITF Devanagari', 'Noto Sans', 'Segoe UI', sans-serif",
            fontWeight: 300,
            fontSize: 32,
            color: '#4a4a4a',
            textAlign: 'left',
            lineHeight: 0.8,
          }}>
            ХОТИНСЬКА<br />БАГАТОПРОФІЛЬНА<br />ЛІКАРНЯ
          </div>
          <div style={{
            fontFamily: "'ITF Devanagari', 'Noto Sans', 'Segoe UI', sans-serif",
            fontWeight: 300,
            fontSize: 24,
            color: '#4a4a4a',
            textAlign: 'left',
            lineHeight: 0.8,
            marginTop: 10,
            textTransform: 'uppercase',
          }}>
            турбуємось про найцінніше
          </div>
        </div>

      </div>
    </>
  )
}
