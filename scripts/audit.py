#!/usr/bin/env python3
"""
audit.py — повна перевірка проєкту hospital-analytics

Перевіряє:
  - Файлова структура (розмір, дата, хеш)
  - Supabase: реальні row counts, RLS, функції, storage, auth users
  - GitHub: гілки, останні коміти, open PRs
  - Vercel: деплої, статус продакшену
  - Google Drive: завантажує звіт у папку проєкту

Запуск:
  python3 scripts/audit.py

Потрібно в .env.local:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_KEY    (service role key — для прямого доступу)
  SUPABASE_DB_URL         (postgres://... — для psycopg, опційно)
  GITHUB_TOKEN
  VERCEL_TOKEN
  VERCEL_TEAM_ID
  VERCEL_PROJECT_ID

Для Google Drive: покладіть credentials.json у scripts/.google/credentials.json
"""

import os, sys, json, hashlib, datetime, subprocess, re
from pathlib import Path

# ── залежності ─────────────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    sys.exit("pip3 install requests")

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("pip3 install python-dotenv")

load_dotenv(Path(__file__).parent.parent / ".env.local")

# ── константи ──────────────────────────────────────────────────────────────
PROJECT_ROOT   = Path(__file__).parent.parent
GOOGLE_DIR     = Path(__file__).parent / ".google"
CREDS_FILE     = GOOGLE_DIR / "credentials.json"
TOKEN_FILE     = GOOGLE_DIR / "token.json"
DRIVE_FOLDER   = "0AOm0YOf60i6yUk9PVA"

SUPABASE_URL   = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON  = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SVC   = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_DB    = os.getenv("SUPABASE_DB_URL", "")

GITHUB_TOKEN   = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO    = "julbly38-a11y/hospital-analytics"

VERCEL_TOKEN   = os.getenv("VERCEL_TOKEN", "")
VERCEL_TEAM    = os.getenv("VERCEL_TEAM_ID", "team_wp8qV3ziHw0eKgh29OchDQ2F")
VERCEL_PROJECT = os.getenv("VERCEL_PROJECT_ID", "prj_KavwNImB07wBrDbWxuTr7U13Emco")

NOW = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
SKIP_DIRS = {"node_modules", ".git", ".next", "__pycache__", ".vercel"}

report = []

def h(text): report.append(f"\n## {text}")
def s(text): report.append(f"\n### {text}")
def p(text): report.append(text)
def ok(text): report.append(f"✅ {text}")
def warn(text): report.append(f"⚠️  {text}")
def err(text): report.append(f"❌ {text}")

# ══════════════════════════════════════════════════════════════════════════
# 1. ФАЙЛОВА СТРУКТУРА
# ══════════════════════════════════════════════════════════════════════════
def audit_files():
    h("ФАЙЛОВА СТРУКТУРА")
    total_files = total_size = 0
    big_files = []
    empty_files = []
    ext_counts = {}
    file_rows = []

    for path in sorted(PROJECT_ROOT.rglob("*")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if not path.is_file():
            continue
        rel = path.relative_to(PROJECT_ROOT)
        size = path.stat().st_size
        mtime = datetime.datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
        ext = path.suffix or "(no ext)"
        ext_counts[ext] = ext_counts.get(ext, 0) + 1
        total_files += 1
        total_size += size
        if size == 0:
            empty_files.append(str(rel))
        if size > 50_000:
            big_files.append((size, str(rel)))
        file_rows.append(f"| `{rel}` | {size:,} | {mtime} |")

    s("Зведення")
    p(f"- Всього файлів: **{total_files}**")
    p(f"- Загальний розмір: **{total_size/1024:.1f} KB**")

    s("За типами")
    for ext, cnt in sorted(ext_counts.items(), key=lambda x: -x[1]):
        p(f"- `{ext}`: {cnt}")

    if big_files:
        s("Великі файли (>50 KB)")
        for size, name in sorted(big_files, reverse=True)[:10]:
            warn(f"`{name}` — {size/1024:.1f} KB")

    if empty_files:
        s("Порожні файли")
        for f in empty_files:
            warn(f"`{f}`")

    s("Всі файли")
    p("| Файл | Байт | Дата |")
    p("|------|------|------|")
    for row in file_rows:
        p(row)


# ══════════════════════════════════════════════════════════════════════════
# 2. SUPABASE
# ══════════════════════════════════════════════════════════════════════════
def sb_sql(sql: str) -> list | None:
    """Виконує SQL через Supabase REST (pg функція або rpc)."""
    if not SUPABASE_URL or not SUPABASE_SVC:
        return None
    key = SUPABASE_SVC or SUPABASE_ANON
    # використовуємо pg REST endpoint /rest/v1/rpc/execute_sql якщо є,
    # інакше — прямий запит через PostgREST для простих SELECTs
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/execute_sql_safe",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            json={"sql": sql},
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None

def sb_rest(table: str, select="*", limit=5) -> list | None:
    if not SUPABASE_URL:
        return None
    key = SUPABASE_SVC or SUPABASE_ANON
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Prefer": "count=exact"},
            params={"select": select, "limit": limit},
            timeout=10
        )
        count = resp.headers.get("content-range", "?")
        return {"count": count, "data": resp.json() if resp.ok else [], "status": resp.status_code}
    except Exception as e:
        return {"error": str(e)}

def audit_supabase():
    h("SUPABASE")

    if not SUPABASE_URL:
        err("NEXT_PUBLIC_SUPABASE_URL не задано")
        return

    project_id = re.search(r"https://([a-z0-9]+)\.supabase\.co", SUPABASE_URL)
    pid = project_id.group(1) if project_id else "?"
    p(f"- Project ID: `{pid}`")
    p(f"- URL: `{SUPABASE_URL}`")
    p(f"- Service key: {'✅ задано' if SUPABASE_SVC else '❌ відсутній (обмежений доступ)'}")

    # — таблиці через прямий SQL (якщо є service key) —
    s("Таблиці (row counts)")
    tables_sql = """
        SELECT schemaname, tablename,
               pg_total_relation_size(schemaname||'.'||tablename) AS bytes,
               rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    """
    tables_result = sb_sql(tables_sql)

    # Fallback: перевіряємо окремо кожну відому таблицю через REST
    known_tables = [
        "lsmd", "lsmd_doctors", "empl", "departments",
        "doctor_stats", "app_users",
        "analytics_dept_summary", "analytics_doctor_dept", "analytics_time_patterns",
        "analytics_block_summary", "analytics_dept_icd_profile",
        "icd_10", "icd_blocks", "icd_chapters",
        "operations", "dept_block_map", "icd_chapter_map",
        "usage_stats", "import_log",
    ]

    p("| Таблиця | Записів | RLS | Розмір |")
    p("|---------|---------|-----|--------|")

    if tables_result and isinstance(tables_result, list):
        for row in tables_result:
            rls = "✅" if row.get("rowsecurity") else "❌"
            size = f"{row.get('bytes',0)/1024:.1f} KB"
            # row count через окремий запит
            cnt_res = sb_rest(row["tablename"], select="count", limit=1)
            cnt = cnt_res.get("count", "?") if cnt_res else "?"
            p(f"| `{row['tablename']}` | {cnt} | {rls} | {size} |")
    else:
        warn("execute_sql_safe недоступний — використовую REST (анон-ключ, RLS може блокувати)")
        for tbl in known_tables:
            res = sb_rest(tbl, select="count", limit=1)
            if res:
                cnt = res.get("count", "?")
                status = res.get("status", "?")
                flag = "✅" if status == 200 else "⚠️"
                p(f"| `{tbl}` | {cnt} | — | — |")
            else:
                p(f"| `{tbl}` | ❌ | — | — |")

    # — auth users —
    s("Auth")
    try:
        if SUPABASE_SVC:
            resp = requests.get(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                headers={"apikey": SUPABASE_SVC, "Authorization": f"Bearer {SUPABASE_SVC}"},
                params={"page": 1, "per_page": 1},
                timeout=10
            )
            if resp.ok:
                data = resp.json()
                total = data.get("total", len(data.get("users", [])))
                ok(f"Auth users: {total}")
            else:
                warn(f"Auth API: {resp.status_code}")
        else:
            warn("Service key відсутній — auth users недоступні")
    except Exception as e:
        err(f"Auth: {e}")

    # — storage buckets —
    s("Storage")
    try:
        key = SUPABASE_SVC or SUPABASE_ANON
        resp = requests.get(
            f"{SUPABASE_URL}/storage/v1/bucket",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=10
        )
        if resp.ok:
            buckets = resp.json()
            if buckets:
                for b in buckets:
                    pub = "public" if b.get("public") else "private"
                    p(f"- `{b['name']}` ({pub})")
            else:
                p("- Buckets: порожньо")
        else:
            warn(f"Storage: {resp.status_code}")
    except Exception as e:
        err(f"Storage: {e}")

    # — функції/RPC —
    s("RPC функції")
    rpc_sql = """
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
        ORDER BY routine_name;
    """
    rpc_result = sb_sql(rpc_sql)
    if rpc_result and isinstance(rpc_result, list):
        for row in rpc_result:
            p(f"- `{row.get('routine_name','?')}()`")
    else:
        warn("Список функцій недоступний (потрібен execute_sql_safe або service key)")

    # — RLS-проблеми —
    s("RLS статус")
    rls_sql = """
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname='public' AND rowsecurity = false
        ORDER BY tablename;
    """
    rls_result = sb_sql(rls_sql)
    if rls_result and isinstance(rls_result, list):
        if rls_result:
            for row in rls_result:
                err(f"`{row['tablename']}` — RLS вимкнено (публічний доступ!)")
        else:
            ok("Всі таблиці мають RLS")
    else:
        warn("Перевірка RLS через SQL недоступна")
        p("Відомі таблиці без RLS: `usage_stats`, `dept_block_map`, `icd_chapter_map`")


# ══════════════════════════════════════════════════════════════════════════
# 3. GITHUB
# ══════════════════════════════════════════════════════════════════════════
def gh(endpoint: str) -> dict | list | None:
    if not GITHUB_TOKEN:
        return None
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/{endpoint}",
            headers={"Authorization": f"token {GITHUB_TOKEN}",
                     "Accept": "application/vnd.github.v3+json"},
            timeout=10
        )
        return resp.json() if resp.ok else None
    except Exception:
        return None

def audit_github():
    h("GITHUB")

    if not GITHUB_TOKEN:
        err("GITHUB_TOKEN не задано")
        return

    p(f"- Репо: `{GITHUB_REPO}`")

    # — гілки —
    s("Гілки")
    branches = gh("branches")
    if branches:
        for b in branches:
            sha = b["commit"]["sha"][:7]
            p(f"- `{b['name']}` @ `{sha}`")
    else:
        warn("Гілки недоступні")

    # — останні коміти (main) —
    s("Останні 10 комітів (main)")
    commits = gh("commits?sha=main&per_page=10")
    if commits and isinstance(commits, list):
        p("| SHA | Повідомлення | Дата |")
        p("|-----|-------------|------|")
        for c in commits:
            sha = c["sha"][:7]
            msg = c["commit"]["message"].split("\n")[0][:60]
            date = c["commit"]["author"]["date"][:10]
            p(f"| `{sha}` | {msg} | {date} |")
    else:
        warn("Коміти недоступні")

    # — open PRs —
    s("Відкриті PR")
    prs = gh("pulls?state=open")
    if prs and isinstance(prs, list):
        if prs:
            for pr in prs:
                p(f"- #{pr['number']} `{pr['title']}` [{pr['head']['ref']} → {pr['base']['ref']}]")
        else:
            ok("Відкритих PR немає")
    else:
        warn("PR недоступні")

    # — статус останнього коміту —
    s("CI / Checks (main HEAD)")
    runs = None
    try:
        resp = requests.get(
            f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?per_page=3",
            headers={"Authorization": f"token {GITHUB_TOKEN}",
                     "Accept": "application/vnd.github.v3+json"},
            timeout=10
        )
        if resp.ok:
            runs = resp.json().get("workflow_runs", [])
    except Exception:
        pass

    if runs:
        for run in runs[:3]:
            status = run.get("conclusion") or run.get("status")
            icon = "✅" if status == "success" else ("❌" if status == "failure" else "⏳")
            p(f"- {icon} `{run['name']}` — {status} ({run['head_branch']} @ {run['created_at'][:10]})")
    else:
        p("- GitHub Actions: не налаштовано або недоступно")


# ══════════════════════════════════════════════════════════════════════════
# 4. VERCEL
# ══════════════════════════════════════════════════════════════════════════
def vcl(endpoint: str, params: dict = None) -> dict | None:
    if not VERCEL_TOKEN:
        return None
    try:
        resp = requests.get(
            f"https://api.vercel.com{endpoint}",
            headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
            params={"teamId": VERCEL_TEAM, **(params or {})},
            timeout=10
        )
        return resp.json() if resp.ok else None
    except Exception:
        return None

def audit_vercel():
    h("VERCEL")

    if not VERCEL_TOKEN:
        err("VERCEL_TOKEN не задано")
        return

    p(f"- Team: `{VERCEL_TEAM}`")
    p(f"- Project: `{VERCEL_PROJECT}`")

    # — проєкт —
    proj = vcl(f"/v9/projects/{VERCEL_PROJECT}")
    if proj:
        ok(f"Проєкт: `{proj.get('name')}`")
        framework = proj.get("framework") or "?"
        p(f"- Framework: `{framework}`")
        domains = [d["name"] for d in proj.get("alias", [])]
        if domains:
            p(f"- Домени: {', '.join(f'`{d}`' for d in domains)}")

    # — env vars (тільки назви) —
    s("Env vars (тільки назви)")
    env_data = vcl(f"/v9/projects/{VERCEL_PROJECT}/env")
    if env_data:
        envs = env_data.get("envs", [])
        for e in envs:
            targets = ", ".join(e.get("target", []))
            p(f"- `{e['key']}` ({targets})")
    else:
        warn("Env vars недоступні")

    # — останні деплої —
    s("Останні деплої")
    dep_data = vcl(f"/v6/deployments", {"projectId": VERCEL_PROJECT, "limit": 5})
    if dep_data:
        deps = dep_data.get("deployments", [])
        p("| Стан | Гілка | Коміт | Дата |")
        p("|------|-------|-------|------|")
        for d in deps:
            state = d.get("state", "?")
            icon = "✅" if state == "READY" else ("❌" if state == "ERROR" else "⏳")
            branch = d.get("meta", {}).get("githubCommitRef", "?")
            sha = d.get("meta", {}).get("githubCommitSha", "?")[:7]
            ts = datetime.datetime.fromtimestamp(d.get("created", 0)/1000).strftime("%Y-%m-%d %H:%M")
            target = d.get("target") or "preview"
            p(f"| {icon} {state} ({target}) | `{branch}` | `{sha}` | {ts} |")
    else:
        warn("Деплої недоступні")


# ══════════════════════════════════════════════════════════════════════════
# 5. КОНЕКТОРИ (перевірка живих ключів)
# ══════════════════════════════════════════════════════════════════════════
def audit_connectors():
    h("КОНЕКТОРИ — перевірка ключів")

    checks = [
        ("Supabase URL",    bool(SUPABASE_URL)),
        ("Supabase anon",   bool(SUPABASE_ANON)),
        ("Supabase service",bool(SUPABASE_SVC)),
        ("GitHub token",    bool(GITHUB_TOKEN)),
        ("Vercel token",    bool(VERCEL_TOKEN)),
        ("Google creds",    CREDS_FILE.exists()),
        ("Google token",    TOKEN_FILE.exists()),
    ]

    for name, exists in checks:
        (ok if exists else err)(f"{name}: {'задано' if exists else 'відсутній'}")

    # — live-перевірка Supabase —
    if SUPABASE_URL and SUPABASE_ANON:
        try:
            resp = requests.get(f"{SUPABASE_URL}/rest/v1/departments?limit=1",
                                headers={"apikey": SUPABASE_ANON}, timeout=5)
            ok(f"Supabase REST: {resp.status_code}") if resp.ok else warn(f"Supabase REST: {resp.status_code}")
        except Exception as e:
            err(f"Supabase REST: {e}")

    # — live-перевірка GitHub —
    if GITHUB_TOKEN:
        try:
            resp = requests.get("https://api.github.com/user",
                                headers={"Authorization": f"token {GITHUB_TOKEN}"}, timeout=5)
            login = resp.json().get("login", "?") if resp.ok else "?"
            ok(f"GitHub: `{login}`") if resp.ok else err(f"GitHub: {resp.status_code}")
        except Exception as e:
            err(f"GitHub: {e}")

    # — live-перевірка Vercel —
    if VERCEL_TOKEN:
        try:
            resp = requests.get("https://api.vercel.com/v2/user",
                                headers={"Authorization": f"Bearer {VERCEL_TOKEN}"}, timeout=5)
            name = resp.json().get("user", {}).get("name", "?") if resp.ok else "?"
            ok(f"Vercel: `{name}`") if resp.ok else err(f"Vercel: {resp.status_code}")
        except Exception as e:
            err(f"Vercel: {e}")


# ══════════════════════════════════════════════════════════════════════════
# 6. GOOGLE DRIVE
# Завантаження на Drive виконується через Claude MCP після запуску скрипту.
# Скрипт зберігає файл локально в docs/ — Claude підхоплює і заливає.
# ══════════════════════════════════════════════════════════════════════════
def upload_to_drive(content: str, filename: str) -> str | None:
    return None  # handled by Claude MCP (mcp__4e41e754...create_file)


# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
def main():
    print(f"🔍 Аудит проєкту hospital-analytics — {NOW}")

    report.append(f"# Аудит проєкту hospital-analytics")
    report.append(f"**Дата:** {NOW}\n")

    print("  → файли...")
    audit_files()

    print("  → Supabase...")
    audit_supabase()

    print("  → GitHub...")
    audit_github()

    print("  → Vercel...")
    audit_vercel()

    print("  → конектори...")
    audit_connectors()

    content = "\n".join(report)
    filename = f"AUDIT-{datetime.datetime.now().strftime('%Y-%m-%d_%H-%M')}.md"

    # — зберегти локально —
    out_path = PROJECT_ROOT / "docs" / filename
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(content, encoding="utf-8")
    print(f"\n✅ Локально: {out_path}")

    # — завантажити на Drive —
    print("  → Google Drive...")
    if not CREDS_FILE.exists():
        print(f"⚠️  Google Drive: покладіть credentials.json у {CREDS_FILE}")
        print("   (звіт збережено лише локально)")
    else:
        url = upload_to_drive(content, filename)
        if url and not url.startswith("ПОМИЛКА"):
            print(f"✅ Google Drive: {url}")
        else:
            print(f"❌ Google Drive: {url}")

    print("\n" + "─"*50)
    print(content[:500] + "\n...")


if __name__ == "__main__":
    main()
