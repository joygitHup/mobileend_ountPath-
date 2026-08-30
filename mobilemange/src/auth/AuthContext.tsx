import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  getStoredUser,
  getToken,
  isStaff,
  login as apiLogin,
  type AdminUser,
} from '@/api/client';

type AuthState = {
  user: AdminUser | null;
  token: string | null;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => void;
  ready: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const u = getStoredUser();
    return u && isStaff(u.role) ? u : null;
  });
  const [token, setToken] = useState<string | null>(() => getToken());

  const login = useCallback(async (phone: string, code: string) => {
    const data = await apiLogin(phone, code);
    setUser(data.user);
    setToken(data.token);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout, ready: true }),
    [user, token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
