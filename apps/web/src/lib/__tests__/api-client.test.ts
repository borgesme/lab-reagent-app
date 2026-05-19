import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiFetchRaw } from '../api-client';
import { ApiError } from '../api-error';
import { useAuth } from '../auth-store';

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const wrap = (data: any, status = 200) =>
  json({ code: 200, msg: 'ok', data }, status);

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuth.setState({
      tokens: { accessToken: 'a1', refreshToken: 'r1' } as any,
      user: null,
      hydrated: true,
    });
  });

  it('attaches bearer token when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(wrap({}));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/health', { token: 'abc' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer abc');
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('err', { status: 500 })),
    );
    await expect(apiFetch('/x', { token: 'abc' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('body.code !== 200 抛 ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        json({ code: 409, msg: 'email already registered', data: null }),
      ),
    );
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('body.code=401 触发 tryRefresh, refresh 成功后用新 token 重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ code: 401, msg: 'expired', data: null }),
      )
      .mockResolvedValueOnce(
        wrap({ accessToken: 'new', refreshToken: 'r2' }),
      )
      .mockResolvedValueOnce(wrap({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await apiFetch<{ ok: boolean }>('/me', { token: 'old' });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const lastCall = fetchMock.mock.calls[2][1] as RequestInit;
    expect((lastCall.headers as any).Authorization).toBe('Bearer new');
  });

  it('401 → refresh 200 → retry 200 → 返回 data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 401, msg: 'unauth', data: null }))
      .mockResolvedValueOnce(wrap({ accessToken: 'a2', refreshToken: 'r2' }))
      .mockResolvedValueOnce(wrap({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await apiFetch<{ ok: boolean }>('/me', { token: 'a1' });
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retryHeaders['Authorization']).toBe('Bearer a2');
    expect(useAuth.getState().tokens?.accessToken).toBe('a2');
  });

  it('401 → refresh 401 → clear store 并跳转 /login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: 401, msg: 'unauth', data: null }))
      .mockResolvedValueOnce(
        json({ code: 401, msg: 'refresh failed', data: null }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        get href() {
          return '';
        },
        set href(v: string) {
          hrefSetter(v);
        },
      },
      configurable: true,
    });

    await expect(apiFetch('/me', { token: 'a1' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(useAuth.getState().tokens).toBeNull();
    expect(hrefSetter).toHaveBeenCalledWith('/login');
  });

  it('两个并发 401 只触发一次 /auth/refresh', async () => {
    let bizCallCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh'))
        return wrap({ accessToken: 'a2', refreshToken: 'r2' });
      bizCallCount++;
      if (bizCallCount <= 2)
        return json({ code: 401, msg: 'u', data: null });
      return wrap({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      apiFetchRaw('/x', { token: 'a1' }),
      apiFetchRaw('/y', { token: 'a1' }),
    ]);
    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/auth/refresh'),
    );
    expect(refreshCalls.length).toBe(1);
  });

  it('refresh 期间 store 被 clear, 不写回新 tokens (P3-3)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        useAuth.getState().clear();
        return wrap({ accessToken: 'a2', refreshToken: 'r2' });
      }
      return json({ code: 401, msg: 'u', data: null });
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      configurable: true,
    });

    await expect(apiFetch('/x', { token: 'a1' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(useAuth.getState().tokens).toBeNull();
  });
});
