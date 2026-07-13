/* Конфіг "першого шару" слайд-дашборду: логотип, KPI-блок, роки.
   Однаковий для всіх лікарень — сама назва/теглайн лікарні йде окремо,
   з /api/hospital-info (див. utils.js initHospitalName). */

window.LAYOUT_CONFIG = {
  logo: '/logo.svg',
  kpi: [
    { key: 'hosp', label: 'ГОСПІТАЛІЗАЦІЙ' },
    { key: 'pat',  label: 'ПАЦІЄНТІВ' },
    { key: 'bed',  label: 'ЛІЖКО-ДЕНЬ' },
    { key: 'age',  label: 'СЕРЕДНІЙ ВІК' },
    { key: 'let',  label: 'ЛЕТАЛЬНІСТЬ' },
  ],
  years: [2026, 2025, 2024, 2023, 2022, 2021, 2020],
};
