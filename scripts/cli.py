#!/usr/bin/env python3
"""
cli.py — головний entry point для роботи з ЛСМД

Команди:
    python cli.py db stats             # статистика БД
    python cli.py db query "SELECT ..."# виконати запит
    python cli.py db tables            # список таблиць
    
    python cli.py github repos         # список репозиторіїв
    python cli.py github info lsmd     # інфо про репо
    
    python cli.py netlify sites        # список сайтів
    python cli.py netlify deploy SITE  # деплой сайту
    
    python cli.py analytics mortality  # аналіз летальності
    python cli.py backup lsmd          # бекап таблиці
    
    python cli.py tokens estimate "SQL"# оцінка токенів
"""

import sys
import argparse
from typing import List

from unified_client import get_db, get_github, get_netlify, print_db_stats


# ============================================================
# DATABASE COMMANDS
# ============================================================

def cmd_db_stats(args):
    """Статистика БД."""
    db = get_db()
    
    print("\n📊 Database Overview")
    print("=" * 50)
    
    tables = [
        ('lsmd', 'Випадки госпіталізації'),
        ('patients_best', 'Пацієнти'),
        ('empl', 'Працівники'),
        ('lsmd_doctors', 'Лікарі (словник)'),
        ('icd_10', 'МКХ-10 діагнози'),
        ('departments', 'Відділення'),
        ('operations', 'Операції')
    ]
    
    for table, description in tables:
        try:
            count = db.table_count(table)
            print(f"  {table:20} {count:>10,} рядків — {description}")
        except Exception as e:
            print(f"  {table:20} {'N/A':>10} — {e}")
    
    print_db_stats()


def cmd_db_query(args):
    """Виконати SQL запит."""
    db = get_db()
    sql = args.sql
    
    # Автоматична оптимізація якщо SELECT *
    if "SELECT *" in sql.upper() and args.optimize:
        print("⚠️ Використано SELECT * — розглянь вибір конкретних колонок")
    
    try:
        rows = db.query(sql)
        
        print(f"\n✅ Отримано {len(rows):,} рядків")
        
        # Показати перші 5
        if rows and args.preview:
            print("\nПопередній перегляд (5 рядків):")
            for i, row in enumerate(rows[:5], 1):
                print(f"\n--- Рядок {i} ---")
                for key, value in row.items():
                    print(f"  {key}: {value}")
        
        # Зберегти в файл
        if args.output:
            import json
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(rows, f, ensure_ascii=False, indent=2, default=str)
            print(f"\n💾 Збережено в {args.output}")
        
        print_db_stats()
        
    except Exception as e:
        print(f"❌ Помилка: {e}")
        sys.exit(1)


def cmd_db_tables(args):
    """Список таблиць."""
    db = get_db()
    
    sql = """
    SELECT 
        schemaname, 
        tablename, 
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename
    """
    
    tables = db.query(sql)
    
    print("\n📋 Tables in public schema")
    print("=" * 60)
    for t in tables:
        print(f"  {t['tablename']:30} {t['size']:>10}")


# ============================================================
# GITHUB COMMANDS
# ============================================================

def cmd_github_repos(args):
    """Список репозиторіїв."""
    try:
        gh = get_github()
        repos = gh.list_repos()
        
        print(f"\n📦 GitHub Repositories ({len(repos)})")
        print("=" * 60)
        
        for r in repos:
            visibility = "🔒" if r['private'] else "🌐"
            size_kb = r.get('size', 0)
            print(f"  {visibility} {r['name']:30} {size_kb:>8} KB")
            print(f"     {r['html_url']}")
        
    except Exception as e:
        print(f"❌ GitHub помилка: {e}")
        sys.exit(1)


def cmd_github_info(args):
    """Інфо про репозиторій."""
    try:
        gh = get_github()
        repo = gh.get_repo("julbly38-a11y", args.repo)
        
        print(f"\n📦 {repo['full_name']}")
        print("=" * 60)
        print(f"  Description: {repo.get('description', 'N/A')}")
        print(f"  Size:        {repo['size']} KB")
        print(f"  Language:    {repo.get('language', 'N/A')}")
        print(f"  Created:     {repo['created_at']}")
        print(f"  Updated:     {repo['updated_at']}")
        print(f"  URL:         {repo['html_url']}")
        
    except Exception as e:
        print(f"❌ Помилка: {e}")
        sys.exit(1)


# ============================================================
# NETLIFY COMMANDS
# ============================================================

def cmd_netlify_sites(args):
    """Список сайтів."""
    try:
        netlify = get_netlify()
        sites = netlify.list_sites()
        
        print(f"\n🌐 Netlify Sites ({len(sites)})")
        print("=" * 60)
        
        for s in sites:
            print(f"  {s['name']:30}")
            print(f"     {s['url']}")
            print(f"     ID: {s['id']}")
        
    except Exception as e:
        print(f"❌ Netlify помилка: {e}")
        sys.exit(1)


def cmd_netlify_deploy(args):
    """Запустити деплой."""
    try:
        netlify = get_netlify()
        
        # Знайти сайт за назвою
        sites = netlify.list_sites()
        site = next((s for s in sites if s['name'] == args.site), None)
        
        if not site:
            print(f"❌ Сайт '{args.site}' не знайдено")
            sys.exit(1)
        
        print(f"🚀 Деплой {site['name']}...")
        result = netlify.trigger_deploy(site['id'])
        print(f"✅ Деплой запущено: {result}")
        
    except Exception as e:
        print(f"❌ Помилка: {e}")
        sys.exit(1)


# ============================================================
# ANALYTICS COMMANDS
# ============================================================

def cmd_analytics_mortality(args):
    """Аналіз летальності."""
    from analytics import mortality_by_department
    
    db = get_db()
    stats = mortality_by_department(db)
    
    print("\n💀 Mortality by Department")
    print("=" * 70)
    print(f"{'Department':<40} {'Cases':>10} {'Deaths':>8} {'Rate %':>8}")
    print("-" * 70)
    
    for s in stats:
        print(f"{s['department']:<40} {s['cases']:>10,} {s['deaths']:>8} {s['rate_pct']:>8.2f}")


# ============================================================
# BACKUP COMMANDS
# ============================================================

def cmd_backup_table(args):
    """Бекап таблиці в CSV."""
    from backup import backup_table
    
    db = get_db()
    filepath = backup_table(db, args.table, output_dir=args.output)
    print(f"✅ Бекап збережено: {filepath}")


# ============================================================
# TOKEN ESTIMATION
# ============================================================

def cmd_tokens_estimate(args):
    """Оцінка токенів запиту."""
    from token_counter import estimate_query, estimate_response
    
    sql = args.sql
    query_tokens = estimate_query(sql)
    
    print(f"\n📊 Token Estimation")
    print(f"  Query: {query_tokens:,} tokens")
    print(f"  SQL:   {sql[:80]}...")
    
    # Якщо відома к-сть рядків — оцінити відповідь
    if args.rows:
        response_tokens = estimate_response(args.rows, avg_row_size=500)
        total = query_tokens + response_tokens
        print(f"  Response (est): {response_tokens:,} tokens ({args.rows:,} rows)")
        print(f"  Total (est):    {total:,} tokens")
        
        if total > 8000:
            print(f"\n⚠️ WARNING: Estimated {total:,} tokens exceeds 8,000")
            print("  → Consider adding LIMIT or GROUP BY")


# ============================================================
# MAIN CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="ЛСМД CLI — unified interface для всіх операцій",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # DB commands
    db_parser = subparsers.add_parser('db', help='Database operations')
    db_sub = db_parser.add_subparsers(dest='db_command')
    
    db_sub.add_parser('stats', help='Show database statistics')
    db_sub.add_parser('tables', help='List all tables')
    
    query_parser = db_sub.add_parser('query', help='Execute SQL query')
    query_parser.add_argument('sql', help='SQL query to execute')
    query_parser.add_argument('--preview', action='store_true', help='Show first 5 rows')
    query_parser.add_argument('--output', '-o', help='Save results to file (JSON)')
    query_parser.add_argument('--optimize', action='store_true', default=True, help='Enable optimization warnings')
    
    # GitHub commands
    gh_parser = subparsers.add_parser('github', help='GitHub operations')
    gh_sub = gh_parser.add_subparsers(dest='gh_command')
    
    gh_sub.add_parser('repos', help='List repositories')
    
    info_parser = gh_sub.add_parser('info', help='Repository info')
    info_parser.add_argument('repo', help='Repository name')
    
    # Netlify commands
    netlify_parser = subparsers.add_parser('netlify', help='Netlify operations')
    netlify_sub = netlify_parser.add_subparsers(dest='netlify_command')
    
    netlify_sub.add_parser('sites', help='List sites')
    
    deploy_parser = netlify_sub.add_parser('deploy', help='Trigger deploy')
    deploy_parser.add_argument('site', help='Site name')
    
    # Analytics
    analytics_parser = subparsers.add_parser('analytics', help='Analytics')
    analytics_sub = analytics_parser.add_subparsers(dest='analytics_command')
    analytics_sub.add_parser('mortality', help='Mortality by department')
    
    # Backup
    backup_parser = subparsers.add_parser('backup', help='Backup operations')
    backup_parser.add_argument('table', help='Table name to backup')
    backup_parser.add_argument('--output', '-o', default='./backups', help='Output directory')
    
    # Tokens
    tokens_parser = subparsers.add_parser('tokens', help='Token estimation')
    tokens_sub = tokens_parser.add_subparsers(dest='tokens_command')
    
    estimate_parser = tokens_sub.add_parser('estimate', help='Estimate query cost')
    estimate_parser.add_argument('sql', help='SQL query')
    estimate_parser.add_argument('--rows', type=int, help='Expected number of rows')
    
    args = parser.parse_args()
    
    # Route commands
    if args.command == 'db':
        if args.db_command == 'stats':
            cmd_db_stats(args)
        elif args.db_command == 'query':
            cmd_db_query(args)
        elif args.db_command == 'tables':
            cmd_db_tables(args)
        else:
            db_parser.print_help()
    
    elif args.command == 'github':
        if args.gh_command == 'repos':
            cmd_github_repos(args)
        elif args.gh_command == 'info':
            cmd_github_info(args)
        else:
            gh_parser.print_help()
    
    elif args.command == 'netlify':
        if args.netlify_command == 'sites':
            cmd_netlify_sites(args)
        elif args.netlify_command == 'deploy':
            cmd_netlify_deploy(args)
        else:
            netlify_parser.print_help()
    
    elif args.command == 'analytics':
        if args.analytics_command == 'mortality':
            cmd_analytics_mortality(args)
        else:
            analytics_parser.print_help()
    
    elif args.command == 'backup':
        cmd_backup_table(args)
    
    elif args.command == 'tokens':
        if args.tokens_command == 'estimate':
            cmd_tokens_estimate(args)
        else:
            tokens_parser.print_help()
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
