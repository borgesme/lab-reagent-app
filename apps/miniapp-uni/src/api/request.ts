import type { ApiResponse, AuthTokens } from '@app/shared';
import { env } from '@/config/env';
import { useAuth } from '@/stores/auth';
import { i18n } from '@/locale';
import { ApiError } from './api-error';

const t = (key: string) => i18n.global.t(key);

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// @dcloudio/types 的 method 联合类型缺 PATCH (但 h5/mp 运行时支持)，借 uni.request 第一参的 method 类型做 cross-union as 通过
type UniRequestMethod = NonNullable<Parameters<typeof uni.request>[0]['method']>;

export interface ApiRequestOpts {
  method?: Method;
  data?: any;
  header?: Record<string, string>;
  timeout?: number;
}

let refreshInflight: Promise<string | null> | null = null;

export async function tryRefresh(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  const refreshToken = useAuth().tokens?.refreshToken;
  if (!refreshToken) return null;
  refreshInflight = new Promise<string | null>((resolve) => {
    uni.request({
      url: `${env.baseUrl}/auth/refresh`,
      method: 'POST',
      data: { refreshToken },
      header: { 'Content-Type': 'application/json' },
      timeout: 30_000,
      success: (res) => {
        if (res.statusCode !== 200) return resolve(null);
        const body = res.data as ApiResponse<AuthTokens>;
        if (body?.code !== 200 || !body.data) return resolve(null);
        if (!useAuth().tokens) return resolve(null);
        useAuth().setTokens(body.data);
        resolve(body.data.accessToken);
      },
      fail: () => resolve(null),
    });
  }).finally(() => {
    refreshInflight = null;
  }) as Promise<string | null>;
  return refreshInflight;
}

function doRequest<T>(
  path: string,
  opts: ApiRequestOpts,
  accessToken: string | null,
): Promise<{ statusCode: number; body: ApiResponse<T> | null }> {
  return new Promise((resolve) => {
    uni.request({
      url: `${env.baseUrl}${path}`,
      method: (opts.method ?? 'GET') as UniRequestMethod,
      data: opts.data,
      header: {
        'Content-Type': 'application/json',
        ...(opts.header ?? {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: opts.timeout ?? 30_000,
      success: (res) => {
        resolve({
          statusCode: res.statusCode,
          body: res.data as ApiResponse<T> | null,
        });
      },
      fail: () => {
        resolve({ statusCode: 0, body: null });
      },
    });
  });
}

export async function apiRequest<T = any>(
  path: string,
  opts: ApiRequestOpts = {},
): Promise<T> {
  const accessToken = useAuth().tokens?.accessToken ?? null;
  let res = await doRequest<T>(path, opts, accessToken);

  if (res.statusCode === 0) {
    uni.showToast({ title: t('toast.networkError'), icon: 'none' });
    throw new ApiError(0, 'network error');
  }
  if (res.statusCode !== 200) {
    uni.showToast({ title: t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(res.statusCode, `HTTP ${res.statusCode}`);
  }

  let body = res.body;
  if (!body) {
    uni.showToast({ title: t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(-1, 'empty body');
  }

  if (body.code === 401 && accessToken) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doRequest<T>(path, opts, newToken);
      body = res.body;
      if (res.statusCode === 200 && body?.code === 200) {
        return body.data as T;
      }
    }
    useAuth().clear();
    uni.showToast({ title: t('toast.sessionExpired'), icon: 'none' });
    uni.reLaunch({ url: '/pages-sub/login/index' });
    throw new ApiError(401, 'session expired');
  }

  if (body.code === 403) {
    useAuth().clear();
    uni.showToast({ title: t('toast.sessionExpired'), icon: 'none' });
    uni.reLaunch({ url: '/pages-sub/login/index' });
    throw new ApiError(403, body.msg ?? 'forbidden');
  }

  if (body.code !== 200) {
    uni.showToast({ title: body.msg ?? t('toast.requestFailed'), icon: 'none' });
    throw new ApiError(body.code, body.msg ?? 'business error');
  }

  return body.data as T;
}
