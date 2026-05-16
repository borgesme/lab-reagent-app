import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import { apiRequest, tryRefresh } from '@/api/request';
import { ApiError } from '@/api/api-error';

type Handler = (opts: any) => { statusCode: number; data: any } | 'fail';

function mockUniRequest(handlers: Handler[]) {
  let i = 0;
  (uni.request as any).mockImplementation((opts: any) => {
    const h = handlers[i] ?? handlers[handlers.length - 1];
    i++;
    const result = h(opts);
    if (result === 'fail') {
      opts.fail?.({ errMsg: 'fail' });
    } else {
      opts.success?.(result);
    }
  });
}

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  (uni.request as any).mockReset();
});

describe('apiRequest 正常路径', () => {
  it('200 + code=200 解包 data', async () => {
    mockUniRequest([
      () => ({ statusCode: 200, data: { code: 200, msg: 'ok', data: { name: 'ok' } } }),
    ]);
    const r = await apiRequest<{ name: string }>('/x');
    expect(r.name).toBe('ok');
  });

  it('附带 Authorization header', async () => {
    useAuth().setSession(
      { accessToken: 'a1', refreshToken: 'r1' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const seen: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      seen.push(opts.header);
      opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: 1 } });
    });
    await apiRequest('/me');
    expect(seen[0]['Authorization']).toBe('Bearer a1');
  });
});

describe('apiRequest 错误路径', () => {
  it('HTTP statusCode 非 200 toast + throw', async () => {
    mockUniRequest([() => ({ statusCode: 500, data: null })]);
    await expect(apiRequest('/x')).rejects.toBeInstanceOf(ApiError);
    expect(uni.showToast).toHaveBeenCalled();
  });

  it('network fail → ApiError(0)', async () => {
    mockUniRequest([() => 'fail']);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 0 });
  });

  it('业务 code 非 200/401/403 → toast body.msg + throw', async () => {
    mockUniRequest([
      () => ({ statusCode: 200, data: { code: 500, msg: '业务异常', data: null } }),
    ]);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 500 });
  });

  it('body.code=403 → clear + reLaunch login', async () => {
    useAuth().setSession(
      { accessToken: 'a', refreshToken: 'r' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    mockUniRequest([
      () => ({ statusCode: 200, data: { code: 403, msg: 'forbidden', data: null } }),
    ]);
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 403 });
    expect(useAuth().tokens).toBeNull();
    expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });
});

describe('apiRequest 401 + tryRefresh', () => {
  it('body.code=401 → refresh 成功 → 用新 token 重放', async () => {
    useAuth().setSession(
      { accessToken: 'old', refreshToken: 'r1' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const seen: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      seen.push(opts);
      if (seen.length === 1) {
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else if (seen.length === 2) {
        opts.success?.({
          statusCode: 200,
          data: {
            code: 200,
            msg: 'ok',
            data: { accessToken: 'new', refreshToken: 'r2' },
          },
        });
      } else {
        opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: { ok: true } } });
      }
    });
    const r = await apiRequest<{ ok: boolean }>('/me');
    expect(r.ok).toBe(true);
    expect(seen).toHaveLength(3);
    expect(useAuth().tokens?.accessToken).toBe('new');
    expect(seen[2].header['Authorization']).toBe('Bearer new');
  });

  it('body.code=401 → refresh 失败 → clear + reLaunch login', async () => {
    useAuth().setSession(
      { accessToken: 'old', refreshToken: 'r1' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    let n = 0;
    (uni.request as any).mockImplementation((opts: any) => {
      n++;
      if (n === 1) {
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else {
        opts.success?.({
          statusCode: 200,
          data: { code: 401, msg: 'refresh expired', data: null },
        });
      }
    });
    await expect(apiRequest('/me')).rejects.toMatchObject({ code: 401 });
    expect(useAuth().tokens).toBeNull();
    expect(uni.reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });

  it('并发 401:tryRefresh 只触发一次', async () => {
    useAuth().setSession(
      { accessToken: 'old', refreshToken: 'r1' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    let refreshCount = 0;
    (uni.request as any).mockImplementation((opts: any) => {
      if (opts.url.endsWith('/auth/refresh')) {
        refreshCount++;
        setTimeout(() => {
          opts.success?.({
            statusCode: 200,
            data: {
              code: 200,
              msg: 'ok',
              data: { accessToken: 'new', refreshToken: 'r2' },
            },
          });
        }, 5);
      } else if ((opts.header['Authorization'] as string).endsWith('old')) {
        opts.success?.({ statusCode: 200, data: { code: 401, msg: 'expired', data: null } });
      } else {
        opts.success?.({ statusCode: 200, data: { code: 200, msg: 'ok', data: 'x' } });
      }
    });
    await Promise.all([apiRequest('/a'), apiRequest('/b')]);
    expect(refreshCount).toBe(1);
  });

  it('refresh 期间 store 被 clear → 不写回新 token', async () => {
    useAuth().setSession(
      { accessToken: 'old', refreshToken: 'r1' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    (uni.request as any).mockImplementation((opts: any) => {
      if (opts.url.endsWith('/auth/refresh')) {
        useAuth().clear();
        opts.success?.({
          statusCode: 200,
          data: {
            code: 200,
            msg: 'ok',
            data: { accessToken: 'new', refreshToken: 'r2' },
          },
        });
      }
    });
    const newToken = await tryRefresh();
    expect(newToken).toBeNull();
    expect(useAuth().tokens).toBeNull();
  });
});
