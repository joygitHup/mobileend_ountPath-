import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SeasonThemeProvider } from '@/contexts/SeasonThemeContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { type ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebOnlyColorSchemeUpdater } from './ColorSchemeUpdater';
import { WebOnlyPrettyScrollbar } from './PrettyScrollbar';
import { MobileShell } from './MobileShell';
import { ConfirmModalHost } from './ConfirmModalHost';
import { HeroUINativeProvider } from '@/heroui';
import {
  initGuardHeartbeat,
  resumeGuardHeartbeatIfNeeded,
  stopGuardHeartbeat,
} from '@/utils/guardHeartbeat';
import { initDepartureRemindWatcher } from '@/utils/departureRemind';

function RuntimeServices({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    initGuardHeartbeat();
    initDepartureRemindWatcher();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      void resumeGuardHeartbeatIfNeeded();
    } else {
      stopGuardHeartbeat();
    }
  }, [isLoading, isAuthenticated]);

  return <>{children}</>;
}

function Provider({ children }: { children: ReactNode }) {
  return (
    <WebOnlyColorSchemeUpdater>
      <WebOnlyPrettyScrollbar>
        <SeasonThemeProvider>
          <AuthProvider>
            <NotificationProvider>
              <RuntimeServices>
                <MobileShell>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <HeroUINativeProvider>{children}</HeroUINativeProvider>
                  </GestureHandlerRootView>
                  <ConfirmModalHost />
                </MobileShell>
              </RuntimeServices>
            </NotificationProvider>
          </AuthProvider>
        </SeasonThemeProvider>
      </WebOnlyPrettyScrollbar>
    </WebOnlyColorSchemeUpdater>
  );
}

export { Provider };
