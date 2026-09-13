import { ConfigProvider, App as AntApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { antdTheme } from '@/theme/tokens';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { AdminLayout } from '@/layouts/AdminLayout';
import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import RoutesPage from '@/pages/routes';
import TracksPage from '@/pages/tracks';
import ChecklistsPage from '@/pages/checklists';
import LeadersPage from '@/pages/leaders';
import ToolsPage from '@/pages/tools';
import CommunityPage from '@/pages/community';
import TripsPage from '@/pages/trips';
import UsersPage from '@/pages/users';
import SafetyPage from '@/pages/safety';
import SystemPage from '@/pages/system';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RequireAuth() {
  const { user, ready } = useAuth();
  if (!ready) {
    return <Spin style={{ marginTop: 120, display: 'block' }} size="large" />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntApp>
        <QueryClientProvider client={qc}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<RequireAuth />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="routes" element={<RoutesPage />} />
                    <Route path="tracks" element={<TracksPage />} />
                    <Route path="checklists" element={<ChecklistsPage />} />
                    <Route path="leaders" element={<LeadersPage />} />
                    <Route path="tools" element={<ToolsPage />} />
                    <Route path="community" element={<CommunityPage />} />
                    <Route path="trips" element={<TripsPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="safety" element={<SafetyPage />} />
                    <Route path="system" element={<SystemPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
