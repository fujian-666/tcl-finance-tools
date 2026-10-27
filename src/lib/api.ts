/**
 * 统一 API 请求封装
 * 会话令牌由登录接口（POST /api/auth/login）校验 ADMIN_PASSWORD 后签发，
 * 存入 localStorage。不再使用 VITE 环境变量，避免密钥进入浏览器构建产物。
 */
const TOKEN_KEY = 'tcl_admin_session_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) {
    headers.set('x-auth-token', token);
  }
  const res = await fetch(input, { ...init, headers });
  // 会话失效：清除本地令牌并跳转登录页（登录接口本身除外）
  if (res.status === 401 && !String(input).includes('/api/auth/login')) {
    clearToken();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }
  return res;
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: '网络错误' }));
  if (data.ok && data.token) {
    setToken(data.token);
    return { ok: true };
  }
  return { ok: false, error: data.error || '登录失败' };
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': token } });
    } catch { /* 忽略网络错误，本地令牌始终清除 */ }
  }
  clearToken();
}
