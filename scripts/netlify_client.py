"""
netlify_client.py — робота з Netlify через API

ВИКОРИСТАННЯ:
    from netlify_client import NetlifyClient
    
    netlify = NetlifyClient(token='nfp_...')
    sites = netlify.list_sites()
    netlify.set_env_var('SUPABASE_URL', 'https://...')
    netlify.trigger_deploy()

API docs: https://docs.netlify.com/api/get-started/
"""

import os
import requests
from typing import List, Dict, Optional


class NetlifyClient:
    """Netlify API для LSMD проєкту."""
    
    def __init__(self, token: Optional[str] = None, site_id: Optional[str] = None):
        """
        Args:
            token: Netlify Personal Access Token (або з env NETLIFY_TOKEN)
            site_id: ID сайту (або з env NETLIFY_SITE_ID)
        """
        self.token = token or os.getenv('NETLIFY_TOKEN')
        self.site_id = site_id or os.getenv('NETLIFY_SITE_ID')
        self.api_base = 'https://api.netlify.com/api/v1'
        
    def _headers(self) -> dict:
        """Netlify API headers."""
        if not self.token:
            raise RuntimeError("Netlify token не заданий")
        return {'Authorization': f'Bearer {self.token}'}
    
    # ===== SITES =====
    
    def list_sites(self) -> List[Dict]:
        """Список всіх сайтів акаунту."""
        r = requests.get(f'{self.api_base}/sites', headers=self._headers())
        if not r.ok:
            return []
        
        sites = []
        for s in r.json():
            sites.append({
                'id': s['id'],
                'name': s['name'],
                'url': s.get('url'),
                'custom_domain': s.get('custom_domain'),
                'created_at': s['created_at'],
                'updated_at': s['updated_at'],
                'repo': s.get('build_settings', {}).get('repo_url')
            })
        return sites
    
    def get_site(self, site_id: Optional[str] = None) -> Optional[Dict]:
        """Інфо про конкретний сайт."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        r = requests.get(f'{self.api_base}/sites/{sid}', headers=self._headers())
        return r.json() if r.ok else None
    
    # ===== DEPLOYS =====
    
    def list_deploys(self, site_id: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """Історія деплоїв."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        r = requests.get(f'{self.api_base}/sites/{sid}/deploys', 
                        headers=self._headers(),
                        params={'per_page': limit})
        if not r.ok:
            return []
        
        deploys = []
        for d in r.json():
            deploys.append({
                'id': d['id'],
                'state': d['state'],
                'branch': d.get('branch'),
                'commit_ref': d.get('commit_ref'),
                'created_at': d['created_at'],
                'deploy_time': d.get('deploy_time'),
                'url': d.get('deploy_ssl_url') or d.get('url')
            })
        return deploys
    
    def trigger_deploy(self, site_id: Optional[str] = None) -> Dict:
        """Запустити новий деплой (build hook)."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        r = requests.post(f'{self.api_base}/sites/{sid}/builds', 
                         headers=self._headers())
        return r.json() if r.ok else {'error': r.text}
    
    def get_deploy_status(self, deploy_id: str) -> str:
        """Статус конкретного деплою."""
        r = requests.get(f'{self.api_base}/deploys/{deploy_id}', 
                        headers=self._headers())
        return r.json().get('state', 'unknown') if r.ok else 'error'
    
    # ===== ENV VARS =====
    
    def get_env_vars(self, site_id: Optional[str] = None) -> Dict[str, str]:
        """Список env змінних."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        # Netlify API повертає env vars через site accounts
        site = self.get_site(sid)
        if not site:
            return {}
        
        account_id = site.get('account_slug')
        if not account_id:
            return {}
        
        r = requests.get(f'{self.api_base}/accounts/{account_id}/env',
                        headers=self._headers(),
                        params={'site_id': sid})
        
        if not r.ok:
            return {}
        
        # Повертаємо key: value
        env_vars = {}
        for item in r.json():
            key = item.get('key')
            values = item.get('values', [])
            if key and values:
                env_vars[key] = values[0].get('value', '')
        
        return env_vars
    
    def set_env_var(self, key: str, value: str, site_id: Optional[str] = None) -> bool:
        """Встановити env змінну."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        site = self.get_site(sid)
        if not site:
            return False
        
        account_id = site.get('account_slug')
        if not account_id:
            return False
        
        # Netlify env API: PUT /accounts/{account_id}/env/{key}
        r = requests.put(
            f'{self.api_base}/accounts/{account_id}/env/{key}',
            headers=self._headers(),
            params={'site_id': sid},
            json={
                'context': 'all',
                'value': value
            }
        )
        
        return r.ok
    
    def delete_env_var(self, key: str, site_id: Optional[str] = None) -> bool:
        """Видалити env змінну."""
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        site = self.get_site(sid)
        if not site:
            return False
        
        account_id = site.get('account_slug')
        r = requests.delete(
            f'{self.api_base}/accounts/{account_id}/env/{key}',
            headers=self._headers(),
            params={'site_id': sid}
        )
        
        return r.ok
    
    # ===== BUILD SETTINGS =====
    
    def get_build_settings(self, site_id: Optional[str] = None) -> Dict:
        """Build налаштування."""
        site = self.get_site(site_id)
        if not site:
            return {}
        
        build = site.get('build_settings', {})
        return {
            'repo_url': build.get('repo_url'),
            'repo_branch': build.get('repo_branch'),
            'build_command': build.get('cmd'),
            'publish_dir': build.get('dir'),
            'functions_dir': build.get('functions_dir')
        }
    
    def update_build_settings(self, site_id: Optional[str] = None, **settings) -> bool:
        """Оновити build налаштування.
        
        Приклад:
            netlify.update_build_settings(
                build_command='npm run build',
                publish_dir='.next'
            )
        """
        sid = site_id or self.site_id
        if not sid:
            raise ValueError("site_id не заданий")
        
        # Мапінг friendly names → API fields
        build_settings = {}
        if 'build_command' in settings:
            build_settings['cmd'] = settings['build_command']
        if 'publish_dir' in settings:
            build_settings['dir'] = settings['publish_dir']
        if 'functions_dir' in settings:
            build_settings['functions_dir'] = settings['functions_dir']
        if 'repo_branch' in settings:
            build_settings['repo_branch'] = settings['repo_branch']
        
        r = requests.patch(
            f'{self.api_base}/sites/{sid}',
            headers=self._headers(),
            json={'build_settings': build_settings}
        )
        
        return r.ok


if __name__ == '__main__':
    import sys
    
    token = os.getenv('NETLIFY_TOKEN')
    if not token:
        print("Встанови NETLIFY_TOKEN у .env")
        sys.exit(1)
    
    netlify = NetlifyClient(token=token)
    
    print("=== Netlify Sites ===")
    sites = netlify.list_sites()
    for s in sites:
        print(f"\n{s['name']}")
        print(f"  URL: {s['url']}")
        print(f"  Repo: {s.get('repo') or 'N/A'}")
        print(f"  Updated: {s['updated_at'][:10]}")
