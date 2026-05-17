import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia } from 'pinia';
import { pinia } from '@/stores';
import { useAuth } from '@/stores/auth';
import { useLoginCheck } from '@/hooks/useLoginCheck';

beforeEach(() => {
  setActivePinia(pinia);
  useAuth().clear();
  (uni.navigateTo as any).mockReset();
});

describe('useLoginCheck', () => {
  it('未登录 → navigateTo /pages-sub/login/index，不调 callback', () => {
    const { checkLogin } = useLoginCheck();
    const cb = vi.fn();
    checkLogin(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: '/pages-sub/login/index' });
  });

  it('已登录 → 调 callback，不导航', () => {
    useAuth().setSession(
      { accessToken: 'a', refreshToken: 'r' } as any,
      { id: 'u', name: 'n', email: 'e', roles: [] } as any,
    );
    const { checkLogin } = useLoginCheck();
    const cb = vi.fn();
    checkLogin(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(uni.navigateTo).not.toHaveBeenCalled();
  });
});
