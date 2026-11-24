import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const authKey = ['auth', 'me'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: authKey,
    queryFn: async () => (await apiRequest<{ user: AuthUser }>('/auth/me')).user,
    retry: false,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isLoading,
      async signIn(email, password) {
        const result = await apiRequest<{ user: AuthUser }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        queryClient.setQueryData(authKey, result.user);
        return result.user;
      },
      async signOut() {
        await apiRequest<void>('/auth/logout', { method: 'POST' });
        queryClient.setQueryData(authKey, null);
      },
    }),
    [data, isLoading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
