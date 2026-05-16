import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import type { AuthTokens, UserSummary } from '@app/shared';

const tokens: AuthTokens = { accessToken: 'a1', refreshToken: 'r1' };
const user: UserSummary = {
  id: 'u1',
  email: 'admin@lab.local',
  name: 'Admin',
  roles: ['SYS_ADMIN'],
} as any;

describe('useAuth store', () => {
  beforeEach(() => {
    setActivePinia(pinia);
    const auth = useAuth();
    auth.clear();
  });

  it('setSession 写入 tokens + user', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    expect(auth.tokens).toEqual(tokens);
    expect(auth.user).toEqual(user);
  });

  it('setTokens 只更 tokens 不动 user', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.setTokens({ accessToken: 'a2', refreshToken: 'r2' });
    expect(auth.tokens?.accessToken).toBe('a2');
    expect(auth.user?.id).toBe('u1');
  });

  it('setUser 合并 patch', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.setUser({ name: 'Alice' });
    expect(auth.user?.name).toBe('Alice');
    expect(auth.user?.email).toBe('admin@lab.local');
  });

  it('clear 重置两个字段', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    auth.clear();
    expect(auth.tokens).toBeNull();
    expect(auth.user).toBeNull();
  });

  it('persist 写入 mp.tokens / mp.user 两个 key', () => {
    const auth = useAuth();
    auth.setSession(tokens, user);
    (auth as any).$persist();
    const stored = uni.getStorageSync('mp.tokens');
    const storedUser = uni.getStorageSync('mp.user');
    expect(stored).toContain('accessToken');
    expect(storedUser).toContain('admin@lab.local');
  });
});
