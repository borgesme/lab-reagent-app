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
      if (!useAuth.getState().tokens) return null;
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

export interface ApiFetchOpts {
  method?: string;
  body?: any;
  token?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** 默认 30000ms。传 0 禁用 timeout。 */
  timeoutMs?: number;
}

export async function apiFetchRaw(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<Response> {
  const buildSignal = (): AbortSignal | undefined => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const signals: AbortSignal[] = [];
    if (opts.signal) signals.push(opts.signal);
    if (timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
    if (signals.length === 0) return undefined;
    if (signals.length === 1) return signals[0];
    return (AbortSignal as any).any(signals);
  };

  const doFetch = (token?: string) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${apiBaseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: buildSignal(),
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
  return res;
}

export async function apiFetch<T = any>(
  path: string,
  opts: ApiFetchOpts = {},
): Promise<T> {
  const res = await apiFetchRaw(path, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
