// Орієнтовна вартість епізоду й сума під ризиком для контролю записів
// (/api/lpz-case-quality, лише для головного лікаря).
//
// Офіційне — постанова КМУ від 31.12.2025 № 1808 (Порядок ПМГ-2026):
//   п. 34 — базова ставка на пролікований випадок 8 735 грн для пакетів
//           «Хірургічні операції… у стаціонарних умовах» і «Стаціонарна
//           допомога… без проведення хірургічних операцій»; оплата = ставка ×
//           ваговий коефіцієнт ДСГ (додаток 1) × коригувальні коефіцієнти;
//   п. 36.8 — коефіцієнт 0,8 для планової допомоги без операцій (крім дітей);
//   п. 45 — інсульт без ендоваскулярних втручань і тромболізису — 15 643 грн;
//   п. 49 — інфаркт без стентування — 25 261 грн.
// Орієнтовне — вага ДСГ: точну групу визначає НСЗУ, тож беремо медіану ваг
// груп з додатка 1 (хірургічні групи; нехірургічні — за класом хвороб), і
// частка втрат за типом помилки — експертна оцінка, не норматив.

export const PRICING_SOURCE = 'Ставки — постанова КМУ № 1808 від 31.12.2025 (базова ставка 8 735 грн, інсульт 15 643 грн, інфаркт 25 261 грн, планова допомога × 0,8). Для епізодів із розрахунком НСЗУ (package-validation, усі відділення, епізоди не старіші за 90 днів на момент збору) — реальна ціна ДСГ з коефіцієнтами епізоду, а пряма відмова НСЗУ для ще не зареєстрованої виписки — повна втрата (для вже зареєстрованої вплив на оплату не підтверджено); для решти вага групи ДСГ і частка втрат орієнтовні.'

const BASE_RATE = 8735
const STROKE_RATE = 15643
const INFARCT_RATE = 25261
const PLANNED_NONSURGICAL = 0.8
const SURGICAL_WEIGHT = 2.12

// Медіани ваг нехірургічних ДСГ (групи 60–83) з додатка 1 за основною
// діагностичною категорією.
const MEDICAL_WEIGHT = { B: 1.08, C: 0.593, D: 0.402, E: 0.947, F: 0.724, G: 0.678, H: 1.348, I: 0.817, J: 0.685, K: 0.708, L: 0.628, M: 0.578, N: 0.447, O: 0.459, P: 1.293, Q: 0.919, R: 1.134, T: 0.98, U: 0.629, V: 1.68, X: 0.541, Z: 0.975 }
const DEFAULT_MEDICAL_WEIGHT = 0.8

// Наближене зіставлення коду МКХ з основною діагностичною категорією ДСГ.
function diagnosticCategory(icd) {
  const c = String(icd || '').toUpperCase()
  const n = Number(c.slice(1, 3))
  switch (c[0]) {
    case 'A': case 'B': return 'T'
    case 'C': return 'R'
    case 'D': return n < 50 ? 'R' : 'Q'
    case 'E': return 'K'
    case 'F': return n >= 10 && n <= 19 ? 'V' : 'U'
    case 'G': return 'B'
    case 'H': return n < 60 ? 'C' : 'D'
    case 'I': return n >= 60 && n <= 69 ? 'B' : 'F'
    case 'J': return 'E'
    case 'K': return n >= 70 && n <= 87 ? 'H' : 'G'
    case 'L': return 'J'
    case 'M': return 'I'
    case 'N': return n < 40 ? 'L' : n <= 51 ? 'M' : 'N'
    case 'O': return 'O'
    case 'P': return 'P'
    case 'R': return /^R3[0-9]/.test(c) ? 'L' : null
    case 'S': case 'T': return 'X'
    case 'Z': return 'Z'
    default: return null
  }
}

// real_price — ціна з розрахунку НСЗУ (quality-access.js: readRealPrices), якщо
// епізод є в lpz_episode_facts; інакше — орієнтовна оцінка нижче.
export function estimatePrice(row) {
  if (row.real_price) return row.real_price
  const icd = String(row.primary_icd || '').toUpperCase()
  if (/^I6[0-4]/.test(icd)) return STROKE_RATE
  if (/^I2[12]/.test(icd)) return INFARCT_RATE
  if (row.operations_count > 0) return Math.round(BASE_RATE * SURGICAL_WEIGHT)
  const weight = MEDICAL_WEIGHT[diagnosticCategory(icd)] ?? DEFAULT_MEDICAL_WEIGHT
  const planned = row.admission_priority === 'routine' ? PLANNED_NONSURGICAL : 1
  return Math.round(BASE_RATE * weight * planned)
}

// Частка вартості, яку ймовірно втратить лікарня, якщо помилку не виправити.
// Нуль — перевірки, для яких живими викликами package-validation (18.09.2026,
// травматологія ЛШМД) доведено, що вони оплату не блокують: розрахунок ДСГ і
// ціни з ними або без них ідентичний. Зауваження в нотатці лікаря лишається,
// але грошового ризику не створює.
const LOSS_SHARE = {
  discharge_not_registered: 1,
  no_primary: 1,
  open_too_long: 1,
  overlap: 0.5,
  no_interventions: 0.3,
  symptom_primary: 0.3,
  death_single_diagnosis: 0.25,
  // Відмову за цим полем уже рахує nszu_refused, а незареєстровану виписку —
  // discharge_not_registered: власного ризику не додаємо, щоб не подвоювати.
  no_disposition: 0,
  // Відмову за підставою звернення вже рахує nszu_refused (для розрахованих
  // епізодів); власного ризику не додаємо, щоб не подвоювати.
  referral_basis: 0,
  // Рекомендації пакета «гострий мозковий інсульт» (діагноз групи G, додаткові
  // діагнози): ціна фіксована й від них не залежить — грошового ризику нема.
  stroke_no_g: 0,
  stroke_no_additional: 0,
  injury_no_external_cause: 0,
  no_doctor: 0,
  single_diagnosis: 0,
  nszu_refused: 1,
}

// Для епізодів із розрахунком НСЗУ (real_price) зауваження, які НСЗУ вже
// врахувало (втручання, симптом, один діагноз…), втрати не створюють: розрахунок
// пройшов і ціна вже реальна. Лишаються лише те, що package-validation не
// перевіряє: виписка не в ЕСОЗ, накладка між епізодами, затягнутий відкритий.
const OUTSIDE_VALIDATION = new Set(['discharge_not_registered', 'overlap', 'open_too_long'])

// Відмова НСЗУ (lib/quality-access.js: nszu_refused) — помилка за вердиктом
// самого розрахунку, але грошовий ефект різний. Виписка ще НЕ зареєстрована в
// ЕСОЗ — без виправлення її не зареєструвати, випадок без ДСГ і ціни: втрата
// повна. Виписка ВЖЕ зареєстрована (502 з 594 відмов на 21.09.2026) — вона
// пройшла реєстрацію, тож чи не заплатять за неї фактично, ми не знаємо:
// відмова лишається помилкою в нотатці, але грошового ризику не створює.
export function estimateRisk(row, price) {
  const registered = row.discharge_ehealth_status === 'registered'
  if (row.nszu_refused && !registered) return price
  let codes = [...(row.flags || []), ...(row.warnings || [])]
  if (registered) codes = codes.filter(code => code !== 'nszu_refused')
  if (row.real_price) codes = codes.filter(code => OUTSIDE_VALIDATION.has(code))
  const share = codes.reduce((m, code) => Math.max(m, LOSS_SHARE[code] || 0), 0)
  return Math.round(price * share)
}
