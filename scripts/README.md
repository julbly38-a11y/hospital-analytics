# LSMD Python Toolkit

> Інтегрована система для роботи з Supabase БД, GitHub, Netlify + автоматична економія токенів

## 🚀 Швидкий старт

### 1. Встановлення

```bash
cd scripts/
pip install -r requirements.txt
```

### 2. Налаштування

Створіть `.env`:

```bash
cp .env.example .env
nano .env  # додайте реальні credentials
```

### 3. Базове використання

```bash
# Статистика БД
python cli.py db stats

# Виконати запит
python cli.py db query "SELECT * FROM departments LIMIT 5" --preview

# Оцінити токени
python cli.py tokens estimate "SELECT * FROM lsmd"
```

---

## 📦 Модулі

### `unified_client.py` — єдиний інтерфейс

```python
from unified_client import get_db, get_github, get_netlify

# База даних (з автоматичним token tracking)
db = get_db()
rows = db.query("SELECT * FROM departments")
print(db.get_stats())  # статистика токенів
```

### `token_counter.py` — оцінка токенів

**Автоматичне** через `get_db()` або **ручне**:

```python
from token_counter import estimate_query, estimate_response

tokens = estimate_query("SELECT * FROM lsmd")
```

### `analytics.py` — готові запити

```python
from analytics import hospital_summary, mortality_by_department

summary = hospital_summary(db)
```

### `cli.py` — головний entry point

Всі команди в одному місці (див. нижче).

---

## 💻 CLI Commands

### Database
```bash
python cli.py db stats                    # статистика
python cli.py db tables                   # список таблиць
python cli.py db query "SQL" --preview    # запит + перегляд
```

### GitHub
```bash
python cli.py github repos       # репозиторії
python cli.py github info lsmd   # інфо про репо
```

### Netlify
```bash
python cli.py netlify sites              # сайти
python cli.py netlify deploy nobodybly   # деплой
```

### Analytics
```bash
python cli.py analytics mortality   # летальність по відділеннях
```

### Backup
```bash
python cli.py backup lsmd --output ./backups
```

### Tokens
```bash
python cli.py tokens estimate "SELECT * FROM lsmd" --rows 1000
```

---

## ⚡ Token Optimization

**Автоматично:**
- Попередження при >8000 токенів
- Статистика використання
- Рекомендації оптимізації

**Принципи:**
- `SELECT columns` замість `SELECT *`
- Завжди `LIMIT` якщо не потрібні всі рядки
- `GROUP BY` для агрегації
- `COUNT(*)` для підрахунку

---

## 📚 Документація

- **[FORMULAS.md](../docs/FORMULAS.md)** — 80+ формул VIEW
- **[DATABASE.md](../docs/DATABASE.md)** — структура БД

---

**Проєкт:** ЛСМД (Чернівці)  
**Оновлено:** 24.05.2026
