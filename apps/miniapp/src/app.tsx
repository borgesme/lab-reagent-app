import { PropsWithChildren, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { useAuth } from './lib/auth-store';

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    useAuth.getState().hydrate();
  }, []);

  const tokens = useAuth((s) => s.tokens);
  useEffect(() => {
    if (tokens) return;
    const current = Taro.getCurrentInstance().router?.path;
    if (current && !current.includes('/pages/login/')) {
      Taro.reLaunch({ url: '/pages/login/index' });
    }
  }, [tokens]);

  return children as any;
}

export default App;
