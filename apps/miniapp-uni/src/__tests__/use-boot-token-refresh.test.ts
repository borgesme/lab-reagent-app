import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import {
  useBootTokenRefresh,
  __resetBootGuard,
} from '@/hooks/useBootTokenRefresh';

const LEGACY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.s';
const NEW = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsInZlciI6M30.s';

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  __resetBootGuard();
  (uni.request as any).mockReset();
});

describe('useBootTokenRefresh', () => {
  it('legacy token(缺 ver) → 触发 /auth/refresh', async () => {
    useAuth().setSession(
      { accessToken: LEGACY, refreshToken: 'r' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const calls: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      calls.push(opts.url);
      opts.success?.({
        statusCode: 200,
        data: {
          code: 200,
          msg: 'ok',
          data: { accessToken: NEW, refreshToken: 'r2' },
        },
      });
    });
    useBootTokenRefresh();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.some((u) => u.endsWith('/auth/refresh'))).toBe(true);
  });

  it('新 token(含 ver) → 不触发 refresh', async () => {
    useAuth().setSession(
      { accessToken: NEW, refreshToken: 'r' },
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const calls: any[] = [];
    (uni.request as any).mockImplementation((opts: any) => {
      calls.push(opts.url);
    });
    useBootTokenRefresh();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(0);
  });
});
