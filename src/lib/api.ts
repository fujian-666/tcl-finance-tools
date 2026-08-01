/**
 * 统一 API 请求封装
 * 自动携带管理后台鉴权令牌（x-auth-token）
 */
const AUTH_TOKEN = import.meta.env.VITE_ADMIN_AUTH_TOKEN || '';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (AUTH_TOKEN) {
    headers.set('x-auth-token', AUTH_TOKEN);
  }
  return fetch(input, { ...init, headers });
}

export { AUTH_TOKEN };