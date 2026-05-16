import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AuthTokens, UserSummary } from '@app/shared';
import { uniStorage } from './persist.config';

export const useAuth = defineStore(
  'auth',
  () => {
    const tokens = ref<AuthTokens | null>(null);
    const user = ref<UserSummary | null>(null);
    const hydrated = ref(false);

    function setSession(t: AuthTokens, u: UserSummary) {
      tokens.value = t;
      user.value = u;
    }

    function setTokens(t: AuthTokens) {
      tokens.value = t;
    }

    function setUser(patch: Partial<UserSummary>) {
      if (!user.value) return;
      user.value = { ...user.value, ...patch };
    }

    function clear() {
      tokens.value = null;
      user.value = null;
    }

    return { tokens, user, hydrated, setSession, setTokens, setUser, clear };
  },
  {
    persist: [
      {
        key: 'mp.tokens',
        storage: uniStorage,
        pick: ['tokens'],
        afterHydrate: (ctx) => {
          (ctx.store as any).hydrated = true;
        },
      },
      {
        key: 'mp.user',
        storage: uniStorage,
        pick: ['user'],
      },
    ],
  },
);
