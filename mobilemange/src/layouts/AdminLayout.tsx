import { useMemo, useState } from 'react';
import { Avatar, Dropdown, Layout, Menu, Tag, theme } from 'antd';
import {
  DashboardOutlined,
  CompassOutlined,
  NodeIndexOutlined,
  CheckSquareOutlined,
  TeamOutlined,
  ToolOutlined,
  CommentOutlined,
  UserOutlined,
  AlertOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { brand, routeMeta } from '@/theme/tokens';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '运营概览' },
  {
    type: 'group' as const,
    label: '内容运营',
    children: [
      { key: '/routes', icon: <CompassOutlined />, label: '路线管理' },
      { key: '/tracks', icon: <NodeIndexOutlined />, label: '轨迹管理' },
      { key: '/checklists', icon: <CheckSquareOutlined />, label: '清单模板' },
      { key: '/leaders', icon: <TeamOutlined />, label: '认证领队' },
      { key: '/tools', icon: <ToolOutlined />, label: '工具箱' },
    ],
  },
  {
    type: 'group' as const,
    label: '治理与安全',
    children: [
      { key: '/community', icon: <CommentOutlined />, label: '社区审核' },
      { key: '/users', icon: <UserOutlined />, label: '用户治理' },
      { key: '/safety', icon: <AlertOutlined />, label: '安全运营台' },
    ],
  },
  {
    type: 'group' as const,
    label: '系统',
    children: [
      { key: '/system', icon: <SettingOutlined />, label: '系统与合规' },
    ],
  },
];

function matchMeta(pathname: string) {
  if (pathname === '/') return routeMeta['/'];
  const hit = Object.keys(routeMeta)
    .filter((k) => k !== '/')
    .find((k) => pathname.startsWith(k));
  return hit ? routeMeta[hit] : routeMeta['/'];
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);

  const meta = useMemo(() => matchMeta(location.pathname), [location.pathname]);

  const selected =
    location.pathname === '/'
      ? '/'
      : Object.keys(routeMeta)
          .filter((k) => k !== '/')
          .find((k) => location.pathname.startsWith(k)) || location.pathname;

  const roleColor =
    user?.role === 'admin' ? 'gold' : user?.role === 'ops' ? 'green' : 'default';

  return (
    <Layout className="admin-shell" style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={72}
        width={232}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div className="admin-brand">
          <span className="admin-brand__mark">山</span>
          {!collapsed && (
            <div className="admin-brand__text">
              <span className="admin-brand__name">山途运营</span>
              <span className="admin-brand__sub">MountPath Admin</span>
            </div>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 0 }}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <div className="admin-header__crumb">
            <span className="admin-header__crumb-title">山途运营控制台</span>
            <span className="admin-header__crumb-desc">{meta.title} · {meta.desc}</span>
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: () => {
                    logout();
                    navigate('/login');
                  },
                },
              ],
            }}
          >
            <div className="admin-user">
              <Avatar
                size={32}
                src={user?.avatar_url}
                style={{ background: brand.primary }}
                icon={<UserOutlined />}
              />
              <div className="admin-user__meta">
                <span className="admin-user__name">{user?.name || '运营账号'}</span>
                <span className="admin-user__role">
                  <Tag color={roleColor} style={{ marginInlineEnd: 6, lineHeight: '18px' }}>
                    {user?.role}
                  </Tag>
                  {user?.phone}
                </span>
              </div>
            </div>
          </Dropdown>
        </Header>
        <Content className="admin-content" style={{ background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
