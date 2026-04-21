import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  clear: () => void;
  hydrate: () => void;
}

const KEY_TOKENS = 'mp.tokens';
const KEY_USER = 'mp.user';

export const useAuth = create<AuthState>((set) => ({
  tokens: null,
  user: null,
  setSession: (tokens, user) => {
    Taro.setStorageSync(KEY_TOKENS, tokens);
    Taro.setStorageSync(KEY_USER, user);
    set({ tokens, user });
  },
  clear: () => {
    Taro.removeStorageSync(KEY_TOKENS);
    Taro.removeStorageSync(KEY_USER);
    set({ tokens: null, user: null });
  },
  hydrate: () => {
    try {
      const t = Taro.getStorageSync(KEY_TOKENS);
      const u = Taro.getStorageSync(KEY_USER);
      if (t && u) set({ tokens: t, user: u });
    } catch {
      // 首次启动无存储，忽略
    }
  },
}));
