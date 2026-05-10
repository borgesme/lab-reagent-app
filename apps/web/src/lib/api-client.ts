import type { AuthTokens } from '@app/shared';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let refreshInflight: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refreshToken = useAuth.getState().tokens?.refreshToken;
  if (!refreshToken) return null;
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as AuthTokens;
      useAuth.getState().setTokens(data);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

export async function apiFetch<T = any>(
  path: string,
  opts: { method?: string; body?: any; token?: string } = {},
): Promise<T> {
  const doFetch = (token?: string) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${apiBaseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await doFetch(opts.token);
  if (res.status === 401 && opts.token) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      useAuth.getState().clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
