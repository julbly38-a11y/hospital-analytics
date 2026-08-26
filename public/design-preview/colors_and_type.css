/* ============================================================
   ЛСМД — Colors & Type
   Editorial monochrome system. Warm paper background, near-black
   ink, IBM Plex Sans for prose, IBM Plex Mono for UI/labels.
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

:root {
  /* ---------- Surfaces (warm grayscale) ---------- */
  --bg:        #f5f4f0;   /* page background — warm off-white paper */
  --bg2:       #eeecea;   /* secondary surface — table headers, code blocks */
  --surface:   #ffffff;   /* elevated surface — sidebar, cards, inputs */
  --border:    #d8d5cf;   /* hairline divider, 1px */
  --border-2:  #c4c0b8;   /* slightly stronger border on hover */

  /* ---------- Ink ---------- */
  --text:      #1a1917;   /* primary text, also the accent — near-black */
  --text2:     #6b6760;   /* secondary text, captions */
  --text3:     #9c9890;   /* tertiary, placeholders, labels */
  --text-inv:  #f5f4f0;   /* text on dark fills */

  /* ---------- Brand accent ---------- */
  /* Medical red — used sparingly for primary CTAs, brand mark,
     active nav, links, and stat indicators. NOT for state/error. */
  --brand:        #c0392b;   /* medical cross red */
  --brand-hover:  #a93222;   /* darker on hover */
  --brand-soft:   #fbecea;   /* tinted bg for badges/chips */

  /* Ink-as-accent (kept for chat surface — it stays monochrome) */
  --accent:       #1a1917;
  --accent-bg:    #1a1917;
  --accent-text:  #f5f4f0;

  /* ---------- Semantic ---------- */
  --green:     #16a34a;   /* "free" / success / positive delta */
  --red:       #c0392b;   /* errors — same hex as brand by coincidence; semantically distinct */
  --amber:     #b45309;   /* warnings */

  /* ---------- Type families ---------- */
  --sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  /* ---------- Type scale ---------- */
  /* Display headings use Plex Mono with light weight (300) — the
     editorial signature. Body uses Plex Sans 400. UI labels and
     metadata use Plex Mono 400 with tracking. */
  --fs-display:  28px;    /* welcome H1 */
  --fs-h1:       22px;
  --fs-h2:       18px;
  --fs-body:     14px;
  --fs-small:    13px;
  --fs-meta:     12px;
  --fs-label:    11px;    /* uppercase mono labels */
  --fs-micro:    10px;

  --lh-tight:    1.3;
  --lh-normal:   1.5;
  --lh-loose:    1.8;     /* mono metadata blocks */

  --tracking-label: 0.08em;  /* uppercase mono labels */
  --tracking-cap:   0.05em;  /* table headers */

  /* ---------- Weights ---------- */
  --w-light:    300;       /* display headings, logo "+" */
  --w-regular:  400;
  --w-medium:   500;       /* logo wordmark, table headers, buttons */
  --w-semi:     600;       /* reserved, rarely used */

  /* ---------- Spacing (4-pt grid) ---------- */
  --s-1:  4px;
  --s-2:  8px;
  --s-3:  12px;
  --s-4:  16px;
  --s-5:  20px;
  --s-6:  24px;
  --s-8:  32px;
  --s-10: 40px;
  --s-12: 48px;

  /* ---------- Radii ---------- */
  /* Small radii everywhere. The signature is the bubble:
     asymmetric 4 / 18 corners on chat surfaces. */
  --r-1: 4px;     /* tight corners on tables, code, sql block */
  --r-2: 6px;     /* buttons, chips, example items */
  --r-3: 8px;     /* inputs, send button */
  --r-bubble-user:  18px 18px 4px 18px;   /* user bubble */
  --r-bubble-agent: 4px 18px 18px 18px;   /* agent bubble */

  /* ---------- Elevation ---------- */
  /* The system is FLAT. No drop shadows. Elevation = surface +
     hairline border. The only "shadow" is the chat bubble shape. */
  --shadow-none: none;
  --shadow-focus: 0 0 0 3px rgba(26, 25, 23, 0.08); /* keyboard focus ring */

  /* ---------- Motion ---------- */
  --ease:        cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast:    0.15s;
  --dur-normal:  0.25s;
}

/* ============================================================
   Semantic type — apply directly to elements
   ============================================================ */

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
  -webkit-font-smoothing: antialiased;
}

.h-display {
  font-family: var(--mono);
  font-weight: var(--w-light);
  font-size: var(--fs-display);
  line-height: var(--lh-tight);
  letter-spacing: -0.01em;
}

.h-1 {
  font-family: var(--mono);
  font-weight: var(--w-light);
  font-size: var(--fs-h1);
  line-height: var(--lh-tight);
}

.h-2 {
  font-family: var(--sans);
  font-weight: var(--w-medium);
  font-size: var(--fs-h2);
  line-height: var(--lh-tight);
}

.t-body {
  font-family: var(--sans);
  font-weight: var(--w-regular);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
  color: var(--text);
}

.t-secondary {
  color: var(--text2);
}

.t-tertiary {
  color: var(--text3);
}

.t-mono {
  font-family: var(--mono);
}

/* The signature label style — uppercase Plex Mono with tracking,
   used for sidebar section titles, table headers, metadata. */
.t-label {
  font-family: var(--mono);
  font-weight: var(--w-medium);
  font-size: var(--fs-label);
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  color: var(--text3);
}

.t-meta {
  font-family: var(--mono);
  font-size: var(--fs-meta);
  color: var(--text2);
  line-height: var(--lh-loose);
}

.t-micro {
  font-family: var(--mono);
  font-size: var(--fs-micro);
  color: var(--text3);
  line-height: var(--lh-loose);
}

.t-num-big {
  font-family: var(--mono);
  font-weight: var(--w-light);
  font-size: 48px;
  line-height: 1;
  color: var(--text);
}
