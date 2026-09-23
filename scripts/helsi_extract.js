/**
 * Універсальний екстрактор helsi.pro.
 *
 * Тягне МАКСИМУМ даних для закладу, у який залогінена поточна вкладка helsi.pro.
 * helsi — національна система з єдиною схемою, тому цей самий код працює для
 * БУДЬ-ЯКОЇ лікарні: підключаєшся під акаунтом лікарні → знімається її structureId
 * автоматично → вивантажується структура/штат/довідники.
 *
 * ЯК ЗАПУСКАТИ:
 *   виконати весь цей файл у консолі залогіненої вкладки helsi.pro
 *   (або через claude-in-chrome javascript_tool). У кінці — window.__helsiBundle
 *   і автоскачування raw-бандла. Скачувати краще в НОВІЙ вкладці (Chrome блокує
 *   повторні download з домену), файл може падати в ~/Downloads.
 *
 * РЕЗУЛЬТАТ (raw bundle, ще не нормалізований — нормалізує helsi_normalize.py):
 *   { meta, user, structure, resources[], dict: { specialities, positions } }
 */
(async function extractHelsi() {
  const j = async (url) => {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return r.json();
  };

  // 1) Хто ми / який заклад
  const user = await j('/api/user/me').catch(() => null);

  // 2) Повне дерево структури закладу (корінь = сам заклад, child = підрозділи)
  const structure = await j('/api/dict/structure?en=true');
  const rootId = structure?.[0]?.structureId;
  if (!rootId) throw new Error('Не знайдено structureId кореня — сесія залогінена?');

  // 3) Усі працівники закладу (пагінація по 40)
  const resources = [];
  for (let page = 1; page < 100; page++) {
    const url = `/api/resources?isRemoved=false&limit=40&page=${page}`
      + `&populate=true&sort=lastName&structureIds=${rootId}&type=1&visibilityZone=1`;
    const d = await j(url);
    const rows = d.data || [];
    resources.push(...rows);
    const total = d.paging?.length ?? rows.length;
    if (resources.length >= total || rows.length === 0) break;
  }

  // 4) Довідники (спільні для всіх лікарень, але фіксуємо версію на момент вигрузки)
  const dict = {
    specialities: await j('/api/dict/speciality?levels=false&find={%22delete%22:%22false%22}').catch(() => null),
    positions: await j('/api/dict/position?levels=false').catch(() => null),
  };

  const bundle = {
    meta: {
      extractedAt: new Date().toISOString(),
      source: 'helsi.pro',
      rootStructureId: rootId,
      rootName: structure[0]?.name || null,
      counts: { resources: resources.length },
    },
    user,
    structure,
    resources,
    dict,
  };
  window.__helsiBundle = bundle;

  // автоскачування raw-бандла
  const slug = (structure[0]?.name || 'helsi')
    .toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '_').slice(0, 40);
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `helsi_raw_${slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  return {
    rootName: bundle.meta.rootName,
    rootStructureId: rootId,
    structureNodes: JSON.stringify(structure).length,
    resources: resources.length,
    bytes: blob.size,
    file: a.download,
  };
})();
