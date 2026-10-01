// Пошук для власника сайту (сторінка admin-search.html). Усі значення з бази виводяться через textContent: жодного innerHTML з даними.
// Доступ перевіряє сервер (/api/admin-search: лише is_owner, вимкнено в режимі приватності ПІБ); перевірка /api/me тут лише для зручності.
(function () {
  const $ = (id) => document.getElementById(id);
  const input = $('q'), status = $('status'), out = $('out'), hint = $('hint');
  let timer = null, ctrl = null, seq = 0, allowed = false;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const setStatus = (msg, err) => { status.textContent = msg || ''; status.className = 'status' + (err ? ' err' : ''); };
  const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');

  function row(label, value, href) {
    if (!value) return null;
    const r = el('div', 'row'); r.appendChild(el('b', null, label));
    if (href) { const a = el('a', null, value); a.href = href; r.appendChild(a); } else r.appendChild(document.createTextNode(value));
    return r;
  }

  function patientCard(p) {
    const c = el('div', 'card');
    const n = el('div', 'name', p.full_name || '—'); if (p.org) n.appendChild(el('span', 'org', p.org)); c.appendChild(n);
    const meta = [p.gender, p.age != null ? p.age + ' р.' : null, p.birthday ? 'нар. ' + fmtDate(p.birthday) : null].filter(Boolean).join(' · ');
    if (meta) c.appendChild(el('div', 'meta', meta));
    [row('Телефон', p.phone, p.phone ? 'tel:' + String(p.phone).replace(/[^\d+]/g, '') : null), row('Email', p.email, p.email ? 'mailto:' + p.email : null), row('Адреса', p.address)]
      .forEach(r => r && c.appendChild(r));
    if (p.hospitalizations_total) {
      const h = el('div', 'hosp');
      h.appendChild(el('div', 'meta', 'Госпіталізацій: ' + p.hospitalizations_total + (p.hospitalizations_total > (p.hospitalizations || []).length ? ' (останні ' + p.hospitalizations.length + ')' : '')));
      (p.hospitalizations || []).forEach(x => {
        const when = fmtDate(x.admission_date) + (x.discharge_date ? ' – ' + fmtDate(x.discharge_date) : ' – триває');
        h.appendChild(el('div', null, [when, x.department, x.icd, x.doctor, x.id_case ? '№ ' + x.id_case : null].filter(Boolean).join(' · ')));
      });
      c.appendChild(h);
    }
    return c;
  }

  function staffCard(s) {
    const c = el('div', 'card');
    const n = el('div', 'name', s.full_name || '—'); if (s.org) n.appendChild(el('span', 'org', s.org)); c.appendChild(n);
    const meta = [s.position, s.speciality, s.department].filter(Boolean).join(' · ');
    if (meta) c.appendChild(el('div', 'meta', meta));
    [row('Телефон', s.phone, s.phone ? 'tel:' + String(s.phone).replace(/[^\d+]/g, '') : null), row('Email', s.email, s.email ? 'mailto:' + s.email : null)]
      .forEach(r => r && c.appendChild(r));
    return c;
  }

  function render(d) {
    out.textContent = '';
    const pats = d.patients || [], emps = d.employees || [];
    if (!pats.length && !emps.length) { setStatus('Нічого не знайдено'); return; }
    setStatus('Знайдено: пацієнтів ' + pats.length + (d.patients_more ? '+' : '') + ', співробітників ' + emps.length + (d.employees_more ? '+' : ''));
    if (pats.length) {
      out.appendChild(el('h2', null, 'Пацієнти'));
      pats.forEach(p => out.appendChild(patientCard(p)));
      if (d.patients_more) out.appendChild(el('div', 'more', 'Показано перші ' + pats.length + ': уточніть запит (додайте імʼя чи більше цифр).'));
    }
    if (emps.length) {
      out.appendChild(el('h2', null, 'Співробітники'));
      emps.forEach(s => out.appendChild(staffCard(s)));
      if (d.employees_more) out.appendChild(el('div', 'more', 'Показано перші ' + emps.length + ': уточніть запит.'));
    }
  }

  async function search() {
    const q = input.value.trim();
    if (!allowed) return;
    if (ctrl) ctrl.abort();
    if (!q) { out.textContent = ''; setStatus(''); hint.style.display = ''; return; }
    hint.style.display = 'none';
    const my = ++seq; ctrl = new AbortController();
    setStatus('Шукаю…');
    try {
      const r = await fetch('/api/admin-search?q=' + encodeURIComponent(q), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      const d = await r.json().catch(() => ({}));
      if (my !== seq) return;
      if (r.status === 401) { out.textContent = ''; setStatus('Потрібен вхід: відкрийте сайт і увійдіть.', true); return; }
      if (r.status === 403) { out.textContent = ''; setStatus('Пошук доступний лише власнику сайту.', true); return; }
      if (r.status === 409) { out.textContent = ''; setStatus(d.error || 'Пошук вимкнений у режимі приватності ПІБ.', true); return; }
      if (r.status === 400) { out.textContent = ''; setStatus(d.error || 'Некоректний запит', false); return; }
      if (!r.ok) { setStatus('Помилка пошуку: ' + (d.error || r.status), true); return; }
      render(d);
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('Помилка зʼєднання', true);
    }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; search(); } });

  // Зручність: якщо це явно не власник, не даємо шукати (сервер і так відмовить).
  fetch('/api/me').then(r => r.json()).then(me => {
    if (!me || !me.role) { setStatus('Потрібен вхід: відкрийте сайт і увійдіть.', true); input.disabled = true; return; }
    if (!me.is_owner) { setStatus('Пошук доступний лише власнику сайту.', true); input.disabled = true; return; }
    allowed = true; input.focus(); if (input.value.trim()) search();
  }).catch(() => { allowed = true; });
})();
