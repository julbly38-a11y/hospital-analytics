# Hospital Analytics

Медична аналітична платформа для лікарні. Next.js + Supabase. Прод: [nobodybly.org](https://nobodybly.org).

## Стек

- **Next.js** (App Router) — фронтенд і API-роути
- **Supabase** (PostgreSQL) — база даних `lsmd`, таблиця `patients_best`
- **Vercel** — деплой (гілка `main`)
- **Resend** — email

## Змінні оточення (Vercel)

| Змінна | Призначення |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL проєкту Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публічний anon-ключ |
| `SUPABASE_SERVICE_KEY` | service_role ключ (лише бекенд) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | LLM-провайдери (опційно) |

## Публічні сторінки (`public/`)

| Файл | Опис |
|---|---|
| `kabinet.html` | Вхід до особистого кабінету |
| `head-cabinet.html` | Кабінет завідувача |
| `neuro-cv-pie.html` | Кільцева діаграма ЦВ патології (подвійне кільце) |
| `neuro-treemap.html` | Treemap екстрених випадків неврології |
| `neuro-emergency.html` | Подвійна пончикова діаграма неврології |

### neuro-cv-pie.html

Статична візуалізація цереброваскулярної патології Центру невідкладної неврології.

- **Зовнішнє кільце**: 10 сегментів МКХ-10, згруповані: ішемічні (sage) → геморагічні (рожевий)
- **Внутрішнє кільце**: 2 сегменти — Ішемічний інсульт (3 940 вип., 90.9%) та Геморагічний (396 вип., 9.1%)
- Всього: 4 336 ЦВ випадків
- Інтерактивність: hover-підсвічення, клік-обертання зовнішнього кільця

## Локальний запуск

```bash
npm run dev          # Next.js на :3000
# або статичний сервер:
python3 -m http.server 8099 --directory public   # :8099
```

## Імпорт даних

Скрипт `scripts/import-helsi.js` — імпорт PDF helsi → `lsmd/patients_best`.  
Документація: `docs/HANDOFF_2026-06-23.md`.
