// Щоденна перевірка епізодів на помилки, що впливають на оплату НСЗУ.
// Запускається у вкладці helsi.pro (після входу) — через консоль або
// javascript_tool: runQualityDaily({ org: '43342788' }). Прогрес —
// window.__qd. Результат іде на локальний dev-сервер
// (pages/api/local-quality-ingest.js). Епізоди в helsi не змінюються —
// лише фіксуються зауваження з підказками для лікаря/завідувача.
// Персональні дані пацієнтів не передаються: id пацієнта використовується
// лише тут, для пошуку накладок та інших епізодів того самого пацієнта.
// Якщо сесія helsi завершилась посеред прогону — увійти знову й викликати
// runQualityDaily з тими самими параметрами: уже зібрані епізоди не
// перезапитуються (продовження з window.__qd).
window.runQualityDaily = async function ({
  org,
  closedSince,
  ingestUrl = 'http://localhost:3000/api/local-quality-ingest',
  concurrency = 5,
} = {}) {
  if (!closedSince) {
    const n = new Date()
    closedSince = new Date(Date.UTC(n.getFullYear(), n.getMonth() - 1, 1)).toISOString().slice(0, 10)
  }
  const prev = window.__qd
  const resume = prev && prev.err && prev.org === org && prev.closedSince === closedSince && prev.picked && prev.details
  const runStartedAt = resume ? prev.runStartedAt : new Date().toISOString()
  const state = window.__qd = {
    stage: 'list-open', listed: 0, detailed: 0, total: 0, done: false, err: null, result: null,
    org, closedSince, runStartedAt, resumed: !!resume,
  }
  const API = '/api/hospital/api/v1'
  const INTERVENTION_CODE = /^\d{5}-\d{2}$/
  // Обстеження, які пакет НСЗУ вимагає вносити як «Діагностичний звіт», а не в «Надані
  // послуги» (реєстр із текстів відмов package-validation ЛШМД, 22.09.2026; плюс за
  // назвою — на випадок нових кодів). Перевірено: 40 із 40 відхилених знайдено, у
  // 2 із 80 прийнятих (інфаркт зі стентуванням, колектомія) спрацювало хибно.
  const IMAGING_CODES = new Set(['58500-00', '55036-00', '55113-00', '55038-00', '56001-00', '55274-00', '56807-00', '55032-00', '57518-01', '55244-01', '56301-00', '56619-00', '57350-00', '57715-00', '57506-00', '57700-00', '57901-00', '55812-00', '58900-00', '58921-00', '57518-00'])
  const IMAGING_NAME = /рентгенографі|ультразвуков|комп.?ютерна томограф|томографічна ангіограф|магнітно-резонанс|дуплексн/i
  const OPEN_STATUSES = ['open', 'on_discharge']
  const CLOSED_STATUSES = ['closed', 'pending_registration', 'registered']
  const nowMs = Date.now()
  const sinceMs = new Date(closedSince + 'T00:00:00+03:00').getTime()
  const stopMs = sinceMs - 60 * 86400000
  const dm = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` }
  const dmy = iso => `${dm(iso)}.${new Date(iso).getFullYear()}`
  const dxLabel = x => `${x.code}${x.name ? ' ' + x.name : ''}`

  const getJson = async url => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url)
      if (r.status === 401) throw new Error('Сесія helsi завершилась — увійдіть знову')
      if (r.ok) return r.json()
      await new Promise(ok => setTimeout(ok, 800))
    }
    throw new Error('helsi не відповідає: ' + url)
  }

  try {
    const picked = resume ? prev.picked : []
    // У helsi статусів епізоду п'ять: open, on_discharge (виписку розпочато) —
    // пацієнт ще у відділенні; closed, pending_registration (виписаний, очікує
    // реєстрації в ЕСОЗ), registered (виписка зареєстрована) — виписаний.
    if (!resume) for (const status of OPEN_STATUSES) for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)
      j.results.forEach(c => picked.push({ id: c.id }))
      state.listed = picked.length
      if (!j.has_next) break
    }
    state.stage = 'list-closed'
    if (!resume) for (const status of CLOSED_STATUSES) listing: for (let skip = 0; ; skip += 100) {
      const j = await getJson(`${API}/encounter_cases/?limit=100&skip=${skip}&page_size=100&status=${status}`)
      for (const c of j.results) {
        const start = new Date(c.start_datetime).getTime()
        const end = c.end_datetime ? new Date(c.end_datetime).getTime() : null
        if (start < stopMs) break listing
        if (end && end >= sinceMs && end - start > 20 * 3600000) picked.push({ id: c.id })
      }
      state.listed = picked.length
      if (!j.has_next) break
    }

    // Поки йде збір, частину пацієнтів виписують — той самий епізод може
    // потрапити і в список відкритих, і в список закритих.
    const seen = new Set()
    for (let i = picked.length - 1; i >= 0; i--) {
      if (seen.has(picked[i].id)) picked.splice(i, 1)
      else seen.add(picked[i].id)
    }

    state.stage = 'details'
    state.picked = picked
    state.total = picked.length
    const details = resume ? prev.details : new Array(picked.length)
    state.details = details
    const todo = picked.map((_, i) => i).filter(i => !details[i])
    state.detailed = picked.length - todo.length
    let cursor = 0
    const worker = async () => {
      while (cursor < todo.length) {
        const i = todo[cursor++]
        const { id } = picked[i]
        const [d, pr, sv] = await Promise.all([
          getJson(`${API}/encounter_cases/${id}/`),
          getJson(`${API}/case-dashboard/${id}/procedures/?page=1`),
          getJson(`${API}/case-dashboard/${id}/services/?page=1`),
        ])
        // Сторінка case-dashboard — лише 5 записів. Якщо на першій сторінці немає
        // жодного коду втручання, вони можуть бути далі (на вибірці 22.09.2026:
        // 2 із 40 «no_interventions» мали коди на пізніших сторінках — 28 і 15
        // послуг). Дочитуємо, поки код не знайдено або сторінки не скінчились;
        // перевірка потребує лише «чи є хоч один код», тож епізоди з кодом на
        // першій сторінці нічого зайвого не запитують.
        const hasCode = list => (list?.results || []).some(x => x.service?.code && INTERVENTION_CODE.test(x.service.code))
        const readMore = async (kind, first) => {
          for (let page = 2; first.next && !hasCode(pr) && !hasCode(sv); page++) {
            const j = await getJson(`${API}/case-dashboard/${id}/${kind}/?page=${page}`)
            first.results.push(...(j.results || []))
            first.next = j.next
          }
        }
        await readMore('procedures', pr)
        await readMore('services', sv)
        // Повний перелік послуг — ЛИШЕ для перевірки diagnostic_in_services (окремий
        // масив svExtra: сторінки, яких ще не прочитано; sv/procs_count лишаються як
        // були, щоб не міняти відбиток епізоду й не плодити події в журналі). Сторінок
        // стільки, скільки дає count (по 5), тож решту читаємо паралельно.
        const pagesHave = Math.ceil((sv.results || []).length / 5)
        const pagesAll = Math.ceil((sv.count || 0) / 5)
        const svExtra = []
        if (pagesAll > pagesHave) {
          const rest = await Promise.all(Array.from({ length: pagesAll - pagesHave }, (_, k) =>
            getJson(`${API}/case-dashboard/${id}/services/?page=${pagesHave + k + 1}`)))
          rest.forEach(j => svExtra.push(...(j.results || [])))
        }
        details[i] = { d, pr, sv, svExtra }
        state.detailed++
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    state.details = details

    state.stage = 'rules'
    const episodes = details.map(({ d, pr, sv, svExtra }) => {
      const open = OPEN_STATUSES.includes(d.status)
      const s = new Date(d.start_datetime).getTime()
      const e = d.end_datetime ? new Date(d.end_datetime).getTime() : nowMs
      const dx = (d.case_diagnosis || [])
        .map(cd => ({ code: cd.condition?.icd10am?.code, name: cd.condition?.icd10am?.name, primary: cd.role === 1 }))
        .filter(x => x.code)
      const interventionCodes = [
        ...(pr.results || []).map(p => p.service?.code),
        ...(sv.results || []).map(x => x.service?.code),
      ].filter(c => c && INTERVENTION_CODE.test(c))
      // Візуалізаційні обстеження, внесені в «Надані послуги» (повний список, усі сторінки).
      const imagingInServices = [...(sv.results || []), ...(svExtra || [])]
        .filter(x => IMAGING_CODES.has(x.service?.code) || IMAGING_NAME.test(x.service?.name || ''))
        .map(x => `${x.service.code} ${(x.service.name || '').slice(0, 60)}`)
      return { d, open, s, e, los: Math.round((e - s) / 86400000 * 10) / 10, dx, operations: pr.count ?? (pr.results || []).length, interventionCodes, imagingInServices: [...new Set(imagingInServices)] }
    })

    const byPatient = new Map()
    episodes.forEach(ep => {
      const pid = ep.d.patient?.id
      if (!pid) return
      if (!byPatient.has(pid)) byPatient.set(pid, [])
      byPatient.get(pid).push(ep)
    })

    const rows = episodes.map(ep => {
      const { d, open, los, dx } = ep
      if (!open && los < 0.85) return null
      const primaryDx = dx.find(x => x.primary) || null
      const primary = d.primary_diagnosis?.condition?.icd10am?.code || primaryDx?.code || null
      const primaryName = d.primary_diagnosis?.condition?.icd10am?.name || primaryDx?.name || null
      const cm = d.care_manager || null
      const signer = d.discharge?.participant_name || null
      const death = d.discharge_disposition?.code === 'death'
      const others = byPatient.get(d.patient?.id) || []
      const overlaps = others.filter(o => o.d.id !== d.id && (o.open || o.e - o.s >= 0.85 * 86400000) && ep.s < o.e && o.s < ep.e)
      const flags = []
      const warnings = []
      const hints = {}
      const add = (list, code, hint) => { list.push(code); hints[code] = hint }

      if (!primary && (!open || los >= 1)) {
        add(flags, 'no_primary', dx.length
          ? `У записі є діагнози ${dx.map(x => x.code).join(', ')}, але жоден не позначено основним.`
          : 'У записі немає жодного діагнозу.')
      }
      if (overlaps.length) {
        add(flags, 'overlap', overlaps.map(o =>
          `Перетин з епізодом № ${o.d.number} (${o.d.last_department?.name || 'відділення не вказано'}, ${dm(o.d.start_datetime)}–${o.open ? 'триває' : dm(o.d.end_datetime)}).`
        ).join(' ') + ' Якщо це перевід між відділеннями — має бути один випадок.')
      }
      if (!cm && (open || !signer)) {
        add(warnings, 'no_doctor', open
          ? 'Лікуючого лікаря не вказано — призначте лікаря, який веде пацієнта.'
          : 'Лікуючого лікаря не вказано, виписку ніхто не підписав.')
      }

      const symptomHint = () => {
        const cause = dx.filter(x => x.code !== primary && !/^[RZVWXY]/.test(x.code))
        return cause.length
          ? `Основний ${primary} ${primaryName || ''}. У записі є ${cause.slice(0, 3).map(dxLabel).join('; ')} — якщо причину встановлено, основним має бути встановлений діагноз.`
          : `Основний ${primary} ${primaryName || ''}, інших діагнозів немає — вкажіть встановлену причину стану.`
      }
      const injuryHint = () =>
        `Основний ${primary} ${primaryName || ''} — не вказано «Вид травми» (виробнича/невиробнича тощо) у виписці; без цього поля ДСГ-групування травми може бути некоректним.`
      const singleHint = () => {
        const history = [...new Set(others.filter(o => o.d.id !== d.id).flatMap(o => o.dx.map(x => x.code)))].filter(c => c !== primary).slice(0, 5)
        return `У записі лише ${primary ? `${primary} ${primaryName || ''}` : 'один діагноз'}.`
          + (history.length ? ` В інших епізодах пацієнта: ${history.join(', ')} — перевірте, чи актуальні.` : '')
          + (death ? ' Для летального випадку внесіть ускладнення та безпосередню причину смерті.' : '')
      }
      const interventionHint = 'У розділах «процедури» і «послуги» немає жодного коду втручання НК 026:2021.'

      // Підстава звернення для онкогематології (C81–C96, D45–D47): пакет НСЗУ
      // приймає лише «за направленням електронним/паперовим (з місць обмеження
      // волі)», «переведення з іншого ЗОЗ (з направленням)» або «з іншого
      // відділення». Самозвернення (admit_source.code = self_сonvers — «с»
      // кирилична, тому за префіксом) дає відмову: у ЛШМД на 21.09.2026 D47 100%,
      // C90 91%, C91 88%, C92 95%, C83 73% таких епізодів. Інші діагнози із
      // самозверненням (травми, урологія, гастро) проходять. Відкритий епізод —
      // попередження (підставу ще можна виправити), закритий — помилка.
      if (/^self_/.test(d.admit_source?.code || '') && /^(C(8[1-9]|9[0-6])|D4[5-7])/.test(primary || '')) {
        add(open ? warnings : flags, 'referral_basis',
          `Основний ${primary} ${primaryName || ''}: підстава звернення — «Самозвернення», а пакет НСЗУ приймає лише «За направленням електронним», «За направленням паперовим» (з місць обмеження волі), «Переведення з іншого ЗОЗ» (з доданим направленням) або «Переведення з іншого відділення». Інакше НСЗУ відмовляє в розрахунку.`)
      }

      // Попередження, а не помилка, і для закритих: no_doctor, single_diagnosis,
      // injury_no_external_cause оплату не блокують (перевірено package-validation,
      // 18.09.2026), але правила НСЗУ можуть змінитись — тож фіксуємо їх.
      // Обстеження в «Наданих послугах» замість «Діагностичного звіту»: розрахунок НСЗУ
      // відхиляє випадок (147 епізодів ЛШМД; найчастіше рентген ОГК 65, УЗД черевної
      // порожнини 50, ехокардіографія 21). Не для всіх пакетів (інфаркт зі стентуванням
      // приймається), тому лише попередження «перевірити»; пряму відмову по вже
      // розрахованих ставить nszu_refused.
      if (ep.imagingInServices.length && !/^I2[12]/.test(primary || '')) {
        add(warnings, 'diagnostic_in_services',
          `У «Наданих послугах» внесено обстеження: ${ep.imagingInServices.slice(0, 4).join('; ')}. Обстеження мають бути «Діагностичним звітом»; якщо звіт уже є — видаліть дублювання з блоку послуг.`)
      }

      // Ішемічний інсульт (I63): пакет НСЗУ «Медична допомога при гострому
      // мозковому інсульті» РЕКОМЕНДУЄ (info у відповіді package-validation, ціна
      // від цього не міняється — тарифи фіксовані): (1) додатковий діагноз групи G —
      // неврологічні прояви/наслідки інсульту; (2) додаткові діагнози щодо перебігу
      // (стандарт 0604) — без них випадок «підлягатиме подальшому медичному
      // моніторингу з боку НСЗУ». Обидва — лише попередження. Без жодного додаткового
      // діагнозу ставимо тільки stroke_no_additional (він включає відсутність G).
      if (/^I63/.test(primary || '') && (!open || los >= 2)) {
        const additional = dx.filter(x => !x.primary)
        if (!additional.length) {
          add(warnings, 'stroke_no_additional', 'У записі немає жодного додаткового діагнозу. За умовами пакета випадок без додаткових діагнозів (стандарт 0604) підлягатиме подальшому медичному моніторингу з боку НСЗУ; рекомендовано також діагноз групи G (неврологічні прояви або наслідки інсульту).')
        } else if (!additional.some(x => /^G/.test(x.code))) {
          add(warnings, 'stroke_no_g', `Основний ${primary} ${primaryName || ''}: немає додаткового діагнозу групи G. За умовами пакета рекомендовано вносити діагноз групи G, що вказує на неврологічні прояви або наслідки інсульту.`)
        }
      }

      if (open) {
        if (/^R/.test(primary || '') && los >= 2) add(warnings, 'symptom_primary', symptomHint())
        if (/^[ST]/.test(primary || '') && d.injury_type == null) add(warnings, 'injury_no_external_cause', injuryHint())
        if (!ep.interventionCodes.length && los >= 2) add(warnings, 'no_interventions', interventionHint)
        if (dx.length <= 1 && los >= 2) add(warnings, 'single_diagnosis', singleHint())
        if (los > 30) add(warnings, 'open_too_long', `Епізод відкрито ${dmy(d.start_datetime)}, ${Math.floor(los)} діб. Якщо пацієнта виписано — закрийте епізод і оформіть виписку.`)
      } else {
        if (/^R/.test(primary || '')) add(flags, 'symptom_primary', symptomHint())
        if (/^[ST]/.test(primary || '') && d.injury_type == null) add(warnings, 'injury_no_external_cause', injuryHint())
        if (!ep.interventionCodes.length) add(flags, 'no_interventions', interventionHint)
        if (dx.length <= 1) add(death ? flags : warnings, death ? 'death_single_diagnosis' : 'single_diagnosis', singleHint())
        // Виписка є, а результату лікування нема — package-validation НСЗУ
        // відмовляє («discharge_disposition: поле не може бути null»; 54
        // відмови на 21.09.2026, 39 з них із випискою). Без виписки цю помилку
        // не ставимо — там уже є discharge_not_registered («виписки немає»).
        if (d.discharge && !d.discharge_disposition?.code) {
          add(flags, 'no_disposition', 'Виписку оформлено, але не вказано результат лікування (поле «Результат лікування») — НСЗУ не розрахує оплату без нього.')
        }
        const st = d.discharge?.helsi_status
        if (st !== 'registered') {
          const by = signer ? ` (автор: ${signer})` : ''
          add(flags, 'discharge_not_registered',
            !d.discharge ? 'Виписки немає — оформіть виписку.'
              : st === 'draft_created' ? `Виписка в чернетці${by} — підпишіть і зареєструйте в ЕСОЗ.`
              : st === 'pending_registration' ? `Виписка очікує реєстрації в ЕСОЗ${by} — перевірте, чи не повернулась з помилкою.`
              : st === 'cancelled' ? `Виписку скасовано${by} — оформіть нову.`
              : `Виписка є${by}, але не передана в медичну карту пацієнта — надішліть в ЕСОЗ.`)
        }
      }

      return {
        case_id: d.id, number: d.number, is_open: open,
        start: d.start_datetime, end: open ? null : d.end_datetime, los_days: los,
        dept: d.last_department?.name || null,
        doctor_full: cm ? [cm.last_name, cm.first_name, cm.second_name].filter(Boolean).join(' ') : null,
        doctor_short: cm?.last_name ? `${cm.last_name} ${(cm.first_name || '')[0] || ''}.${cm.second_name ? ' ' + cm.second_name[0] + '.' : ''}` : null,
        signer_short: signer,
        position: cm?.position_name || d.discharge?.participant_position || null,
        primary, primary_name: primaryName,
        dx_codes: dx.map(x => x.code), procs_count: ep.interventionCodes.length,
        operations_count: ep.operations, priority: d.priority || d.discharge?.priority || null,
        disposition: d.discharge_disposition?.code || null,
        discharge_status: d.discharge?.helsi_status ?? null,
        flags, warnings, hints,
      }
    }).filter(Boolean)

    state.rows = rows
    state.stage = 'ingest'
    const r = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org, rows, runStartedAt }),
    })
    state.result = { http: r.status, body: await r.json().catch(() => null) }
  } catch (e) {
    state.err = String(e.message || e)
  }
  state.done = true
  return state
}
