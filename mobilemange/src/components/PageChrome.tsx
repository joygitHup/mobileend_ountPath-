import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';
import { brand } from '@/theme/tokens';

type PageHeaderProps = {
  title: string;
  description?: string;
  extra?: ReactNode;
};

export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        <Typography.Title level={3} className="page-header__title">
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Text className="page-header__desc">{description}</Typography.Text>
        ) : null}
      </div>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}

type PanelProps = {
  children: ReactNode;
  className?: string;
  flush?: boolean;
};

export function Panel({ children, className = '', flush }: PanelProps) {
  return (
    <div className={`admin-panel ${flush ? 'admin-panel--flush' : ''} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function StatAccent({ color = brand.primary }: { color?: string }) {
  return <span className="stat-accent" style={{ background: color }} />;
}
