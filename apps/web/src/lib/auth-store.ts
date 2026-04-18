'use client';
import { create } from 'zustand';
import type { AuthTokens, UserSummary } from '@app/shared';

interface AuthState {
  tokens: AuthTokens | null;
  user: UserSummary | null;
  setSession: (tokens: AuthTokens, user: UserSummary) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  tokens: null,
  user: null,
  setSession: (tokens, user) => set({ tokens, user }),
  clear: () => set({ tokens: null, user: null }),
}));
