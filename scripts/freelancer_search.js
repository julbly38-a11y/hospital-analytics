// Пошук фріланс-проєктів з медичної аналітики через Freelancer.com API.
// Запуск: FREELANCER_TOKEN=<oauth-token> node scripts/freelancer_search.js [--limit 30] [--json]
// Токен: https://accounts.freelancer.com/settings/develop (Personal Access Token).
// Заголовок авторизації — freelancer-oauth-v1. Дані в репо не пишуться: --json лише друкує в stdout.
// Ендпоінт і параметри взято з пам'яті (docs були недоступні з мережі) — звірити з
// https://developers.freelancer.com/docs/projects/projects при першому запуску.
const BASE = 'https://www.freelancer.com/api/projects/0.1/projects/active/';
const KEYWORDS = [
  'healthcare data analyst', 'medical data analysis', 'clinical data analytics',
  'HIPAA', 'FHIR', 'HL7', 'EHR', 'hospital analytics', 'health informatics',
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const limit = Number(opt('--limit', 30));
const token = process.env.FREELANCER_TOKEN;
if (!token) { console.error('Потрібен FREELANCER_TOKEN'); process.exit(1); }

async function search(query) {
  const url = new URL(BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('compact', 'true');
  url.searchParams.set('sort_field', 'time_updated');
  const res = await fetch(url, { headers: { 'freelancer-oauth-v1': token } });
  if (!res.ok) throw new Error(`${query}: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.result?.projects ?? [];
}

(async () => {
  const seen = new Map();
  for (const q of KEYWORDS) {
    try {
      for (const p of await search(q)) if (!seen.has(p.id)) seen.set(p.id, p);
    } catch (e) { console.error(e.message); }
    await new Promise((r) => setTimeout(r, 500)); // не перевищувати rate limit
  }
  const rows = [...seen.values()].map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    budget: p.budget ? `${p.budget.minimum ?? ''}-${p.budget.maximum ?? ''} ${p.currency?.code ?? ''}` : '',
    bids: p.bid_stats?.bid_count ?? '',
    url: `https://www.freelancer.com/projects/${p.seo_url}`,
  }));
  if (flag('--json')) console.log(JSON.stringify(rows, null, 2));
  else rows.forEach((r) => console.log(`${r.title}\n  ${r.budget} | ставок: ${r.bids} | ${r.url}`));
  console.error(`Знайдено унікальних проєктів: ${rows.length}`);
})();
