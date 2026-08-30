import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/utils/api';

type NotificationContextValue = {
  unreadCount: number;
  communityNewCount: number;
  refreshUnread: () => Promise<void>;
  refreshCommunityNew: () => Promise<void>;
  refreshAll: () => Promise<void>;
  clearUnreadLocal: () => void;
  clearCommunityNewLocal: () => void;
  markCommunitySeen: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [communityNewCount, setCommunityNewCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetchApi<{ data: { count: number } }>(
        '/api/v1/me/notifications/unread-count'
      );
      setUnreadCount(res.data?.count ?? 0);
    } catch {
      // keep previous
    }
  }, [isAuthenticated]);

  const refreshCommunityNew = useCallback(async () => {
    if (!isAuthenticated) {
      setCommunityNewCount(0);
      return;
    }
    try {
      const res = await fetchApi<{ data: { count: number } }>(
        '/api/v1/me/community/new-count'
      );
      setCommunityNewCount(res.data?.count ?? 0);
    } catch {
      // keep previous
    }
  }, [isAuthenticated]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshUnread(), refreshCommunityNew()]);
  }, [refreshUnread, refreshCommunityNew]);

  const clearUnreadLocal = useCallback(() => setUnreadCount(0), []);
  const clearCommunityNewLocal = useCallback(() => setCommunityNewCount(0), []);

  const markCommunitySeen = useCallback(async () => {
    clearCommunityNewLocal();
    if (!isAuthenticated) return;
    try {
      await fetchApi('/api/v1/me/community/seen', { method: 'POST' });
    } catch {
      // ignore
    }
  }, [isAuthenticated, clearCommunityNewLocal]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAll();
    });
    const timer = setInterval(() => {
      void refreshAll();
    }, 20000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [isAuthenticated, refreshAll]);

  const value = useMemo(
    () => ({
      unreadCount,
      communityNewCount,
      refreshUnread,
      refreshCommunityNew,
      refreshAll,
      clearUnreadLocal,
      clearCommunityNewLocal,
      markCommunitySeen,
    }),
    [
      unreadCount,
      communityNewCount,
      refreshUnread,
      refreshCommunityNew,
      refreshAll,
      clearUnreadLocal,
      clearCommunityNewLocal,
      markCommunitySeen,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    return {
      unreadCount: 0,
      communityNewCount: 0,
      refreshUnread: async () => undefined,
      refreshCommunityNew: async () => undefined,
      refreshAll: async () => undefined,
      clearUnreadLocal: () => undefined,
      clearCommunityNewLocal: () => undefined,
      markCommunitySeen: async () => undefined,
    } satisfies NotificationContextValue;
  }
  return ctx;
}
