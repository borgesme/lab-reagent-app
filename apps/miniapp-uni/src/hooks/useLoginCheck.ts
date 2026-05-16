import { useAuth } from '@/stores/auth';

export function useLoginCheck() {
  const auth = useAuth();

  function checkLogin(
    callback: () => void | Promise<void>,
    url = '/pages/login/index',
  ) {
    if (!auth.tokens?.accessToken) {
      uni.navigateTo({ url });
      return;
    }
    callback();
  }

  return { checkLogin };
}
