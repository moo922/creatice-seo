import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUserDto, LoginResponseDto } from '@creative-seo/types';
import { api, setAccessToken, setOnUnauthorized } from './api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUserDto | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUserDto | null>(null);

  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    });
  }, []);

  // On first load, try the refresh cookie; if it fails the user is anonymous.
  useEffect(() => {
    let cancelled = false;
    api
      .post<LoginResponseDto>('/auth/refresh')
      .then((data) => {
        if (cancelled) return;
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponseDto>('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      hasPermission: (permission: string) => user?.permissions.includes(permission as never) ?? false,
    }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
