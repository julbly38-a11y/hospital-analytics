// Dashboard UI kit — marketing site + dashboard shell with red brand accent.
// Pages: Home, Analytics, Asystent (the AI chat), About, Pricing.
// Numbers and copy are pulled from the live Supabase schema: 110,206 cases,
// 67,856 unique patients, 868 employees, 20 departments, ~5+ years of data,
// 90% emergency (Екстренна), based in Чернівці.

const { useState, useEffect } = React;

const NAV = [
  { id: 'home', label: 'Головна' },
  { id: 'analytics', label: 'Аналітика' },
  { id: 'asystent', label: 'AI Асистент' },
  { id: 'pricing', label: 'Тарифи' },
  { id: 'about', label: 'Про нас' },
];

function TopNav({ page, setPage }) {
  return (
    <nav className="topnav">
      <a className="brand" onClick={() => setPage('home')} style={{cursor:'pointer'}}>
        <span className="mark">+</span>
        <span className="name">ЛСМД</span>
      </a>
      <div className="navlinks">
        {NAV.map(n => (
          <a key={n.id} className={`navlink${page===n.id?' active':''}`} onClick={() => setPage(n.id)}>{n.label}</a>
        ))}
      </div>
      <div className="navcta">
        <span className="btn-text">Увійти</span>
        <button className="btn-primary" onClick={() => setPage('analytics')}>Відкрити дашборд</button>
      </div>
    </nav>
  );
}

function HomePage({ setPage }) {
  return (
    <div data-page="home" className="visible">
      <section className="hero">
        <div className="eyebrow">Аналітика екстреної медицини</div>
        <h1>110&thinsp;206 госпіталізацій.<br/>Одна <em>лікарня швидкої допомоги</em>.<br/>Дані — за п'ять хвилин.</h1>
        <p className="lede">
          ЛСМД — платформа аналітики для лікарень швидкої медичної допомоги. Підключаємо вашу базу до Supabase, нормалізуємо МКХ-10, виводимо у дашборди по відділеннях, лікарях, діагнозах. AI-асистент відповідає на питання звичайною українською — без SQL.
        </p>
        <div className="cta-row">
          <button className="btn-primary" onClick={() => setPage('analytics')}>Спробувати на демо-даних</button>
          <button className="btn-secondary" onClick={() => setPage('about')}>Як працює</button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="num">110,206</div><div className="lbl">Госпіталізацій</div></div>
          <div className="hero-stat"><div className="num">67,856</div><div className="lbl">Унікальних пацієнтів</div></div>
          <div className="hero-stat"><div className="num">868</div><div className="lbl">Працівників</div></div>
          <div className="hero-stat"><div className="num">20</div><div className="lbl">Відділень</div></div>
        </div>
        <p style={{marginTop:'14px',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text3)',letterSpacing:'0.05em'}}>
          Дані з 2020-01-31 по 2026-05-01 · 22 розділи МКХ-10 · 220 блоків · 49,919 операційних кейсів
        </p>
      </section>

      <section className="section">
        <h2>Що вміє платформа</h2>
        <p className="desc">Три рівні роботи з медичними даними — від готових KPI до запитів природною мовою.</p>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="glyph">+</div>
            <h3>Дашборди по відділеннях</h3>
            <p>Реальні KPI: летальність 2.06%, виписки з поліпшенням 94.4%, середній ліжко-день 11.4. Розрізи по 20 відділеннях, 22 розділах МКХ, статі, віку, дню тижня.</p>
          </div>
          <div className="feature-card">
            <div className="glyph">→</div>
            <h3>AI Асистент</h3>
            <p>«Скільки пролікувала Ільніцька за грудень?» → SQL → відповідь. Підтримує Groq, Gemini, OpenAI, Anthropic — переключайтесь без вендор-локу. Без обмежень за частотою — на безкоштовних провайдерах.</p>
          </div>
          <div className="feature-card">
            <div className="glyph">Σ</div>
            <h3>Звіти та експорт</h3>
            <p>CSV, PDF, шаблони для МОЗ. Заплановані звіти на пошту головного лікаря. Матриці переходів між відділеннями. Геокарта пацієнтів по 2,618 населених пунктах.</p>
          </div>
        </div>
      </section>

      <footer className="foot">
        <span>© ЛСМД · 2026</span>
        <span>+ Лікарня Швидкої Медичної Допомоги · Чернівці</span>
      </footer>
    </div>
  );
}

function PricingPage() {
  return (
    <div data-page="pricing" className="visible">
      <section className="section">
        <div className="eyebrow">Тарифи</div>
        <h2>Прозоре ціноутворення</h2>
        <p className="desc">Без прихованих ліцензій на користувача. Безкоштовний старт для лікарень до 25 000 госпіталізацій на рік.</p>
        <div className="price-grid">
          <div className="price-card">
            <div className="tier">Старт</div>
            <div className="price"><span className="num">0</span><span className="per">грн / місяць</span></div>
            <ul>
              <li>До 25,000 госпіталізацій/рік</li>
              <li>Базові дашборди</li>
              <li>AI Асистент: 100 запитів/міс</li>
              <li>Експорт CSV</li>
              <li>Інтеграція з Supabase</li>
            </ul>
            <button className="btn-secondary pcta">Почати</button>
          </div>
          <div className="price-card featured">
            <div className="tier">Клініка</div>
            <div className="price"><span className="num">14,900</span><span className="per">грн / місяць</span></div>
            <ul>
              <li>Без обмежень госпіталізацій</li>
              <li>Усі дашборди + кастомні</li>
              <li>AI Асистент: безлімітно (Groq)</li>
              <li>Заплановані звіти на пошту</li>
              <li>Шаблони МОЗ України</li>
              <li>Геокарта пацієнтів</li>
              <li>Матриця переходів між відділеннями</li>
            </ul>
            <button className="btn-primary pcta">Замовити демо</button>
          </div>
          <div className="price-card">
            <div className="tier">Мережа</div>
            <div className="price"><span className="num">за домовленістю</span></div>
            <ul>
              <li>Декілька установ</li>
              <li>SSO + ролі (головлікар / зав. відділенням)</li>
              <li>Власний сервер / on-premise</li>
              <li>SLA 99.9%</li>
              <li>Окремий AI-канал (Anthropic / приватний)</li>
            </ul>
            <button className="btn-secondary pcta">Зв'язатися</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AboutPage() {
  return (
    <div data-page="about" className="visible">
      <section className="section">
        <div className="eyebrow">Про компанію</div>
        <h2>ЛСМД</h2>
        <div className="about-grid">
          <div>
            <p>ЛСМД — інформаційна компанія, що працює з медичними даними. Будуємо платформу аналітики для лікарень швидкої медичної допомоги: підключаємо їхні бази, нормалізуємо МКХ-10, виводимо у дашборди по відділеннях і лікарях, додаємо AI-асистента, який відповідає звичайною українською мовою.</p>
            <p>Працюємо з реальною лікарнею у Чернівцях — 110,206 госпіталізацій за п'ять років, 67,856 унікальних пацієнтів з 2,618 населених пунктів (переважно Чернівецька область — 88%), 20 відділень, 868 працівників, 49,919 операційних кейсів.</p>
            <p>База даних — на Supabase, код — на GitHub, AI — мульти-провайдер: Groq, Gemini, OpenAI, Anthropic. Без вендор-локу. Без емоджі. Без зайвого.</p>
          </div>
          <div className="about-side">
            <dl>
              <dt>Заснована</dt><dd>2025</dd>
              <dt>Локація партнера</dt><dd>Чернівці, Україна</dd>
              <dt>Дані</dt><dd>2020-01-31 → сьогодні</dd>
              <dt>Стек</dt><dd>PostgreSQL · Supabase · Next.js · Netlify</dd>
              <dt>МКХ-10</dt><dd>22 розділи · 220 блоків</dd>
              <dt>Контакт</dt><dd>info@lsmd.health</dd>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

window.TopNav = TopNav;
window.HomePage = HomePage;
window.PricingPage = PricingPage;
window.AboutPage = AboutPage;
window.NAV = NAV;
