import type { ReactNode } from 'react';
import { Card, Col, Progress, Row, Spin, Statistic } from 'antd';
import {
  AlertOutlined,
  CompassOutlined,
  CommentOutlined,
  TeamOutlined,
  UserOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  NodeIndexOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { brand } from '@/theme/tokens';
import { StatAccent } from '@/components/PageChrome';

type Summary = {
  routes: number;
  posts: number;
  hidden_posts: number;
  leaders: number;
  tools: number;
  users: number;
  active_guards: number;
  sos_records: number;
  trips_planned: number;
  trips_active: number;
  trips_completed: number;
};

type Insights = {
  unanswered_questions: number;
  safety_score_dist: { label: string; count: number }[];
  published_tracks: number;
  official_tracks: number;
};

function MetricCard({
  title,
  value,
  suffix,
  icon,
  accent = brand.primary,
  alert,
  onClick,
}: {
  title: string;
  value: number | string;
  suffix?: string;
  icon?: ReactNode;
  accent?: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`stat-card ${alert ? 'stat-card--alert' : ''}`}
      bordered
      hoverable={!!onClick}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <StatAccent color={accent} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Statistic
          title={<span style={{ color: brand.textMuted }}>{title}</span>}
          value={value}
          suffix={suffix}
          valueStyle={{
            color: alert ? brand.danger : brand.text,
            fontWeight: 700,
            fontSize: 28,
          }}
        />
        {icon ? (
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: alert ? 'rgba(196,69,54,0.1)' : 'rgba(45,106,79,0.1)',
              color: alert ? brand.danger : brand.primary,
              fontSize: 16,
            }}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const summary = useQuery({
    queryKey: ['admin-summary'],
    queryFn: () => api<Summary>('/api/v1/admin/dashboard/summary'),
    refetchInterval: 30_000,
  });
  const insights = useQuery({
    queryKey: ['admin-insights'],
    queryFn: () => api<Insights>('/api/v1/admin/dashboard/insights'),
    refetchInterval: 30_000,
  });

  if (summary.isLoading || insights.isLoading) {
    return <Spin style={{ marginTop: 80, display: 'block' }} size="large" />;
  }

  const s = summary.data!;
  const i = insights.data!;
  const tripTotal = s.trips_planned + s.trips_active + s.trips_completed || 1;
  const safetyMax = Math.max(1, ...(i.safety_score_dist || []).map((b) => b.count));

  return (
    <div>
      <div className="dash-hero">
        <h2 className="dash-hero__title">今日运营态势</h2>
        <p className="dash-hero__sub">
          点击指标可进入对应处置台 · 数据来自 mobileback 实时库
        </p>
      </div>

      <div className="dash-section-title">安全优先</div>
      <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title="进行中守护"
            value={s.active_guards}
            icon={<AlertOutlined />}
            accent={brand.danger}
            alert={s.active_guards > 0}
            onClick={() => navigate('/safety?tab=guard&status=open')}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title="SOS 待处置"
            value={s.sos_records}
            icon={<AlertOutlined />}
            accent={brand.danger}
            alert={s.sos_records > 0}
            onClick={() => navigate('/safety?tab=sos')}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <MetricCard
            title="未答疑问题"
            value={i.unanswered_questions}
            icon={<QuestionCircleOutlined />}
            accent={brand.amberDeep}
            alert={i.unanswered_questions > 0}
            onClick={() => navigate('/community?filter=unanswered')}
          />
        </Col>
      </Row>

      <div className="dash-section-title">内容与用户</div>
      <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="路线"
            value={s.routes}
            icon={<CompassOutlined />}
            onClick={() => navigate('/routes')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="用户"
            value={s.users}
            icon={<UserOutlined />}
            onClick={() => navigate('/users')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="帖子"
            value={s.posts}
            suffix={s.hidden_posts ? `/ 隐 ${s.hidden_posts}` : undefined}
            icon={<CommentOutlined />}
            onClick={() => navigate('/community')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="领队"
            value={s.leaders}
            icon={<TeamOutlined />}
            onClick={() => navigate('/leaders')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="社区轨迹"
            value={i.published_tracks}
            suffix={`/ 官方 ${i.official_tracks}`}
            icon={<NodeIndexOutlined />}
            onClick={() => navigate('/tracks')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="工具"
            value={s.tools}
            icon={<CheckCircleOutlined />}
            onClick={() => navigate('/tools')}
          />
        </Col>
        <Col xs={12} md={8} lg={6}>
          <MetricCard
            title="进行中行程"
            value={s.trips_active}
            icon={<ScheduleOutlined />}
            accent={brand.primary}
            alert={s.trips_active > 0}
            onClick={() => navigate('/trips?status=active')}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card
            title="行程漏斗"
            className="stat-card"
            hoverable
            onClick={() => navigate('/trips')}
            styles={{ header: { borderBottom: `1px solid ${brand.border}` } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: '计划中', value: s.trips_planned, color: brand.amberDeep, status: 'planned' },
                { label: '进行中', value: s.trips_active, color: brand.primary, status: 'active' },
                { label: '已完成(累计表外)', value: s.trips_completed, color: brand.moss, status: '' },
              ].map((row) => (
                <div
                  key={row.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (row.status) navigate(`/trips?status=${row.status}`);
                    else navigate('/trips');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: brand.textMuted, fontSize: 13 }}>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.value}</span>
                  </div>
                  <Progress
                    percent={Math.round((row.value / tripTotal) * 100)}
                    showInfo={false}
                    strokeColor={row.color}
                    trailColor={brand.bgMuted}
                    strokeWidth={10}
                  />
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="安全分分布"
            className="stat-card"
            styles={{ header: { borderBottom: `1px solid ${brand.border}` } }}
          >
            <div className="safety-bar">
              {(i.safety_score_dist || []).map((b) => (
                <div className="safety-bar__row" key={b.label}>
                  <span className="safety-bar__label">{b.label}</span>
                  <div className="safety-bar__track">
                    <div
                      className="safety-bar__fill"
                      style={{ width: `${Math.round((b.count / safetyMax) * 100)}%` }}
                    />
                  </div>
                  <span className="safety-bar__count">{b.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
