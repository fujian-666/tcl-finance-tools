# -*- coding: utf-8 -*-
"""TOF token 自动续期（免登）。

原理与 xfz-sdk/xfz.py 的 cmd_refresh 一致：打开带持久化用户配置的 Chromium
（SSO cookie 长效），访问 tof.tcl.com，嗅探所有请求的 Authorization 头——
前端 boot 时必然请求 tof-gateway.tcl.com，把捕获到的最新 token 与 cookie
写回凭据文件。全程无需人工登录；仅当 SSO 登录态本身也过期（少见）时浏览器
会停在登录页，此时用 --renew-headful 弹出可见浏览器手动登录一次即可恢复。

凭据落点（与 client.py 的读取优先级一致）：
    --auth-file 透传 > TOF_AUTH_JSON > %LOCALAPPDATA%\tcl-finance-tools\tof-auth.json

浏览器配置目录：TOF_BROWSER_PROFILE 覆盖，默认
%LOCALAPPDATA%\tcl-finance-tools\tof-profile（仓外，不进版本库）。
首次续期会在该目录落一份浏览器配置；只要 SSO cookie 有效，之后一直免登。
"""
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from client import AuthExpired, TofError

AUTH_HOST = 'tof-gateway.tcl.com'
START_URL = 'https://tof.tcl.com/'
CAPTURE_WAIT_SECONDS = 45    # headless：等网关请求出现的上限（免登应秒级）
HEADFUL_WAIT_SECONDS = 300   # headful：留给人工登录 SSO 的时间
SETTLE_SECONDS = 6           # 捕获后再等一会，让 401→静默刷新轮转完，取最新 token


def cred_root():
    root = os.environ.get('LOCALAPPDATA') or str(Path.home())
    return Path(root) / 'tcl-finance-tools'


def default_auth_file():
    """未配置文件凭据时的续期缓存落点（client.py 读数的最后一级候选）。"""
    return cred_root() / 'tof-auth.json'


def default_profile_dir():
    env = os.environ.get('TOF_BROWSER_PROFILE', '').strip()
    return Path(env) if env else cred_root() / 'tof-profile'


def target_auth_file(auth_file=None):
    """续期结果写到哪：优先写配置指向的文件，保持配置单一事实源。"""
    if auth_file:
        return Path(auth_file)
    env = os.environ.get('TOF_AUTH_JSON', '').strip()
    if env:
        return Path(env)
    return default_auth_file()


def available():
    """本机是否具备自动续期条件（装了 playwright 即可）。"""
    try:
        import playwright  # noqa: F401
        return True
    except ImportError:
        return False


def renew_auth(auth_file=None, headless=True, profile_dir=None):
    """跑一次免登续期，返回写入的凭据文件路径。

    失败抛 AuthExpired（SSO 停在登录页等），提示用 --renew-headful 手动登录。
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise TofError('本机未安装 playwright，无法自动续期（uv add playwright）')

    profile = Path(profile_dir) if profile_dir else default_profile_dir()
    profile.mkdir(parents=True, exist_ok=True)
    captured = {}
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(profile), headless=headless,
            args=['--no-sandbox'], viewport={'width': 1440, 'height': 900})
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        def on_req(req):
            a = req.headers.get('authorization', '')
            if a:
                captured[urlparse(req.url).netloc] = a    # 留最后一次出现的（最新）

        page.on('request', on_req)
        try:
            page.goto(START_URL, wait_until='domcontentloaded', timeout=60000)
        except Exception:
            pass
        deadline = time.time() + (HEADFUL_WAIT_SECONDS if not headless
                                  else CAPTURE_WAIT_SECONDS)
        while time.time() < deadline and AUTH_HOST not in captured:
            time.sleep(1)
        if AUTH_HOST in captured:
            time.sleep(SETTLE_SECONDS)
        cookies = ctx.cookies()
        ctx.close()

    if AUTH_HOST not in captured:
        raise AuthExpired(
            '自动续期失败：没嗅探到网关 token，SSO 登录态可能已过期（浏览器停在登录页）。'
            '用 --renew-headful 重跑一次，在弹出的浏览器里手动登录 SSO 后即可恢复')

    token = captured[AUTH_HOST]
    out = target_auth_file(auth_file)
    auth = {}
    if out.is_file():
        try:
            auth = json.loads(out.read_text(encoding='utf-8'))
        except Exception:
            auth = {}
    auth.setdefault('tokens', {})[AUTH_HOST] = token
    auth['bearerToken'] = token
    auth['cookieString'] = '; '.join(f"{c['name']}={c['value']}" for c in cookies)
    auth['savedAt'] = datetime.now(timezone.utc).isoformat()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(auth, ensure_ascii=False, indent=2), encoding='utf-8')
    return out


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='TOF token 免登续期（可单独运行调试）')
    ap.add_argument('--auth-file', default='', help='凭据文件（默认 TOF_AUTH_JSON 或缓存路径）')
    ap.add_argument('--headful', action='store_true', help='弹出可见浏览器（SSO 过期时手动登录）')
    args = ap.parse_args()
    print(renew_auth(auth_file=args.auth_file or None, headless=not args.headful))
