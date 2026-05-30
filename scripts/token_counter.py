"""
token_counter.py — оцінка токенів для економії при Supabase запитах

ВИКОРИСТАННЯ:
    from token_counter import estimate_query, estimate_response, optimize_select
    
    # Оцінити токени запиту
    tokens = estimate_query("SELECT * FROM lsmd WHERE id = 123")
    
    # Оцінити розмір відповіді
    tokens = estimate_response(row_count=1000, avg_row_size=500)
    
    # Оптимізувати SELECT (обмежити колонки)
    optimized = optimize_select("SELECT * FROM lsmd", 
                               columns=['id', 'patient_id', 'admission_date'])

Правила економії:
- Завжди використовуй LIMIT якщо не потрібні всі рядки
- SELECT тільки потрібні колонки (не *)
- COUNT(*) замість SELECT для підрахунку
- WHERE фільтри знижують розмір відповіді
"""

import re
from typing import List, Optional, Tuple


# Середній розмір поля (символів)
AVG_FIELD_SIZES = {
    'id': 10,
    'text': 50,
    'date': 12,
    'timestamp': 25,
    'bigint': 10,
    'integer': 8,
    'numeric': 12,
    'boolean': 5,
    'json': 200,
    'jsonb': 200
}

# Середній розмір рядка по таблицях ЛСМД
AVG_ROW_SIZES = {
    'lsmd': 800,
    'patients_best': 400,
    'empl': 300,
    'lsmd_doctors': 150,
    'icd_10': 200,
    'departments': 250,
    'operations': 150,
    'doctor_shifts': 100,
    'localities': 200
}


def estimate_tokens(text: str) -> int:
    """Оцінка токенів тексту (приблизно 4 символи = 1 токен для англ/укр)."""
    return len(text) // 4


def estimate_query(sql: str) -> int:
    """Оцінка токенів SQL запиту."""
    return estimate_tokens(sql)


def estimate_response(row_count: int, avg_row_size: int = 500, metadata_overhead: int = 50) -> int:
    """Оцінка токенів відповіді від Supabase.
    
    Args:
        row_count: Кількість рядків
        avg_row_size: Середній розмір рядка (символів)
        metadata_overhead: Додаткові символи на JSON обгортку
    
    Returns:
        Приблизна кількість токенів
    """
    total_chars = row_count * avg_row_size + metadata_overhead
    return total_chars // 4


def extract_table_name(sql: str) -> Optional[str]:
    """Витягти назву таблиці з SELECT."""
    # Простий regex для FROM table_name
    match = re.search(r'\bFROM\s+([a-z_][a-z0-9_]*)', sql, re.IGNORECASE)
    return match.group(1) if match else None


def estimate_result_size(sql: str, table_row_counts: dict = None) -> Tuple[int, int]:
    """Оцінити розмір результату запиту.
    
    Returns:
        (estimated_rows, estimated_tokens)
    """
    table = extract_table_name(sql)
    if not table:
        return (0, 0)
    
    # Оцінка кількості рядків
    if 'LIMIT' in sql.upper():
        limit_match = re.search(r'LIMIT\s+(\d+)', sql, re.IGNORECASE)
        rows = int(limit_match.group(1)) if limit_match else 1000
    elif 'WHERE' in sql.upper() and '=' in sql:
        # WHERE з конкретним значенням — припускаємо 1 рядок
        rows = 1
    else:
        # Без LIMIT та WHERE — використовуємо table_row_counts або дефолт
        if table_row_counts and table in table_row_counts:
            rows = min(table_row_counts[table], 10000)  # cap на 10k
        else:
            rows = 1000  # дефолт
    
    # Оцінка розміру рядка
    avg_row_size = AVG_ROW_SIZES.get(table, 500)
    
    # Якщо SELECT конкретні колонки (не *) — зменшуємо avg_row_size
    if 'SELECT *' not in sql.upper():
        # Підраховуємо к-сть колонок
        select_part = re.search(r'SELECT\s+(.*?)\s+FROM', sql, re.IGNORECASE | re.DOTALL)
        if select_part:
            columns = select_part.group(1).split(',')
            # Знижуємо розмір пропорційно до кількості колонок (приблизно)
            avg_row_size = avg_row_size * len(columns) // 20  # припускаємо ~20 колонок у *
    
    tokens = estimate_response(rows, avg_row_size)
    return (rows, tokens)


def optimize_select(sql: str, columns: List[str] = None, limit: int = None) -> str:
    """Оптимізувати SELECT для економії токенів.
    
    Args:
        sql: Оригінальний SQL
        columns: Список колонок (замість *)
        limit: Додати/замінити LIMIT
    
    Returns:
        Оптимізований SQL
    """
    optimized = sql
    
    # Замінити SELECT * на конкретні колонки
    if columns and 'SELECT *' in optimized.upper():
        cols_str = ', '.join(columns)
        optimized = re.sub(r'SELECT\s+\*', f'SELECT {cols_str}', optimized, flags=re.IGNORECASE)
    
    # Додати або замінити LIMIT
    if limit:
        if 'LIMIT' in optimized.upper():
            optimized = re.sub(r'LIMIT\s+\d+', f'LIMIT {limit}', optimized, flags=re.IGNORECASE)
        else:
            optimized = optimized.rstrip(';') + f' LIMIT {limit}'
    
    return optimized


def suggest_optimization(sql: str) -> List[str]:
    """Запропонувати оптимізації для запиту."""
    suggestions = []
    
    # SELECT *
    if 'SELECT *' in sql.upper():
        suggestions.append("Замініть SELECT * на конкретні колонки для економії токенів")
    
    # Немає LIMIT
    if 'LIMIT' not in sql.upper() and 'COUNT' not in sql.upper():
        suggestions.append("Додайте LIMIT якщо не потрібні всі рядки")
    
    # Немає WHERE
    if 'WHERE' not in sql.upper() and 'LIMIT' not in sql.upper():
        suggestions.append("Додайте WHERE фільтр або LIMIT для зменшення обсягу даних")
    
    # Використання JOIN без LIMIT
    if 'JOIN' in sql.upper() and 'LIMIT' not in sql.upper():
        suggestions.append("JOIN може повернути багато рядків — додайте LIMIT")
    
    # ORDER BY без LIMIT
    if 'ORDER BY' in sql.upper() and 'LIMIT' not in sql.upper():
        suggestions.append("ORDER BY зазвичай використовується з LIMIT — додайте його")
    
    return suggestions


def compare_queries(sql1: str, sql2: str, table_row_counts: dict = None) -> dict:
    """Порівняти два запити за токенами.
    
    Returns:
        {
            'query1': {'rows': X, 'tokens': Y, 'sql': ...},
            'query2': {'rows': X, 'tokens': Y, 'sql': ...},
            'savings': tokens_saved,
            'savings_pct': percent
        }
    """
    rows1, tokens1 = estimate_result_size(sql1, table_row_counts)
    rows2, tokens2 = estimate_result_size(sql2, table_row_counts)
    
    savings = tokens1 - tokens2
    savings_pct = round(100.0 * savings / tokens1, 1) if tokens1 > 0 else 0
    
    return {
        'query1': {'rows': rows1, 'tokens': tokens1, 'sql': sql1},
        'query2': {'rows': rows2, 'tokens': tokens2, 'sql': sql2},
        'savings': savings,
        'savings_pct': savings_pct
    }


if __name__ == '__main__':
    # Приклади
    
    print("=== Приклад 1: Оцінка токенів запиту ===")
    sql = "SELECT * FROM lsmd WHERE patient_id = 12345"
    tokens = estimate_query(sql)
    print(f"SQL: {sql}")
    print(f"Токени запиту: ~{tokens}")
    
    print("\n=== Приклад 2: Оцінка розміру відповіді ===")
    rows, tokens = estimate_result_size("SELECT * FROM lsmd LIMIT 100")
    print(f"Очікувано рядків: {rows}")
    print(f"Токени відповіді: ~{tokens}")
    
    print("\n=== Приклад 3: Оптимізація ===")
    original = "SELECT * FROM lsmd"
    optimized = optimize_select(original, 
                               columns=['id', 'patient_id', 'admission_date'],
                               limit=100)
    
    comparison = compare_queries(original, optimized, {'lsmd': 110206})
    print(f"Оригінал: {comparison['query1']['tokens']} токенів")
    print(f"Оптимізований: {comparison['query2']['tokens']} токенів")
    print(f"Економія: {comparison['savings_pct']}%")
    
    print("\n=== Приклад 4: Рекомендації ===")
    suggestions = suggest_optimization("SELECT * FROM lsmd JOIN patients_best USING (patient_id)")
    for i, s in enumerate(suggestions, 1):
        print(f"{i}. {s}")


