# База даних ЛСМД

Аналітична база Лікарні Швидкої Медичної Допомоги (Чернівці).

- **Supabase project:** wnyfrckxhwujsjcfxqou
- **Регіон:** eu-west-1
- **PostgreSQL:** 17
- **Таблиць:** 33 | **VIEW:** 8 | **MView:** 4

## Карта зв'язків (FK)

```
icd_chapters ← icd_blocks ← icd_10 ← lsmd.icd_primary
                  ↑
     17 малих довідників (parasit, neoplastics, ...)

dept_categories ← departments → clinical_blocks
                      ↑ (head_empl_id)
                     empl → clinical_blocks, dept_categories
                      ↑
  doctor_stats, doctor_shifts, lsmd_doctors, app_users
                      ↑
                    lsmd → patients_best → localities
                      ↓
                  operations

dept_transfers_matrix → departments (dept_in_id, dept_out_id)
```

## Основні таблиці

| Таблиця | Рядків | Опис |
|---|---|---|
| lsmd | 110 206 | журнал випадків (33 колонки) |
| patients_best | 72 293 | реєстр пацієнтів |
| empl | 868 | працівники |
| lsmd_doctors | 282 | міст lsmd↔empl |
| icd_10 | 19 824 | діагнози МКХ-10 |
| operations | 7 320 | комбінації ACHI |
| doctor_shifts | 68 299 | чергування |
| localities | 2 618 | населені пункти (гео) |

## Структура папки

```
database/
├── schema.sql           # повна структура
├── migrations/          # SQL міграції по етапах
└── views/               # VIEW-визначення
```
