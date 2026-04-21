import Taro from '@tarojs/taro';
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
  const res = await Taro.request<T>({
    url: `${apiBaseUrl}${path}`,
    method: opts.method ?? 'GET',
    data: opts.data,
    header: {
      'Content-Type': 'application/json',
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  });
  if (res.statusCode === 401) {
    clear();
    Taro.reLaunch({ url: '/pages/login/index' });
    throw new Error('未登录或会话失效');
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg =
      typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    throw new Error(`API ${res.statusCode}: ${msg}`);
  }
  return res.data;
}
