"""
unified_client.py — єдиний інтерфейс для всіх сервісів ЛСМД

Інтегрує:
- Supabase (PostgreSQL через psycopg)
- GitHub API
- Netlify API
- Token optimization (через token_counter)

ВИКОРИСТАННЯ:
    from unified_client import get_db, get_github, get_netlify
    
    # База даних (з автоматичним token tracking)
    db = get_db()
    rows = db.query("SELECT * FROM departments LIMIT 5")
    
    # GitHub
    gh = get_github(token="ghp_...")
    repos = gh.list_repos()
    
    # Netlify
    netlify = get_netlify(token="nfp_...")
    sites = netlify.list_sites()
"""

import os
import json
from typing import List, Dict, Optional, Any
from urllib.parse import urljoin
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

# Завантажуємо .env
load_dotenv()

# Імпорт token_counter якщо є
try:
    from token_counter import estimate_query, estimate_response, optimize_select
    TOKEN_COUNTER_AVAILABLE = True
except ImportError:
    TOKEN_COUNTER_AVAILABLE = False
    print("⚠️ token_counter.py не знайдено — token optimization вимкнено")


# ============================================================
# SUPABASE DATABASE CLIENT
# ============================================================

class SupabaseDB:
    """Клієнт для Supabase PostgreSQL з token optimization."""
    
    def __init__(self, db_url: str = None, enable_token_tracking: bool = True):
        self.db_url = db_url or os.getenv("SUPABASE_DB_URL")
        if not self.db_url:
            raise RuntimeError("Не задано SUPABASE_DB_URL у .env")
        
        self.enable_token_tracking = enable_token_tracking and TOKEN_COUNTER_AVAILABLE
        self.stats = {
            "queries": 0,
            "total_tokens": 0,
            "warnings": 0
        }
    
    def query(self, sql: str, params=None, warn_limit: int = 8000) -> List[Dict]:
        """
        SELECT запит з token tracking.
        
        Args:
            sql: SQL запит
            params: параметри для підстановки
            warn_limit: поріг попередження (токени)
        
        Returns:
            list[dict]: результат
        """
        # Token estimation перед запитом
        if self.enable_token_tracking:
            query_tokens = estimate_query(sql)
            
            # Попередження про великий запит
            if query_tokens > warn_limit:
                print(f"⚠️ Великий запит: {query_tokens:,} токенів")
                print(f"   SQL: {sql[:100]}...")
        
        # Виконання
        with psycopg.connect(self.db_url) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        
        # Token estimation після запиту
        if self.enable_token_tracking:
            # Оцінка розміру відповіді
            if rows:
                sample_size = sum(len(str(v)) for v in rows[0].values())
                response_tokens = estimate_response(len(rows), sample_size)
                total = query_tokens + response_tokens
                
                self.stats["queries"] += 1
                self.stats["total_tokens"] += total
                
                if total > warn_limit:
                    self.stats["warnings"] += 1
                    print(f"⚠️ Відповідь: {response_tokens:,} токенів ({len(rows):,} rows)")
                    print(f"   Всього: {total:,} токенів")
        
        return rows
    
    def query_one(self, sql: str, params=None) -> Optional[Dict]:
        """SELECT один рядок."""
        rows = self.query(sql, params)
        return rows[0] if rows else None
    
    def execute(self, sql: str, params=None) -> int:
        """INSERT/UPDATE/DELETE — повертає к-сть змінених рядків."""
        with psycopg.connect(self.db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                return cur.rowcount
    
    def table_count(self, table: str) -> int:
        """Швидкий підрахунок рядків."""
        result = self.query_one(f"SELECT count(*) AS n FROM {table}")
        return result["n"] if result else 0
    
    def get_stats(self) -> Dict:
        """Статистика використання токенів."""
        return {
            **self.stats,
            "avg_tokens_per_query": (
                self.stats["total_tokens"] // self.stats["queries"]
                if self.stats["queries"] > 0 else 0
            )
        }
    
    def optimize_query(self, sql: str, columns: List[str] = None) -> str:
        """
        Оптимізує SELECT запит (обмежує колонки).
        
        Args:
            sql: оригінальний SQL
            columns: список колонок для SELECT
        
        Returns:
            str: оптимізований SQL
        """
        if not TOKEN_COUNTER_AVAILABLE or not columns:
            return sql
        
        return optimize_select(sql, columns)


# ============================================================
# GITHUB API CLIENT
# ============================================================

class GitHubClient:
    """Клієнт для GitHub API."""
    
    def __init__(self, token: str = None):
        self.token = token or os.getenv("GITHUB_TOKEN")
        if not self.token:
            raise RuntimeError("Не задано GITHUB_TOKEN")
        
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        """Базовий HTTP request."""
        import requests
        url = urljoin(self.base_url, endpoint)
        response = requests.request(method, url, headers=self.headers, **kwargs)
        response.raise_for_status()
        return response.json() if response.text else None
    
    def list_repos(self, per_page: int = 100) -> List[Dict]:
        """Список репозиторіїв користувача."""
        return self._request("GET", "/user/repos", params={"per_page": per_page})
    
    def get_repo(self, owner: str, repo: str) -> Dict:
        """Інфо про репозиторій."""
        return self._request("GET", f"/repos/{owner}/{repo}")
    
    def create_file(self, owner: str, repo: str, path: str, content: str, message: str, branch: str = "main") -> Dict:
        """Створити файл в репо."""
        import base64
        data = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch
        }
        return self._request("PUT", f"/repos/{owner}/{repo}/contents/{path}", json=data)
    
    def delete_repo(self, owner: str, repo: str) -> None:
        """Видалити репозиторій (потребує delete_repo scope)."""
        self._request("DELETE", f"/repos/{owner}/{repo}")
        print(f"✅ Репозиторій {owner}/{repo} видалено")


# ============================================================
# NETLIFY API CLIENT
# ============================================================

class NetlifyClient:
    """Клієнт для Netlify API."""
    
    def __init__(self, token: str = None):
        self.token = token or os.getenv("NETLIFY_TOKEN")
        if not self.token:
            raise RuntimeError("Не задано NETLIFY_TOKEN")
        
        self.base_url = "https://api.netlify.com/api/v1"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        """Базовий HTTP request."""
        import requests
        url = urljoin(self.base_url + "/", endpoint.lstrip("/"))
        response = requests.request(method, url, headers=self.headers, **kwargs)
        response.raise_for_status()
        return response.json() if response.text else None
    
    def list_sites(self) -> List[Dict]:
        """Список сайтів."""
        return self._request("GET", "/sites")
    
    def get_site(self, site_id: str) -> Dict:
        """Інфо про сайт."""
        return self._request("GET", f"/sites/{site_id}")
    
    def list_deploys(self, site_id: str) -> List[Dict]:
        """Список деплоїв сайту."""
        return self._request("GET", f"/sites/{site_id}/deploys")
    
    def trigger_deploy(self, site_id: str) -> Dict:
        """Запустити новий деплой."""
        return self._request("POST", f"/sites/{site_id}/builds")


# ============================================================
# FACTORY FUNCTIONS
# ============================================================

_db_instance = None
_github_instance = None
_netlify_instance = None

def get_db(enable_token_tracking: bool = True) -> SupabaseDB:
    """Отримати Supabase DB клієнт (singleton)."""
    global _db_instance
    if _db_instance is None:
        _db_instance = SupabaseDB(enable_token_tracking=enable_token_tracking)
    return _db_instance

def get_github(token: str = None) -> GitHubClient:
    """Отримати GitHub клієнт."""
    global _github_instance
    if _github_instance is None or token:
        _github_instance = GitHubClient(token=token)
    return _github_instance

def get_netlify(token: str = None) -> NetlifyClient:
    """Отримати Netlify клієнт."""
    global _netlify_instance
    if _netlify_instance is None or token:
        _netlify_instance = NetlifyClient(token=token)
    return _netlify_instance


# ============================================================
# CLI HELPERS
# ============================================================

def print_db_stats():
    """Показати статистику використання токенів БД."""
    db = get_db()
    stats = db.get_stats()
    
    print("\n📊 Database Token Usage")
    print(f"   Queries:    {stats['queries']:,}")
    print(f"   Total:      {stats['total_tokens']:,} tokens")
    print(f"   Average:    {stats['avg_tokens_per_query']:,} tokens/query")
    print(f"   Warnings:   {stats['warnings']}")


if __name__ == "__main__":
    # Тест підключень
    print("=== Testing Supabase ===")
    db = get_db()
    print(f"  lsmd rows: {db.table_count('lsmd'):,}")
    print(f"  patients: {db.table_count('patients_best'):,}")
    print_db_stats()
    
    print("\n=== Testing GitHub ===")
    try:
        gh = get_github()
        repos = gh.list_repos()
        print(f"  Repositories: {len(repos)}")
        for r in repos[:3]:
            print(f"    - {r['name']}")
    except Exception as e:
        print(f"  ⚠️ GitHub: {e}")
    
    print("\n=== Testing Netlify ===")
    try:
        netlify = get_netlify()
        sites = netlify.list_sites()
        print(f"  Sites: {len(sites)}")
        for s in sites[:3]:
            print(f"    - {s['name']} ({s['url']})")
    except Exception as e:
        print(f"  ⚠️ Netlify: {e}")
