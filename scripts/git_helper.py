"""
git_helper.py — робота з Git та GitHub API

ВИКОРИСТАННЯ:
    from git_helper import GitHelper
    
    git = GitHelper(token='ghp_...', repo='julbly38-a11y/lsmd')
    git.commit_and_push('Fix bug', files=['scripts/test.py'])
    git.create_branch('feature-x')
    
Підтримує:
- Local git operations (commit, push, pull)
- GitHub API (create branch, PR, releases)
- Token-based auth (automatic credential handling)
"""

import os
import subprocess
from typing import List, Optional
import requests


class GitHelper:
    """Git operations для LSMD проєкту."""
    
    def __init__(self, token: Optional[str] = None, repo: str = 'julbly38-a11y/lsmd'):
        """
        Args:
            token: GitHub Personal Access Token (або з env GITHUB_TOKEN)
            repo: формат owner/repo
        """
        self.token = token or os.getenv('GITHUB_TOKEN')
        self.repo = repo
        self.owner, self.repo_name = repo.split('/')
        self.api_base = 'https://api.github.com'
        
    def _headers(self) -> dict:
        """GitHub API headers."""
        if not self.token:
            raise RuntimeError("GitHub token не заданий (передай в __init__ або встав GITHUB_TOKEN)")
        return {
            'Authorization': f'token {self.token}',
            'Accept': 'application/vnd.github.v3+json'
        }
    
    def _git_url_with_token(self) -> str:
        """Git remote URL з токеном для автоматичної авторизації."""
        return f'https://{self.owner}:{self.token}@github.com/{self.owner}/{self.repo_name}.git'
    
    def _run(self, cmd: List[str], cwd: str = '.') -> tuple:
        """Запуск git команди."""
        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    # ===== LOCAL GIT =====
    
    def status(self, cwd: str = '.') -> str:
        """Git status."""
        code, out, err = self._run(['git', 'status', '--short'], cwd)
        return out if code == 0 else err
    
    def add(self, files: List[str], cwd: str = '.') -> bool:
        """Git add файли."""
        code, _, _ = self._run(['git', 'add'] + files, cwd)
        return code == 0
    
    def commit(self, message: str, cwd: str = '.') -> bool:
        """Git commit."""
        code, _, _ = self._run(['git', 'commit', '-m', message], cwd)
        return code == 0
    
    def push(self, branch: str = 'main', cwd: str = '.', set_upstream: bool = False) -> bool:
        """Git push з автоматичною авторизацією через token."""
        # Тимчасово змінюємо remote URL на той що з токеном
        self._run(['git', 'remote', 'set-url', 'origin', self._git_url_with_token()], cwd)
        
        cmd = ['git', 'push']
        if set_upstream:
            cmd += ['-u', 'origin', branch]
        else:
            cmd += ['origin', branch]
        
        code, out, err = self._run(cmd, cwd)
        
        # Повертаємо чистий URL (без токена)
        clean_url = f'https://github.com/{self.owner}/{self.repo_name}.git'
        self._run(['git', 'remote', 'set-url', 'origin', clean_url], cwd)
        
        return code == 0
    
    def pull(self, branch: str = 'main', cwd: str = '.') -> bool:
        """Git pull."""
        self._run(['git', 'remote', 'set-url', 'origin', self._git_url_with_token()], cwd)
        code, _, _ = self._run(['git', 'pull', 'origin', branch], cwd)
        clean_url = f'https://github.com/{self.owner}/{self.repo_name}.git'
        self._run(['git', 'remote', 'set-url', 'origin', clean_url], cwd)
        return code == 0
    
    def commit_and_push(self, message: str, files: List[str], cwd: str = '.', branch: str = 'main') -> bool:
        """Швидкий commit + push."""
        if not self.add(files, cwd):
            return False
        if not self.commit(message, cwd):
            return False
        return self.push(branch, cwd)
    
    # ===== GITHUB API =====
    
    def create_branch(self, branch_name: str, from_branch: str = 'main') -> dict:
        """Створити гілку через API."""
        # Отримати SHA головного коміту from_branch
        r = requests.get(f'{self.api_base}/repos/{self.repo}/git/ref/heads/{from_branch}', 
                        headers=self._headers())
        if not r.ok:
            return {'error': r.text}
        
        sha = r.json()['object']['sha']
        
        # Створити нову гілку
        r = requests.post(f'{self.api_base}/repos/{self.repo}/git/refs',
                         headers=self._headers(),
                         json={'ref': f'refs/heads/{branch_name}', 'sha': sha})
        return r.json() if r.ok else {'error': r.text}
    
    def list_branches(self) -> List[str]:
        """Список гілок."""
        r = requests.get(f'{self.api_base}/repos/{self.repo}/branches', headers=self._headers())
        return [b['name'] for b in r.json()] if r.ok else []
    
    def get_file_content(self, path: str, branch: str = 'main') -> Optional[str]:
        """Отримати вміст файлу з GitHub."""
        r = requests.get(f'{self.api_base}/repos/{self.repo}/contents/{path}?ref={branch}',
                        headers=self._headers())
        if not r.ok:
            return None
        
        import base64
        content_b64 = r.json().get('content', '')
        return base64.b64decode(content_b64).decode('utf-8')
    
    def create_pr(self, title: str, head: str, base: str = 'main', body: str = '') -> dict:
        """Створити Pull Request."""
        r = requests.post(f'{self.api_base}/repos/{self.repo}/pulls',
                         headers=self._headers(),
                         json={'title': title, 'head': head, 'base': base, 'body': body})
        return r.json() if r.ok else {'error': r.text}
    
    def repo_info(self) -> dict:
        """Інформація про репозиторій."""
        r = requests.get(f'{self.api_base}/repos/{self.repo}', headers=self._headers())
        if not r.ok:
            return {'error': r.text}
        
        data = r.json()
        return {
            'name': data['name'],
            'full_name': data['full_name'],
            'private': data['private'],
            'size': data['size'],
            'default_branch': data['default_branch'],
            'updated_at': data['updated_at'],
            'url': data['html_url']
        }


if __name__ == '__main__':
    # Приклад використання
    import sys
    
    token = os.getenv('GITHUB_TOKEN')
    if not token:
        print("Встанови GITHUB_TOKEN у .env")
        sys.exit(1)
    
    git = GitHelper(token=token)
    
    print("=== Repo Info ===")
    info = git.repo_info()
    print(f"Repo: {info.get('full_name')}")
    print(f"Branch: {info.get('default_branch')}")
    print(f"Updated: {info.get('updated_at')}")
    
    print("\n=== Branches ===")
    branches = git.list_branches()
    for b in branches:
        print(f"  • {b}")
