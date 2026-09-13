import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  fetchAdminMe,
  getStoredUser,
  getToken,
  isStaff,
  login as apiLogin,
  setSession,
  setUnauthorizedHandler,
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
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = getToken();
      const cached = getStoredUser();
      if (!t || !cached || !isStaff(cached.role)) {
        clearSession();
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setReady(true);
        }
        return;
      }
      try {
        const me = await fetchAdminMe();
        if (cancelled) return;
        if (!isStaff(me.role)) {
          clearSession();
          setUser(null);
          setToken(null);
        } else {
          setSession(t, me);
          setUser(me);
          setToken(t);
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (phone: string, code: string) => {
    const data = await apiLogin(phone, code);
    setUser(data.user);
    setToken(data.token);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout, ready }),
    [user, token, login, logout, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
