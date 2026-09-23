/* Форма логіну "Для працівників" — toggle вже в utils.js (initStaffFields).
   Тут — сама відправка на /api/slide-login. Стан "залогінено" (чергові
   лікарі замість форми) — окремий шар, ще не підключено. */

function initStaffLogin(redirectTo) {
  const loginEl  = document.querySelector('.f-login');
  const passEl   = document.querySelector('.f-pass');
  const btnEl    = document.querySelector('.f-btn');
  const forgotEl = document.querySelector('.f-forgot');
  const errEl    = document.querySelector('.f-error');
  if (!btnEl) return;

  let busy = false;
  const flash = (msg) => { if (errEl) errEl.textContent = msg || ''; };

  async function doLogin() {
    if (busy) return;
    const email = (loginEl?.value || '').trim();
    const password = passEl?.value || '';
    if (!email || !password) { flash('Введіть логін і пароль'); return; }
    busy = true; flash(''); btnEl.textContent = 'Вхід…';
    try {
      const r = await fetch('/api/slide-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) { window.location.href = redirectTo || '/entry.html'; return; }
      const d = await r.json().catch(() => ({}));
      flash(d.error || 'Невірний логін або пароль');
    } catch {
      flash('Помилка зʼєднання');
    }
    busy = false; btnEl.textContent = 'Увійти';
  }

  // "Забув пароль?" — якщо email уже вписаний у поле LOGIN, шле лист
  // одразу звідси (без переходу на /login: не змушувати вводити той самий
  // email вдруге). Порожнє поле — нема що слати, тоді ведемо на /login?mode=reset,
  // де можна ввести email з нуля.
  async function doForgot() {
    if (busy) return;
    const email = (loginEl?.value || '').trim();
    if (!email) { window.location.href = '/login?mode=reset'; return; }
    busy = true; flash('Надсилаємо…');
    try {
      const r = await fetch('/api/slide-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      flash(r.ok ? `Лист надіслано на ${email}` : (d.error || 'Не вдалося надіслати лист'));
    } catch {
      flash('Помилка зʼєднання');
    }
    busy = false;
  }

  btnEl.addEventListener('click', (e) => { e.stopPropagation(); doLogin(); });
  [loginEl, passEl].forEach(el => el && el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  }));
  if (forgotEl) forgotEl.addEventListener('click', (e) => { e.stopPropagation(); doForgot(); });
}
