# -*- coding: utf-8 -*-
"""TOF 网关直连客户端（表单编码 POST + token 加载）。

接口知识来源：xfz-survey 逆向调查产物（1989 接口目录 + 558 页实测抓包）。
网关统一 https://tof-gateway.tcl.com，路径形如 /api/{service}/v{ver}/{tenant}/{path}，
实测版本/租户段 = 18。

凭据解析（优先级从高到低）：
  1. 构造参数 auth_file（cash_query.py 的 --auth-file 透传）
  2. 环境变量 TOF_AUTH_JSON    → 指向 xfz-survey/auth.json（含 token + cookie）
  3. 环境变量 TOF_BEARER_TOKEN → 直接贴 token（浏览器 devtools 里 Authorization 头的值，
     带不带 bearer 前缀均可）

access token 有效期只有几小时：过期后本模块抛 AuthExpired，按提示更新凭据即可。
"""
import json
import os
from pathlib import Path

import requests

GATEWAY = 'https://tof-gateway.tcl.com'
TENANT_ID = '18'
_AUTH_HOST_KEY = 'tof-gateway.tcl.com'


class TofError(Exception):
    """TOF 直连通用错误（网络/网关/业务码）。"""


class AuthExpired(TofError):
    """401/403 或凭据缺失：token 过期，需重新获取。"""


def load_token(auth_file=None):
    """返回 (bearer_token, cookie_string)。找不到任何凭据时抛 AuthExpired。"""
    candidates = []
    if auth_file:
        candidates.append(Path(auth_file))
    env_file = os.environ.get('TOF_AUTH_JSON', '').strip()
    if env_file:
        candidates.append(Path(env_file))
    for p in candidates:
        if p.is_file():
            auth = json.loads(p.read_text(encoding='utf-8'))
            token = (auth.get('tokens') or {}).get(_AUTH_HOST_KEY) or auth.get('bearerToken') or ''
            if token and not token.lower().startswith('bearer'):
                token = 'bearer ' + token
            return token, auth.get('cookieString', '')
    env_token = os.environ.get('TOF_BEARER_TOKEN', '').strip()
    if env_token:
        if not env_token.lower().startswith('bearer'):
            env_token = 'bearer ' + env_token
        return env_token, ''
    raise AuthExpired(
        '找不到 TOF 凭据：请设置环境变量 TOF_AUTH_JSON（指向 xfz-survey/auth.json）'
        '或 TOF_BEARER_TOKEN（浏览器 devtools 里 Authorization 头的值）。'
        'token 几小时过期，过期后重新获取即可')


class TofClient:
    """最小可用客户端：自动拼租户号、带认证头、拆响应信封。"""

    def __init__(self, auth_file=None, gateway=GATEWAY, tenant=TENANT_ID, timeout=120):
        self.gateway = gateway.rstrip('/')
        self.tenant = tenant
        self.timeout = timeout
        token, cookie = load_token(auth_file)
        self._headers = {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0',
        }
        if token:
            self._headers['Authorization'] = token
            self._headers['xfz-token'] = token
        if cookie:
            self._headers['Cookie'] = cookie

    def url(self, path):
        """只替换第一个 {t}/{p} 占位符（版本/租户段）；末段占位符留给调用者填。"""
        for ph in ('{t}', '{p}'):
            if ph in path:
                path = path.replace(ph, self.tenant, 1)
                break
        return path if path.startswith('http') else self.gateway + path

    def post_form(self, path, data):
        """表单编码 POST。⚠️ 网关部分接口收 JSON body 会静默忽略筛选参数，
        必须用表单编码（与页面浏览器行为一致，见 xfz-survey 页面抓包）。"""
        try:
            resp = requests.post(self.url(path), data=data,
                                 headers=self._headers, timeout=self.timeout)
        except requests.exceptions.RequestException as e:
            raise TofError(f'网络请求失败（{type(e).__name__}）：{e}')
        if resp.status_code in (401, 403):
            raise AuthExpired(
                f'认证失效（HTTP {resp.status_code}）：token 已过期，'
                '请更新 TOF_BEARER_TOKEN 或 auth.json')
        resp.raise_for_status()
        ct = resp.headers.get('content-type', '')
        if 'json' not in ct:
            raise TofError(f'响应不是 JSON（content-type={ct}），疑似网关拦截页')
        return self._unwrap(resp.json())

    @staticmethod
    def _unwrap(data):
        """两种信封都认：{code,msg,data}（code 0/200 成功）与
        {success,code,message,data,traceId}（成功码以 0000 结尾）。"""
        if not (isinstance(data, dict) and 'code' in data and 'data' in data):
            return data
        code = data.get('code')
        ok = (code in (0, 200, '0', '200', 'SUCCESS', 'success', True)
              or data.get('success') is True
              or (isinstance(code, str) and code.endswith('0000')))
        if ok:
            return data['data']
        raise TofError(f'[{code}] {data.get("msg") or data.get("message") or ""}')
