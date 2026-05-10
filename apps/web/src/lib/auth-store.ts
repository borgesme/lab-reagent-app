'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  hydrated: boolean;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  setTokens: (tokens: AuthTokens) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      tokens: null,
      user: null,
      hydrated: false,
      setSession: (tokens, user) => set({ tokens, user }),
      setTokens: (tokens) => set({ tokens }),
      clear: () => set({ tokens: null, user: null }),
    }),
    {
      name: 'auth-store-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tokens: s.tokens, user: s.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
