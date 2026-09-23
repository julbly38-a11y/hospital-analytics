/**
 * Екстрактор епізодів закладу helsi.pro (/api/organizationEpisodes).
 * Виконати в консолі залогіненої вкладки helsi.pro (F12 → Console → вставити → Enter).
 * Результат: helsi_episodes.json
 */
(async function extractEpisodes() {
  let skip = 0, limit = 30, all = [], hasNext = true;
  while (hasNext) {
    const url = `/api/organizationEpisodes?limit=${limit}&skip=${skip}`;
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) break;
    const d = await r.json();
    if (!d || !Array.isArray(d.data)) break;
    all.push(...d.data);
    hasNext = d.meta && d.meta.hasNext;
    skip += limit;
    if (skip > 50000) break;
  }
  const bundle = { meta: { type: 'episodes', extractedAt: new Date().toISOString(), count: all.length }, data: all };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url2; a.download = 'helsi_episodes.json';
  document.body.appendChild(a); a.click(); a.remove();
  console.log('Готово:', all.length, 'епізодів →', a.download);
  return { count: all.length, file: a.download };
})();
