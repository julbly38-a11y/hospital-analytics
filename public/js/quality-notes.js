/* Нотатки контролю записів — спільні для public/quality.html і кабінетів у
   фінансовому режимі (head-cabinet.html, doctor-cabinet.html): типи
   зауважень із правилами, первинна/вторинна підказки над епізодом, картка
   епізоду. Первинна підказка — що не так і яке правило, вторинна — деталі з
   даних самого епізоду (hints з /api/lpz-case-quality). */

const Q_FLAGS = {
  discharge_not_registered: {
    title: 'Виписку не передано в ЕСОЗ', short: 'виписку не передано', high: true,
    rule: 'Дані про пролікований випадок мають бути внесені до ЕСОЗ не пізніше 10-го робочого дня після звітного періоду — незареєстрований випадок до оплати не потрапляє.',
    why: 'Випадок без зареєстрованої в медичній карті виписки може не потрапити до звіту на оплату НСЗУ.',
    check: 'Виписки немає, вона в чернетці, очікує реєстрації, скасована або не передана в медичну карту пацієнта.',
  },
  no_primary: {
    title: 'Немає основного діагнозу', short: 'без основного діагнозу', high: true,
    rule: 'Група оплати визначається за основним діагнозом — без нього випадок неможливо віднести до групи.',
    why: 'Без основного діагнозу випадок неможливо віднести до групи оплати.',
    check: 'Внести або позначити основний діагноз.',
  },
  overlap: {
    title: 'Накладка з іншою госпіталізацією', short: 'накладка', high: true,
    rule: 'Один випадок лікування не розділяється на кілька — за дроблення випадків НСЗУ перераховує оплату.',
    why: 'Той самий пацієнт одночасно в двох епізодах: один із них може бути не оплачений, а дроблення — привід для перерахунку.',
    check: 'Чи це перевід між відділеннями в межах одного випадку.',
  },
  no_doctor: {
    title: 'Не вказано лікаря', short: 'без лікаря', high: true,
    rule: 'Епізод веде й підписує відповідальний лікар — без нього запис неможливо коректно оформити.',
    why: 'У епізоді немає ні лікуючого лікаря, ні підпису лікаря у виписці — відповідальність за запис ні на кому.',
    check: 'Вказати лікуючого лікаря й перевірити, ким підписано виписку.',
    warn: 'У відкритому епізоді не вказано лікуючого лікаря. Зауваження до запису нема кому адресувати.',
  },
  injury_no_external_cause: {
    title: 'Травма без зовнішньої причини', short: 'травма без причини', high: true,
    rule: 'Для травм (коди S/T) разом із кодом ушкодження кодується зовнішня причина (V01–Y98).',
    why: 'Без коду зовнішньої причини запис травми неповний і може бути відхилений або перекваліфікований.',
    check: 'Додати код обставин травми та місця події.',
  },
  symptom_primary: {
    title: 'Симптом як основний діагноз', short: 'симптом як основний', high: true,
    rule: 'Симптом (R) кодується як основний діагноз лише тоді, коли причину стану не встановлено.',
    why: 'Код симптому замість встановленої хвороби зазвичай потрапляє в групу з нижчою вагою оплати.',
    check: 'Чи встановлено причину стану.',
    warn: 'Попередній діагноз-симптом у перші дні — норма. Якщо до виписки його не замінити на встановлений, випадок піде в групу з нижчою оплатою.',
  },
  death_single_diagnosis: {
    title: 'Летальний випадок з одним діагнозом', short: 'летальний, 1 діагноз', high: true,
    rule: 'НСЗУ вимагає кодувати всі наявні діагнози (НК 025:2021), включно з ускладненнями та причиною смерті.',
    why: 'Для летального випадку єдиний діагноз майже завжди означає неповне кодування і привертає увагу під час перевірки.',
    check: 'Внести ускладнення, безпосередню причину смерті та супутні стани.',
  },
  no_interventions: {
    title: 'Жодного втручання в записі', short: 'без втручань', high: false,
    rule: 'НСЗУ вимагає відображати всі проведені втручання кодами НК 026:2021.',
    why: 'Група оплати залежить від втручань. Якщо введення ліків, обстеження чи операції не внесено, випадок оплачується як простіший.',
    check: 'Внести проведені втручання кодами НК 026:2021.',
    warn: 'Пацієнт у відділенні понад дві доби, а закодованих втручань у записі немає. Краще вносити в міру виконання, а не згадувати під час виписки.',
  },
  single_diagnosis: {
    title: 'Лише один діагноз', short: 'один діагноз', high: false,
    rule: 'НСЗУ вимагає кодувати всі наявні діагнози, у тому числі супутні (НК 025:2021).',
    why: 'Супутні діагнози й ускладнення визначають складність випадку. Без них складний пацієнт оплачується як простий.',
    check: 'Внести супутні стани й ускладнення, якщо вони є.',
    warn: 'Поки що в записі лише один діагноз. Супутні стани краще вносити в міру встановлення.',
  },
  open_too_long: {
    title: 'Відкритий понад 30 діб', short: 'відкритий > 30 діб', high: false,
    rule: 'До оплати подається закритий випадок з оформленою випискою.',
    why: 'Надто довго відкритий епізод часто означає незакриту в системі виписку — оплата затримується.',
    check: 'Чи пацієнт ще у відділенні.',
    warn: 'Епізод відкритий понад 30 діб. Якщо пацієнта вже виписано, а епізод не закрито, оплата не надійде.',
  },
};
const Q_FLAG_ORDER = Object.keys(Q_FLAGS);

const qEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function qFmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function qIssues(r) {
  return [...(r.flags || []).map(code => ({ code, kind: 'error' })), ...(r.warnings || []).map(code => ({ code, kind: 'warning' }))]
    .filter(i => Q_FLAGS[i.code]);
}
function qHas(r, code) { return (r.flags || []).includes(code) || (r.warnings || []).includes(code); }
function qHasIssues(r) { return qIssues(r).length > 0; }

function qDaysBetween(today, deadline) {
  if (!deadline || !today) return null;
  return Math.round((new Date(deadline + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
}

function qCaseStateHtml(r, today) {
  if (r.segment === 'open') return `<span class="q-state-open">у відділенні</span> · ${Number(r.los_days).toFixed(1)} доби`;
  const discharged = `виписано ${qFmtDate(r.discharge_at)}`;
  if (r.segment === 'fixable') {
    const left = qDaysBetween(today, r.fix_deadline);
    const when = left === 0 ? 'сьогодні' : left === 1 ? 'завтра' : `${left} дн.`;
    return `${discharged} · <span class="${left <= 3 ? 'q-deadline-urgent' : 'q-deadline'}">виправити до ${qFmtDate(r.fix_deadline)} (${when})</span>`;
  }
  return `${discharged} · <span class="q-deadline-lost">строк минув ${qFmtDate(r.fix_deadline)}</span>`;
}

// Розділ епізоду в helsi, де виправляється зауваження (перевірено на живих
// епізодах ЛШМД 14.09.2026): "Головна" — блоки діагнозів, наданих послуг,
// процедур і лікуючий лікар; "Хронологія" з фільтром виписки; "Розміщення" —
// переміщення між відділеннями. Глибше за розділ адреса helsi не веде.
const Q_HELSI_SECTION = {
  discharge_not_registered: 'tabName=CHRONOLOGY&type=discharge',
  overlap: 'tabName=LIST_TRANSFERS',
};
const Q_HELSI_WINDOW = 'helsi';

// target=Q_HELSI_WINDOW — усі посилання відкриваються в одній вкладці helsi:
// перший клік створює її, наступні перезавантажують ту саму.
function qHelsiUrl(r, code) {
  return `https://helsi.pro/hospital/cases/${encodeURIComponent(r.helsi_case_id)}?${Q_HELSI_SECTION[code] || 'tabName=MAIN'}`;
}

function qNoteHtml(r) {
  const to = r.addressee === 'doctor'
    ? `<span class="q-note-to">Лікарю: ${qEsc(r.doctor_name || '—')}</span>`
    : `<span class="q-note-to q-note-to-head">Завідувачу відділення · лікаря не визначено</span>`;
  const items = qIssues(r).map(i => {
    const f = Q_FLAGS[i.code];
    const warn = i.kind === 'warning';
    const secondary = (r.hints && r.hints[i.code]) || f.check;
    return `
      <div class="q-note-issue${warn ? ' q-note-warn' : ''}">
        <div class="q-note-line"><span class="q-note-tag">первинна</span><span><b>${f.title}${warn ? ' · попередження' : ''}.</b> ${warn && f.warn ? f.warn : f.rule} <a class="q-fix-link" href="${qHelsiUrl(r, i.code)}" target="${Q_HELSI_WINDOW}">виправити в helsi ↗</a></span></div>
        <div class="q-note-line"><span class="q-note-tag q-note-tag-sec">вторинна</span><span>${qEsc(secondary)}</span></div>
      </div>`;
  }).join('');
  return `<div class="q-note">${to}${items}</div>`;
}

// Гроші епізоду (лише коли сервер віддав est_price/est_risk — адмін і
// головний лікар): скільки коштує правильно оформлений випадок, скільки
// орієнтовно заплатять із помилками і різниця.
const qGrn = v => `${fmt(Math.round(v))} грн`;
function qMoneyHtml(r) {
  if (r.est_price == null) return '';
  return `<div class="q-case-line2 q-money">правильний випадок ≈ ${qGrn(r.est_price)} · з помилками ≈ ${qGrn(r.est_price - r.est_risk)} · втрата ≈ ${qGrn(r.est_risk)}</div>`;
}

function qEpisodeHtml(r, today) {
  return `
    <div class="q-episode">
      ${qNoteHtml(r)}
      <div class="q-case">
        <div class="q-case-main">
          <div class="q-case-line1">
            <span class="q-case-num">№ ${qEsc(r.card_number)}</span>
            <span class="q-case-dx">${qEsc(r.primary_icd || '—')} ${qEsc(r.primary_name || '')}</span>
          </div>
          <div class="q-case-line2">${qEsc(r.department_name || '—')} · ${qCaseStateHtml(r, today)} · діагнозів: ${r.dx_codes.length} · втручань: ${r.procedures_count}</div>
          ${qMoneyHtml(r)}
        </div>
        <div class="q-case-side">
          <a class="q-open-link" href="${qHelsiUrl(r, null)}" target="${Q_HELSI_WINDOW}">відкрити в helsi ↗</a>
        </div>
      </div>
    </div>`;
}

// ── Кабінети у фінансовому режимі: праве нижнє поле (на місці "Перебуває у
// відділенні") — епізоди з зауваженнями за обраний у пігулках період. ──

function renderFinanceCasesSection(root) {
  const parent = root.querySelector('.lf-right-bottom') || root;
  parent.insertAdjacentHTML('beforeend', `
    <div class="census-title q-cases-title" id="finCasesTitle"></div>
    <div class="census-list" id="finCases"><div class="census-empty" style="position:static">Завантаження…</div></div>
  `);
  const list = parent.querySelector('#finCases');
  enableDragScroll(list, 'y');
  list.addEventListener('scroll', () => updateFadeMask(list, 'y'));
}

const qKyivDate = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(iso));

// Закриті — за датою виписки в обраному році/місяці/дні; відкриті — лише коли
// період містить сьогоднішній день (так само рахує /api/lpz-quality-finance).
function qInPeriod(r, today, year, month, day) {
  const date = r.is_open ? today : (r.discharge_at ? qKyivDate(r.discharge_at) : null);
  if (!date) return false;
  if (year !== 'all' && date.slice(0, 4) !== String(year)) return false;
  if (year !== 'all' && month !== 'all' && Number(date.slice(5, 7)) !== Number(month)) return false;
  if (year !== 'all' && month !== 'all' && day != null && Number(date.slice(8, 10)) !== Number(day)) return false;
  return true;
}

// Спершу те, що ще можна виправити (найближчі строки), далі пацієнти у
// відділенні, в кінці — вже втрачені (найсвіжіші зверху).
const Q_CABINET_ORDER = { fixable: 0, open: 1, lost: 2 };

// Короткий рядок (кабінет завідувача): ПІБ пацієнта, ПІБ лікаря, кількість
// зауважень. Без ПІБ пацієнта (канон ще не оновлено) — номер картки.
function qCompactRowHtml(r) {
  const n = (r.flags || []).length + (r.warnings || []).length;
  const patient = r.patient_name ? qEsc(r.patient_name) : `картка № ${qEsc(r.card_number || '—')}`;
  const doctor = r.doctor_full_name || r.doctor_name;
  return `
    <div class="census-row q-compact-row">
      <div class="census-info">
        <span class="census-name">${patient}</span>
        <span class="census-meta">${doctor ? `Лікар: ${qEsc(doctor)}` : 'Лікаря не визначено — завідувачу'}</span>
      </div>
      <span class="q-compact-count${(r.flags || []).length ? ' q-compact-error' : ''}">⚠ ${n}</span>
    </div>`;
}

function renderFinanceCases({ data, year, month, day = null, doctorId = null, doctorName = '', onResetDoctor, compact = false }) {
  const title = document.getElementById('finCasesTitle');
  const list = document.getElementById('finCases');
  if (!title || !list || !data) return;
  const today = data.today;
  const rows = (data.rows || [])
    .filter(r => qHasIssues(r) && qInPeriod(r, today, year, month, day) && (!doctorId || r.doctor_resource_id === doctorId))
    .sort((a, b) => (Q_CABINET_ORDER[a.segment] - Q_CABINET_ORDER[b.segment])
      || (a.segment === 'fixable' ? (a.fix_deadline || '').localeCompare(b.fix_deadline || '') : 0)
      || (b.discharge_at || '').localeCompare(a.discharge_at || ''));
  const period = year === 'all' ? 'усі роки'
    : [year, month !== 'all' && MONTH_PILL_NAMES[Number(month) - 1], day != null && day].filter(Boolean).join(' · ');
  title.innerHTML = `Зауваження до записів · ${rows.length} · ${qEsc(period)}`
    + (doctorId ? ` · ${qEsc(doctorName)}<span class="q-reset" id="finCasesReset">✕ усі лікарі</span>` : '');
  const reset = document.getElementById('finCasesReset');
  if (reset && onResetDoctor) reset.addEventListener('click', onResetDoctor);
  list.innerHTML = rows.map(r => compact ? qCompactRowHtml(r) : qEpisodeHtml(r, today)).join('')
    || '<div class="census-empty" style="position:static">За цей період зауважень немає</div>';
  list.scrollTop = 0;
  const fieldMe = document.querySelector('.field-me');
  if (fieldMe) fitHeightTo(list, offsetInSlide(fieldMe), 20);
  updateFadeMask(list, 'y');
}
