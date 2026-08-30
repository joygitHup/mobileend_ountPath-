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
import { setAuthInvalidHandler } from '@/utils/api';
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
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(AUTH_TOKEN_KEY),
          AsyncStorage.getItem(AUTH_USER_KEY),
        ]);
        if (cancelled) return;
        if (t && u) {
          try {
            setToken(t);
            setUser(JSON.parse(u) as UserOut);
          } catch {
            setToken(null);
            setUser(null);
            await clearStoredAuth();
          }
        } else if (t || u) {
          setToken(null);
          setUser(null);
          await clearStoredAuth();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
