import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchApi, setAuthInvalidHandler } from '@/utils/api';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearStoredAuth,
  getStoredToken as readStoredToken,
} from '@/utils/authStorage';
import { stopGuardHeartbeat } from '@/utils/guardHeartbeat';

export interface UserOut {
  id: string;
  name: string;
  phone?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: UserOut | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user?: UserOut) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<UserOut>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    stopGuardHeartbeat();
    setToken(null);
    setUser(null);
    await clearStoredAuth();
  }, []);

  useEffect(() => {
    setAuthInvalidHandler(() => {
      stopGuardHeartbeat();
      setToken(null);
      setUser(null);
    });
    return () => setAuthInvalidHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const safety = setTimeout(() => {
      if (!cancelled) setIsLoading(false);
    }, 8000);
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(AUTH_USER_KEY),
        ]);
        if (cancelled) return;

        if (!(t && u)) {
          if (t || u) await clearStoredAuth();
          setToken(null);
          setUser(null);
          return;
        }

        let cached: UserOut | null = null;
        try {
          cached = JSON.parse(u) as UserOut;
        } catch {
          await clearStoredAuth();
          setToken(null);
          setUser(null);
          return;
        }

        // 用本地 token 请求 /me；401 由 fetchApi 清会话。网络失败则暂用缓存，避免误踢下线。
        try {
          const res = await fetchApi<{
            data: { id: string; name: string; avatar_url?: string; phone?: string };
          }>('/api/v1/me/profile');
          if (cancelled) return;
          const next: UserOut = {
            id: res.data.id,
            name: res.data.name,
            avatar_url: res.data.avatar_url ?? cached.avatar_url,
            phone: res.data.phone ?? cached.phone,
          };
          setToken(t);
          setUser(next);
          await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
        } catch {
          if (cancelled) return;
          const stillHas = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
          if (!stillHas) {
            setToken(null);
            setUser(null);
            return;
          }
          setToken(t);
          setUser(cached);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, []);

  const login = useCallback(async (nextToken: string, nextUser?: UserOut) => {
    if (!nextUser?.id) {
      throw new Error('登录缺少用户信息');
    }
    setToken(nextToken);
    setUser(nextUser);
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, nextToken);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
  }, []);

  const updateUser = useCallback((userData: Partial<UserOut>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...userData };
      void AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      login,
      logout,
      updateUser,
    }),
    [user, token, isLoading, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export async function getStoredToken(): Promise<string | null> {
  return readStoredToken();
}
