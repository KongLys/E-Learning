'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { authApi } from '@/lib/api/auth.api';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        Cookies.set('accessToken', accessToken, { path: '/', sameSite: 'lax' });
        set({ accessToken });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login({ email, password });
          get().setTokens(data.accessToken, data.refreshToken);
          set({ user: data.user, isLoading: false });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        Cookies.remove('accessToken', { path: '/' });
        set({ user: null, accessToken: null });
      },

      refreshUser: async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        try {
          const { data } = await authApi.me();
          set({ user: data, accessToken: token });
        } catch {
          set({ user: null, accessToken: null });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
    },
  ),
);
