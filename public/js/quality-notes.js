/* Нотатки контролю записів — спільні для public/quality.html і кабінетів у
   фінансовому режимі (head-cabinet.html, doctor-cabinet.html): типи
   зауважень із правилами, первинна/вторинна підказки над епізодом, картка
   епізоду. Первинна підказка — що не так і яке правило, вторинна — деталі з
   даних самого епізоду (hints з /api/lpz-case-quality). */

const Q_FLAGS = {
  nszu_refused: {
    title: 'НСЗУ відмовляє в розрахунку оплати', short: 'відмова НСЗУ', high: true,
    rule: 'Перевірка пакета НСЗУ (package-validation, та сама, що працює у формі виписки helsi) повертає помилку — випадок не отримає групи ДСГ і ціни, доки запис не виправлено.',
    why: 'Це не наша евристика, а пряма відмова розрахунку НСЗУ: за такого запису випадок не проходить перевірку пакета. Якщо виписку ще не зареєстровано — оплата не нараховується; якщо вже зареєстровано — чи вплине це на оплату фактично, не підтверджено.',
    check: 'Прочитати текст відмови у вторинній підказці й виправити зазначене поле у виписці в helsi.',
  },
  discharge_not_registered: {
    title: 'Виписку не передано в ЕСОЗ', short: 'виписку не передано', high: true,
    rule: 'Дані про пролікований випадок мають бути внесені до ЕСОЗ не пізніше 10-го робочого дня після звітного періоду — незареєстрований випадок до оплати не потрапляє.',
    why: 'Випадок без зареєстрованої в медичній карті виписки може не потрапити до звіту на оплату НСЗУ.',
    check: 'Виписки немає, вона в чернетці, очікує реєстрації, скасована або не передана в медичну карту пацієнта.',
  },
  no_disposition: {
    title: 'Не вказано результат лікування', short: 'без результату лікування', high: true,
    rule: 'Виписка має містити результат лікування (одужання, поліпшення, летальний тощо) — перевірка пакета НСЗУ не приймає порожнє поле.',
    why: 'Без результату лікування НСЗУ відмовляє в розрахунку — випадок не отримає групи ДСГ і ціни.',
    check: 'Вказати результат лікування у виписці.',
  },
  referral_basis: {
    title: 'Підстава звернення не відповідає пакету', short: 'підстава звернення', high: true,
    rule: 'Для онкогематологічних діагнозів (C81–C96, D45–D47) пакет НСЗУ приймає лише підставу «За направленням електронним» / «За направленням паперовим» (з місць обмеження волі) / «Переведення з іншого ЗОЗ» (з направленням) / «Переведення з іншого відділення».',
    why: 'Із самозверненням НСЗУ відмовляє в розрахунку: у ЛШМД така відмова у 88–100% епізодів цих діагнозів, а ціна відмовлених випадків (~80 тис. грн і більше) не розраховується.',
    check: 'Вказати правильну підставу звернення й додати електронне направлення (для планових курсів воно має бути виписано ще на амбулаторному етапі).',
    warn: 'Поки епізод відкритий, підставу звернення ще можна виправити — із самозверненням НСЗУ відмовить у розрахунку виписки.',
  },
  stroke_no_g: {
    title: 'Інсульт без діагнозу групи G', short: 'інсульт без діагнозу G', high: false,
    rule: 'Пакет НСЗУ «Медична допомога при гострому мозковому інсульті» рекомендує вносити додатковий діагноз групи G, що вказує на неврологічні прояви або наслідки інсульту.',
    why: 'Це рекомендація, а не блокуюча помилка: ціна інсульту фіксована (15 643 / 62 565 / 131 472 грн за напрямом) і від діагнозу не залежить, розрахунок проходить.',
    check: 'Вказати додатковий діагноз групи G (наприклад, гемпарез, афазія, інші неврологічні прояви), якщо вони є.',
    warn: 'Пакет рекомендує додатковий діагноз групи G (неврологічні прояви інсульту). Краще внести до виписки; ціну це не змінює.',
  },
  stroke_no_additional: {
    title: 'Інсульт без додаткових діагнозів', short: 'інсульт без додаткових діагнозів', high: false,
    rule: 'За умовами пакета випадок без додаткових діагнозів щодо перебігу захворювання (стандарт 0604) підлягатиме подальшому медичному моніторингу з боку НСЗУ; також рекомендовано діагноз групи G.',
    why: 'Оплату це не блокує й ціни не міняє, але підвищує ризик перевірки випадку (медичного моніторингу) з боку НСЗУ.',
    check: 'Внести супутні стани й ускладнення та неврологічні прояви (група G), якщо вони є.',
    warn: 'У записі немає додаткових діагнозів. Випадок підлягатиме медичному моніторингу НСЗУ; краще внести їх до виписки.',
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
  if (r.segment === 'warned') return `${discharged} · <span class="q-deadline">лише попередження — оплату не блокують</span>`;
  return `${discharged} · <span class="q-deadline-lost">строк минув ${qFmtDate(r.fix_deadline)}</span>`;
}

// Розділ епізоду в helsi, де виправляється зауваження (перевірено на живих
// епізодах ЛШМД 14.09.2026): "Головна" — блоки діагнозів, наданих послуг,
// процедур і лікуючий лікар; "Хронологія" з фільтром виписки; "Розміщення" —
// переміщення між відділеннями. Глибше за розділ адреса helsi не веде.
const Q_HELSI_SECTION = {
  nszu_refused: 'tabName=CHRONOLOGY&type=discharge',
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
  const basis = r.nszu_priced
    ? '<span class="q-price-tag q-price-exact">розрахунок НСЗУ</span>'
    : '<span class="q-price-tag q-price-est">орієнтовно</span>';
  return `<div class="q-case-line2 q-money">${basis} правильний випадок ≈ ${qGrn(r.est_price)} · з помилками ≈ ${qGrn(r.est_price - r.est_risk)} · втрата ≈ ${qGrn(r.est_risk)}</div>`;
}

const Q_DISCHARGE_STATUS = {
  registered: 'зареєстровано в ЕСОЗ',
  pending_registration: 'очікує реєстрації в ЕСОЗ',
  draft_created: 'чернетка',
  cancelled: 'скасовано',
};

function qFmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${qFmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Людські назви полів журналу змін (r.activity.events) — ключі з
// pages/api/local-quality-ingest.js:fieldsOf.
const Q_ACTIVITY_FIELDS = {
  primary: 'основний діагноз',
  dx_codes: 'діагнози',
  procs_count: 'втручань',
  operations_count: 'операцій',
  doctor: 'лікуючий лікар',
  disposition: 'результат лікування',
  discharge_status: 'статус виписки в ЕСОЗ',
  is_open: 'стан епізоду',
  flags: 'помилки',
  warnings: 'попередження',
};
// Значення поля «було/стало» у читабельний рядок: стан → відкритий/закритий,
// статус виписки — з довідника, помилки/попередження — назвами Q_FLAGS,
// списки — через кому. Дані користувача екрануємо (qEsc), назви з констант — ні.
// Результат лікування (discharge_disposition.code helsi) → назва; коди 1–9 з
// довідника (README, «Довідково»).
const Q_DISPOSITION = {
  death: 'помер', discharge_better: 'з поліпшенням', discharge_healthy: 'здоровий',
  discharge_no_change: 'без змін', discharge_recovery: 'з одужанням', discharge_worse: 'з погіршенням',
  left_by_patient: 'самовільно пішов', statistic_discharge: 'статистична виписка', transfer_general: 'переведено в інший ЗОЗ',
};
function qActivityVal(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'is_open') return v ? 'відкритий' : 'закритий';
  if (field === 'disposition') return Q_DISPOSITION[v] || qEsc(String(v));
  if (field === 'discharge_status') return Q_DISCHARGE_STATUS[v] || qEsc(String(v));
  if (Array.isArray(v)) {
    if (!v.length) return 'немає';
    if (field === 'flags' || field === 'warnings') return v.map(c => (Q_FLAGS[c] && Q_FLAGS[c].title) || qEsc(c)).join(', ');
    return qEsc(v.join(', '));
  }
  return qEsc(String(v));
}
// Журнал активності епізоду з r.activity (pages/api/lpz-case-quality.js):
// коли востаннє змінювався запис, перелік змін значущих полів (наповнюється
// з 2-го прогону) і виправлені зауваження з датами. Порожній — нічого не
// показуємо.
function qActivityHtml(r) {
  const a = r.activity;
  if (!a) return '';
  const rows = [];
  if (a.last_change_at) rows.push(`<div class="q-detail-row"><span class="q-detail-k">останні зміни</span><span>${qFmtDateTime(a.last_change_at)}</span></div>`);
  (a.events || []).slice().reverse().forEach(ev => {
    const changes = (ev.changes || []).map(c =>
      `${Q_ACTIVITY_FIELDS[c.field] || qEsc(c.field)}: ${qActivityVal(c.field, c.from)} → ${qActivityVal(c.field, c.to)}`
    ).join('; ');
    // after_close — зміна внесена вже після закриття епізоду (виправлення після виписки).
    const tag = ev.after_close ? ` <span class="q-detail-kind">після закриття</span>` : '';
    if (changes) rows.push(`<div class="q-detail-row"><span class="q-detail-k">${qFmtDateTime(ev.at)}</span><span>${changes}${tag}</span></div>`);
  });
  (a.fixed || []).forEach(fx => {
    const title = (Q_FLAGS[fx.code] && Q_FLAGS[fx.code].title) || qEsc(fx.code);
    // on_time — лише для закритих: виправлено не пізніше строку подачі змін до НСЗУ.
    const timing = fx.on_time === true ? ` <span class="q-deadline">· до строку (${qFmtDate(fx.deadline)})</span>`
      : fx.on_time === false ? ` <span class="q-deadline-urgent">· після строку (${qFmtDate(fx.deadline)})</span>` : '';
    rows.push(`<div class="q-detail-row"><span class="q-detail-k">виправлено ${qFmtDate(fx.fixed_at)}</span><span>${title}${timing}</span></div>`);
  });
  if (!rows.length) return '';
  return `
    <div class="q-detail-issue">
      <div class="q-detail-issue-title">Активність <span class="q-detail-kind">журнал</span></div>
      ${rows.join('')}
    </div>`;
}

// Розгортка епізоду по кліку: по кожному зауваженню — чому це важливо й що
// перевірити (у нотатці над епізодом лише правило й деталі з даних), далі всі
// факти запису, з яких зроблено висновок, журнал активності і — для головного
// лікаря — розбір суми.
function qDetailHtml(r) {
  const issues = qIssues(r).map(i => {
    const f = Q_FLAGS[i.code];
    const warn = i.kind === 'warning';
    return `
      <div class="q-detail-issue">
        <div class="q-detail-issue-title">${f.title} <span class="q-detail-kind${warn ? ' q-detail-kind-warn' : ''}">${warn ? 'попередження' : 'помилка'}</span></div>
        <div class="q-detail-row"><span class="q-detail-k">чому це важливо</span><span>${warn && f.warn ? f.warn : f.why}</span></div>
        <div class="q-detail-row"><span class="q-detail-k">що перевірити</span><span>${f.check}</span></div>
      </div>`;
  }).join('');
  const fact = (k, v) => (v === null || v === undefined || v === '') ? '' : `<div class="q-detail-fact"><span class="q-detail-k">${k}</span><span>${v}</span></div>`;
  const doctor = r.doctor_full_name || r.doctor_name;
  const facts = [
    fact('Госпіталізація', qFmtDateTime(r.admission_at)),
    fact('Виписка', r.is_open ? 'ще у відділенні' : qFmtDateTime(r.discharge_at)),
    fact('Тривалість', r.los_days != null ? `${Number(r.los_days).toFixed(1)} доби` : ''),
    fact('Лікуючий лікар', doctor ? `${qEsc(doctor)}${r.doctor_position ? ` · ${qEsc(r.doctor_position)}` : ''}` : 'не визначено'),
    fact('Основний діагноз', r.primary_icd ? `${qEsc(r.primary_icd)} ${qEsc(r.primary_name || '')}` : 'немає'),
    fact('Усі діагнози', (r.dx_codes || []).length ? qEsc(r.dx_codes.join(', ')) : 'немає'),
    fact('Втручань у записі', r.procedures_count),
    fact('Операцій', r.operations_count),
    fact('Пріоритет госпіталізації', r.admission_priority ? qEsc(r.admission_priority) : ''),
    fact('Результат лікування', r.disposition ? qEsc(r.disposition) : 'не вказано'),
    fact('Виписка в ЕСОЗ', r.is_open ? '' : (Q_DISCHARGE_STATUS[r.discharge_ehealth_status] || (r.discharge_ehealth_status ? qEsc(r.discharge_ehealth_status) : 'виписки немає'))),
    fact('Строк виправлення', r.is_open ? '' : qFmtDate(r.fix_deadline)),
    fact('Вперше виявлено', qFmtDateTime(r.first_flagged_at)),
    fact('Востаннє перевірено', qFmtDateTime(r.checked_at)),
    fact('Адресат', r.addressee === 'doctor' ? 'лікуючий лікар' : 'завідувач відділення'),
  ].join('');
  const money = r.est_price == null ? '' : `
    <div class="q-detail-issue">
      <div class="q-detail-issue-title">Гроші <span class="q-detail-kind">оцінка</span></div>
      <div class="q-detail-row"><span class="q-detail-k">ціна випадку</span><span>≈ ${qGrn(r.est_price)} — ${r.est_from_nszu ? 'за розрахунком НСЗУ (package-validation)' : 'орієнтовно, за класом хвороби (розрахунку НСЗУ для цього епізоду немає)'}</span></div>
      <div class="q-detail-row"><span class="q-detail-k">під ризиком</span><span>≈ ${qGrn(r.est_risk || 0)}${r.est_risk ? '' : ' — жодне зауваження не блокує оплату'}</span></div>
    </div>`;
  return `
    <div class="q-detail">
      ${issues}
      <div class="q-detail-facts">${facts}</div>
      ${qActivityHtml(r)}
      ${money}
    </div>`;
}

// Клік по епізоду розгортає/згортає деталі; посилання (helsi) працюють як є.
document.addEventListener('click', e => {
  const ep = e.target.closest('.q-episode');
  if (!ep || e.target.closest('a')) return;
  ep.classList.toggle('q-expanded');
  const list = ep.closest('.census-list');
  if (list && typeof updateFadeMask === 'function') updateFadeMask(list, 'y');
});

function qEpisodeHtml(r, today) {
  return `
    <div class="q-episode">
      ${qNoteHtml(r)}
      <div class="q-case">
        <div class="q-case-main">
          <div class="q-case-line1">
            ${r.patient_name ? `<span class="q-case-patient">${qEsc(r.patient_name)}</span>` : ''}
            <span class="q-case-num">№ ${qEsc(r.card_number)}</span>
            <span class="q-case-dx">${qEsc(r.primary_icd || '—')} ${qEsc(r.primary_name || '')}</span>
          </div>
          <div class="q-case-line2">${qEsc(r.department_name || '—')} · ${qCaseStateHtml(r, today)} · діагнозів: ${r.dx_codes.length} · втручань: ${r.procedures_count}</div>
          ${qMoneyHtml(r)}
        </div>
        <div class="q-case-side">
          <a class="q-open-link" href="${qHelsiUrl(r, null)}" target="${Q_HELSI_WINDOW}">відкрити в helsi ↗</a>
          <span class="q-more"></span>
        </div>
      </div>
      ${qDetailHtml(r)}
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
// відділенні, далі вже втрачені (найсвіжіші зверху), в кінці — лише попередження.
const Q_CABINET_ORDER = { fixable: 0, open: 1, lost: 2, warned: 3 };

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
    .filter(r => qHasIssues(r) && qInPeriod(r, today, year, month, day) && (!doctorId || r.doctor_resource_id === doctorId) && (finBasis() !== 'nszu' || r.nszu_priced))
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
