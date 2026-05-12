import Taro from '@tarojs/taro';
import type { ApiResponse } from '@app/shared';
import { useAuth } from './auth-store';

export const apiBaseUrl =
  (process.env.TARO_APP_API_BASE as string | undefined) ??
  'http://localhost:3001/api/v1';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function apiRequest<T = any>(
  path: string,
  opts: { method?: Method; data?: any } = {},
): Promise<T> {
  const { tokens, clear } = useAuth.getState();
  const res = await Taro.request<ApiResponse<T>>({
    url: `${apiBaseUrl}${path}`,
    method: opts.method ?? 'GET',
    data: opts.data,
    header: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`API ${res.statusCode}`);
  }
  const body = res.data as ApiResponse<T>;
  if (body.code === 401) {
    clear();
    Taro.reLaunch({ url: '/pages/login/index' });
    throw new Error('未登录或会话失效');
  }
  if (body.code !== 200) {
    throw new Error(body.msg || `API code ${body.code}`);
  }
  return body.data as T;
}
